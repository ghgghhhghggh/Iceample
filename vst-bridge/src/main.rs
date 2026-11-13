// ════════════════════════════════════════════════════════════════════════════
//  iceample-vst-bridge — 32-bit out-of-process VST2 host
//
//  A 64-bit process cannot LoadLibrary a 32-bit plugin DLL. This standalone
//  *32-bit* executable is spawned by the main (64-bit) Iceample app to host such
//  plugins: it loads the DLL in-process (32-bit → 32-bit, always allowed), opens
//  the plugin editor, optionally opens its own audio output, and receives MIDI
//  from the parent over a localhost TCP socket.
//
//  CLI:
//    iceample-vst-bridge --path <dll> --name <title> [--port <n>] [--audio]
//
//  IPC (parent → bridge, 4-byte frames over TCP):
//    [1, status, data1, data2]  → MIDI message
//    [2,   0,    0,     0    ]  → shutdown (close editor)
//  The bridge also shuts down when the socket reaches EOF (parent died).
// ════════════════════════════════════════════════════════════════════════════

#![cfg_attr(not(windows), allow(unused))]

use std::ffi::c_void;
use std::sync::atomic::{AtomicUsize, Ordering};

// ── Diagnostic logging (to %TEMP%\iceample-vst-bridge.log) ───────────────────
fn log_line(s: &str) {
    use std::io::Write;
    // Diagnostic logging is opt-in: the parent only sets this in debug builds, so
    // released apps never write a log file.
    if std::env::var_os("ICEAMPLE_BRIDGE_LOG").is_none() { return; }
    let path = std::env::temp_dir().join("iceample-vst-bridge.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let pid = std::process::id();
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis()).unwrap_or(0);
        let _ = writeln!(f, "[{t} pid={pid}] {s}");
    }
}
macro_rules! blog { ($($a:tt)*) => { log_line(&format!($($a)*)) } }

// ── VST2 ABI ─────────────────────────────────────────────────────────────────
const VST_MAGIC: i32         = 0x5673_7450; // 'VstP'
const EFF_OPEN: i32          = 0;
const EFF_CLOSE: i32         = 1;
const EFF_SET_SAMPLE_RATE: i32 = 10;
const EFF_SET_BLOCK_SIZE: i32  = 11;
const EFF_MAINS_CHANGED: i32   = 12;
const EFF_EDIT_GET_RECT: i32 = 13;
const EFF_EDIT_OPEN: i32     = 14;
const EFF_EDIT_CLOSE: i32    = 15;
const EFF_PROCESS_EVENTS: i32 = 25;

#[repr(C)]
struct AEffect {
    magic:          i32,
    dispatcher:     Option<unsafe extern "C" fn(*mut AEffect, i32, i32, isize, *mut c_void, f32) -> isize>,
    _process:       *const c_void,
    _set_parameter: *const c_void,
    _get_parameter: *const c_void,
    num_programs: i32, num_params: i32, num_inputs: i32, num_outputs: i32, flags: i32,
    _resvd1: isize, _resvd2: isize,
    _initial_delay: i32, _real_q: i32, _off_q: i32, _io_ratio: f32,
    _object: *mut c_void, _user: *mut c_void,
    _unique_id: i32, _version: i32,
    _process_replacing: *const c_void,
    _process_double:    *const c_void,
    _future: [u8; 56],
}

type VstPluginMain = unsafe extern "C" fn(
    unsafe extern "C" fn(*mut AEffect, i32, i32, isize, *mut c_void, f32) -> isize,
) -> *mut AEffect;

unsafe extern "C" fn host_callback(
    _e: *mut AEffect, opcode: i32, _i: i32, _v: isize, p: *mut c_void, _o: f32,
) -> isize {
    match opcode {
        1  => 2400, // audioMasterVersion → VST 2.4
        6  => 1,    // audioMasterWantMidi
        7  => {     // audioMasterGetTime → pointer to a VstTimeInfo
            let sr = sample_rate_hz();
            let tempo = tempo_bpm();
            let pos = SAMPLE_POS.load(Ordering::Relaxed) as f64;
            let ppq = if sr > 0.0 { pos / sr * (tempo / 60.0) } else { 0.0 };
            let bar = (ppq / 4.0).floor() * 4.0; // 4/4
            TINFO.with(|c| {
                let ti = c.get();
                unsafe {
                    (*ti).sample_pos = pos;
                    (*ti).sample_rate = sr;
                    (*ti).ppq_pos = ppq;
                    (*ti).tempo = tempo;
                    (*ti).bar_start_pos = bar;
                    (*ti).time_sig_numerator = 4;
                    (*ti).time_sig_denominator = 4;
                    (*ti).flags = VST_TRANSPORT_PLAYING | VST_PPQ_POS_VALID
                        | VST_TEMPO_VALID | VST_BARS_VALID | VST_TIME_SIG_VALID;
                    ti as isize
                }
            })
        }
        8  => {     // audioMasterProcessEvents → plugin emits MIDI to the host
            if !p.is_null() {
                let evs = p as *const VstEventsFixed;
                let n = unsafe { (*evs).num_events }.clamp(0, 32) as usize;
                EMITTED.with(|cell| {
                    let mut v = cell.borrow_mut();
                    for i in 0..n {
                        let ev = unsafe { (*evs).events[i] } as *const VstMidiEvent;
                        if !ev.is_null() && unsafe { (*ev).event_type } == 1 {
                            let md = unsafe { (*ev).midi_data };
                            v.push([md[0] as u8, md[1] as u8, md[2] as u8]);
                        }
                    }
                });
            }
            1
        }
        23 => 44100, // audioMasterGetSampleRate
        25 => 512,   // audioMasterGetBlockSize
        33 | 34 => { // vendor / product string
            if !p.is_null() {
                let s = b"Iceample\0";
                std::ptr::copy_nonoverlapping(s.as_ptr(), p as *mut u8, s.len());
            }
            1
        }
        35 => 2400, // vendor version
        42 => 1,    // canDo
        _  => 0,
    }
}

#[repr(C)]
struct ERect { top: i16, left: i16, bottom: i16, right: i16 }

#[repr(C)]
struct VstMidiEvent {
    event_type: i32, byte_size: i32, delta_frames: i32, flags: i32,
    note_length: i32, note_offset: i32, midi_data: [i8; 4],
    detune: i8, note_off_velocity: i8, _r1: i8, _r2: i8,
}

#[repr(C)]
struct VstEventsFixed {
    num_events: i32,
    _reserved: isize,
    events: [*const c_void; 32],
}

// ── Globals for cross-thread shutdown ────────────────────────────────────────
static EDITOR_HWND: AtomicUsize = AtomicUsize::new(0);
static HEADLESS: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

// ── Virtual transport (so arpeggiators / tempo-synced plugins run) ───────────
use std::sync::atomic::AtomicU64;
static SAMPLE_POS: AtomicU64 = AtomicU64::new(0);             // running sample position
static SAMPLE_RATE_BITS: AtomicU64 = AtomicU64::new(0);      // f64 bits, set in start_audio
static TEMPO_BITS: AtomicU64 = AtomicU64::new(0);            // f64 bits, set at startup (0 ⇒ 120)

fn tempo_bpm() -> f64 {
    let b = TEMPO_BITS.load(Ordering::Relaxed);
    if b == 0 { 120.0 } else { f64::from_bits(b) }
}
fn sample_rate_hz() -> f64 {
    let b = SAMPLE_RATE_BITS.load(Ordering::Relaxed);
    if b == 0 { 44100.0 } else { f64::from_bits(b) }
}

// VST2 time-info flags
const VST_TRANSPORT_PLAYING: i32 = 1 << 1;
const VST_PPQ_POS_VALID:     i32 = 1 << 9;
const VST_TEMPO_VALID:       i32 = 1 << 10;
const VST_BARS_VALID:        i32 = 1 << 11;
const VST_TIME_SIG_VALID:    i32 = 1 << 13;

#[repr(C)]
#[derive(Clone, Copy)]
struct VstTimeInfo {
    sample_pos: f64, sample_rate: f64, nanoseconds: f64, ppq_pos: f64,
    tempo: f64, bar_start_pos: f64, cycle_start_pos: f64, cycle_end_pos: f64,
    time_sig_numerator: i32, time_sig_denominator: i32,
    smpte_offset: i32, smpte_frame_rate: i32, samples_to_next_clock: i32, flags: i32,
}
impl VstTimeInfo {
    const fn new() -> Self {
        VstTimeInfo {
            sample_pos: 0.0, sample_rate: 44100.0, nanoseconds: 0.0, ppq_pos: 0.0,
            tempo: 120.0, bar_start_pos: 0.0, cycle_start_pos: 0.0, cycle_end_pos: 0.0,
            time_sig_numerator: 4, time_sig_denominator: 4,
            smpte_offset: 0, smpte_frame_rate: 0, samples_to_next_clock: 0, flags: 0,
        }
    }
}

thread_local! {
    // MIDI events the plugin emits (captured in host_callback during processReplacing).
    static EMITTED: std::cell::RefCell<Vec<[u8; 3]>> = std::cell::RefCell::new(Vec::new());
    // Scratch time-info returned to the plugin from audioMasterGetTime.
    static TINFO: std::cell::UnsafeCell<VstTimeInfo> = std::cell::UnsafeCell::new(VstTimeInfo::new());
}

// Custom window messages (WM_APP = 0x8000).
const WM_APP_SHOW: u32 = 0x8000 + 1; // show the editor window
const WM_APP_QUIT: u32 = 0x8000 + 2; // destroy window → exit process

// ── Send wrappers ────────────────────────────────────────────────────────────
struct SendPtr(*mut AEffect);
unsafe impl Send for SendPtr {}
impl SendPtr {
    // Method call forces the whole wrapper to be captured by closures
    // (avoids Rust 2021 disjoint-capture of the inner non-Send `*mut`).
    fn raw(&self) -> *mut AEffect { self.0 }
}

fn main() {
    std::panic::set_hook(Box::new(|info| {
        blog!("PANIC: {}", info);
    }));
    let args = parse_args();
    blog!("=== bridge start: audio={} headless={} port={:?} ===", args.audio, args.headless, args.port);
    let path = match args.path {
        Some(p) => p,
        None => { eprintln!("[bridge] missing --path"); std::process::exit(2); }
    };
    let name = args.name.unwrap_or_else(|| "VST".to_string());

    #[cfg(not(windows))]
    {
        eprintln!("[bridge] Windows only");
        std::process::exit(1);
    }

    #[cfg(windows)]
    {
        HEADLESS.store(args.headless, std::sync::atomic::Ordering::SeqCst);
        match run(&path, &name, args.port, args.audio, args.headless) {
            Err(e) => {
                blog!("run() ERROR: {}", e);
                eprintln!("[bridge] ERROR: {}", e);
                std::process::exit(1);
            }
            Ok(()) => blog!("run() returned Ok — process exiting normally"),
        }
    }
}

struct Args {
    path: Option<String>,
    name: Option<String>,
    port: Option<u16>,
    audio: bool,
    headless: bool,
}

fn parse_args() -> Args {
    let mut a = Args { path: None, name: None, port: None, audio: false, headless: false };
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--path"     => a.path = it.next(),
            "--name"     => a.name = it.next(),
            "--port"     => a.port = it.next().and_then(|s| s.parse().ok()),
            "--audio"    => a.audio = true,
            "--headless" => a.headless = true,
            _ => {}
        }
    }
    a
}

#[cfg(windows)]
fn run(path: &str, name: &str, port: Option<u16>, audio: bool, headless: bool) -> Result<(), String> {
    use winapi::um::objbase::CoInitialize;

    unsafe { CoInitialize(std::ptr::null_mut()); }

    // ── Load the 32-bit plugin (works: 32-bit host loading 32-bit DLL) ───────
    blog!("loading DLL: {}", path);
    let lib = unsafe { libloading::Library::new(path) }
        .map_err(|e| format!("Chargement impossible: {}", e))?;

    let effect = unsafe {
        let vst_main: libloading::Symbol<VstPluginMain> = lib
            .get(b"VSTPluginMain\0")
            .or_else(|_| lib.get(b"main\0"))
            .map_err(|_| "Export VSTPluginMain introuvable".to_string())?;
        vst_main(host_callback)
    };
    if effect.is_null() || unsafe { (*effect).magic } != VST_MAGIC {
        return Err("Plugin VST2 invalide (magic incorrect)".to_string());
    }
    let dispatch = unsafe { (*effect).dispatcher }.ok_or("Dispatcher null")?;
    let (n_in, n_out, flags) = unsafe { ((*effect).num_inputs, (*effect).num_outputs, (*effect).flags) };
    blog!("plugin ok: num_inputs={} num_outputs={} flags=0x{:x} has_editor={}", n_in, n_out, flags, flags & 1 != 0);

    unsafe {
        dispatch(effect, EFF_OPEN, 0, 0, std::ptr::null_mut(), 0.0);
    }
    blog!("effOpen done");

    // ── MIDI channel (socket thread → audio callback) ────────────────────────
    let (midi_tx, midi_rx) = crossbeam_channel::bounded::<[u8; 3]>(1024);
    // ── Reverse MIDI channel (audio callback → socket writer → parent) ───────
    let (mout_tx, mout_rx) = crossbeam_channel::bounded::<[u8; 3]>(1024);
    // Only forward emitted MIDI when we have a socket back to the parent.
    let audio_mout_tx = if port.is_some() { Some(mout_tx) } else { None };

    // ── Optional audio output ────────────────────────────────────────────────
    let _stream = if audio {
        match start_audio(effect, dispatch, midi_rx, audio_mout_tx) {
            Ok(s)  => { blog!("audio started"); Some(s) }
            Err(e) => { blog!("audio disabled: {}", e); eprintln!("[bridge] audio disabled: {}", e); None }
        }
    } else {
        // Still set sample rate / block size so the plugin is initialised.
        unsafe {
            dispatch(effect, EFF_SET_SAMPLE_RATE, 0, 0, std::ptr::null_mut(), 44100.0);
            dispatch(effect, EFF_SET_BLOCK_SIZE, 0, 512, std::ptr::null_mut(), 0.0);
        }
        None
    };

    // ── Socket reader thread (MIDI + shutdown + parent-death detection) ──────
    if let Some(p) = port {
        std::thread::spawn(move || socket_loop(p, midi_tx, mout_rx));
    }

    // ── Editor window on the main thread (same thread as VSTPluginMain) ──────
    blog!("entering open_editor_blocking (headless={})", headless);
    unsafe { open_editor_blocking(effect, dispatch, name, headless); }
    blog!("open_editor_blocking returned → tearing down");

    // ── Teardown ─────────────────────────────────────────────────────────────
    unsafe {
        if audio { dispatch(effect, EFF_MAINS_CHANGED, 0, 0, std::ptr::null_mut(), 0.0); }
        dispatch(effect, EFF_CLOSE, 0, 0, std::ptr::null_mut(), 0.0);
    }
    drop(_stream);
    drop(lib);
    Ok(())
}

// ── Audio: play the plugin's output, feeding queued MIDI ─────────────────────
#[cfg(windows)]
fn start_audio(
    effect: *mut AEffect,
    dispatch: unsafe extern "C" fn(*mut AEffect, i32, i32, isize, *mut c_void, f32) -> isize,
    midi_rx: crossbeam_channel::Receiver<[u8; 3]>,
    midi_out_tx: Option<crossbeam_channel::Sender<[u8; 3]>>,
) -> Result<cpal::Stream, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    let host = cpal::default_host();
    let device = host.default_output_device().ok_or("No output device")?;
    let supported = device.default_output_config().map_err(|e| e.to_string())?;
    let sample_rate = supported.sample_rate().0;
    let channels = supported.channels() as usize;
    SAMPLE_RATE_BITS.store((sample_rate as f64).to_bits(), Ordering::Relaxed);
    let config = cpal::StreamConfig {
        channels: supported.channels(),
        sample_rate: supported.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };

    unsafe {
        dispatch(effect, EFF_SET_SAMPLE_RATE, 0, 0, std::ptr::null_mut(), sample_rate as f32);
        dispatch(effect, EFF_SET_BLOCK_SIZE, 0, 512, std::ptr::null_mut(), 0.0);
        dispatch(effect, EFF_MAINS_CHANGED, 0, 1, std::ptr::null_mut(), 0.0);
    }

    let eff = SendPtr(effect);
    let stream = device.build_output_stream(
        &config,
        move |data: &mut [f32], _| {
            let effect = eff.raw();
            let frames = if channels > 0 { data.len() / channels } else { data.len() / 2 };

            let mut midi_evs: Vec<VstMidiEvent> = Vec::new();
            while let Ok(m) = midi_rx.try_recv() {
                if midi_evs.len() < 32 {
                    midi_evs.push(VstMidiEvent {
                        event_type: 1,
                        byte_size: std::mem::size_of::<VstMidiEvent>() as i32,
                        delta_frames: 0, flags: 1, note_length: 0, note_offset: 0,
                        midi_data: [m[0] as i8, m[1] as i8, m[2] as i8, 0],
                        detune: 0, note_off_velocity: 0, _r1: 0, _r2: 0,
                    });
                }
            }
            if !midi_evs.is_empty() {
                unsafe {
                    let mut evs = VstEventsFixed { num_events: midi_evs.len() as i32, _reserved: 0, events: [std::ptr::null(); 32] };
                    for (i, e) in midi_evs.iter().enumerate() {
                        evs.events[i] = e as *const VstMidiEvent as *const c_void;
                    }
                    if let Some(d) = (*effect).dispatcher {
                        d(effect, EFF_PROCESS_EVENTS, 0, 0, &mut evs as *mut VstEventsFixed as *mut c_void, 0.0);
                    }
                }
            }

            let mut in_l = vec![0.0f32; frames];
            let mut in_r = vec![0.0f32; frames];
            let mut out_l = vec![0.0f32; frames];
            let mut out_r = vec![0.0f32; frames];
            let mut in_ptrs = [in_l.as_mut_ptr(), in_r.as_mut_ptr()];
            let mut out_ptrs = [out_l.as_mut_ptr(), out_r.as_mut_ptr()];

            unsafe {
                if !(*effect)._process_replacing.is_null() {
                    let process_fn: unsafe extern "C" fn(*mut AEffect, *mut *mut f32, *mut *mut f32, i32) =
                        std::mem::transmute((*effect)._process_replacing);
                    process_fn(effect, in_ptrs.as_mut_ptr(), out_ptrs.as_mut_ptr(), frames as i32);
                }
            }
            // Forward any MIDI the plugin emitted this block (e.g. an arpeggiator)
            // back to the parent so its own synth can play it.
            EMITTED.with(|cell| {
                let mut v = cell.borrow_mut();
                if !v.is_empty() {
                    if let Some(tx) = &midi_out_tx {
                        for m in v.iter() { let _ = tx.try_send(*m); }
                    }
                    v.clear();
                }
            });
            // Advance the virtual transport so tempo-synced plugins keep running.
            SAMPLE_POS.fetch_add(frames as u64, Ordering::Relaxed);

            for i in 0..frames {
                for ch in 0..channels {
                    let s = if ch % 2 == 0 { out_l[i] } else { out_r[i] };
                    data[i * channels + ch] = s.clamp(-1.0, 1.0);
                }
            }
        },
        |err| eprintln!("[bridge] audio error: {}", err),
        None,
    ).map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;
    Ok(stream)
}

// ── Socket: receive MIDI / shutdown from the parent ──────────────────────────
fn socket_loop(
    port: u16,
    midi_tx: crossbeam_channel::Sender<[u8; 3]>,
    midi_out_rx: crossbeam_channel::Receiver<[u8; 3]>,
) {
    use std::io::Read;
    let stream = match std::net::TcpStream::connect(("127.0.0.1", port)) {
        Ok(s) => s,
        Err(e) => { blog!("socket connect failed: {}", e); eprintln!("[bridge] socket connect failed: {}", e); return; }
    };
    blog!("socket connected to parent on port {}", port);
    // Writer thread: push plugin-emitted MIDI back to the parent as [1,s,d1,d2].
    if let Ok(wstream) = stream.try_clone() {
        std::thread::spawn(move || {
            use std::io::Write;
            let mut w = wstream;
            while let Ok(m) = midi_out_rx.recv() {
                let frame = [1u8, m[0], m[1], m[2]];
                if w.write_all(&frame).and_then(|_| w.flush()).is_err() { break; }
            }
        });
    }
    let mut stream = stream;
    let mut frame = [0u8; 4];
    loop {
        match stream.read_exact(&mut frame) {
            Ok(()) => match frame[0] {
                1 => { let _ = midi_tx.try_send([frame[1], frame[2], frame[3]]); }
                2 => { blog!("socket: shutdown frame → quit"); post_msg(WM_APP_QUIT); return; }
                3 => { blog!("socket: show-editor frame"); post_msg(WM_APP_SHOW); }
                4 => { // set tempo (BPM as little-endian u16) for tempo-synced plugins
                    let bpm = frame[1] as u16 | ((frame[2] as u16) << 8);
                    if (20..=400).contains(&bpm) {
                        TEMPO_BITS.store((bpm as f64).to_bits(), Ordering::Relaxed);
                    }
                }
                _ => {}
            },
            Err(e) => { blog!("socket read error ({}) → parent gone, quit", e); post_msg(WM_APP_QUIT); return; }
        }
    }
}

#[cfg(windows)]
fn post_msg(msg: u32) {
    use winapi::um::winuser::PostMessageW;
    let hwnd = EDITOR_HWND.load(Ordering::SeqCst);
    if hwnd != 0 {
        unsafe { PostMessageW(hwnd as winapi::shared::windef::HWND, msg, 0, 0); }
    }
}
#[cfg(not(windows))]
fn post_msg(_msg: u32) {}

// ── Editor window (blocks on the message loop until the window is destroyed) ──
// `headless` = window starts hidden; shown on WM_APP_SHOW, hidden (not destroyed)
// on close, and destroyed only on WM_APP_QUIT. Used for the instrument path so
// closing the editor never stops the audio.
#[cfg(windows)]
unsafe fn open_editor_blocking(
    effect: *mut AEffect,
    dispatch: unsafe extern "C" fn(*mut AEffect, i32, i32, isize, *mut c_void, f32) -> isize,
    name: &str,
    headless: bool,
) {
    use winapi::um::winuser::*;
    use winapi::um::libloaderapi::GetModuleHandleW;

    let has_editor = (*effect).flags & 1 != 0;

    // Editor button on a plugin without GUI → nothing to show, nothing to keep alive.
    if !has_editor && !headless {
        eprintln!("[bridge] plugin has no editor");
        return;
    }

    let class_name: Vec<u16> = "IceampleVSTBridge\0".encode_utf16().collect();
    let title: Vec<u16> = format!("{}\0", name).encode_utf16().collect();
    let hinst = GetModuleHandleW(std::ptr::null());

    let wc = WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(wnd_proc),
        cbClsExtra: 0, cbWndExtra: 0, hInstance: hinst,
        hIcon: std::ptr::null_mut(),
        hCursor: LoadCursorW(std::ptr::null_mut(), IDC_ARROW),
        hbrBackground: (COLOR_WINDOW + 1) as *mut _,
        lpszMenuName: std::ptr::null(), lpszClassName: class_name.as_ptr(),
    };
    RegisterClassW(&wc);

    // Hidden by default (no WS_VISIBLE); shown explicitly below or via WM_APP_SHOW.
    let style = WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_SIZEBOX;
    let hwnd = CreateWindowExW(
        0, class_name.as_ptr(), title.as_ptr(), style,
        CW_USEDEFAULT, CW_USEDEFAULT, 800, 600,
        std::ptr::null_mut(), std::ptr::null_mut(), hinst, std::ptr::null_mut(),
    );
    if hwnd.is_null() { eprintln!("[bridge] CreateWindow failed"); return; }
    EDITOR_HWND.store(hwnd as usize, Ordering::SeqCst);

    blog!("window created (has_editor={}, headless={})", has_editor, headless);
    if has_editor {
        let mut rect_ptr: *mut ERect = std::ptr::null_mut();
        dispatch(effect, EFF_EDIT_GET_RECT, 0, 0, &mut rect_ptr as *mut *mut ERect as *mut c_void, 0.0);
        blog!("calling effEditOpen");
        dispatch(effect, EFF_EDIT_OPEN, 0, 0, hwnd as *mut c_void, 0.0);
        blog!("effEditOpen returned");
        if rect_ptr.is_null() {
            dispatch(effect, EFF_EDIT_GET_RECT, 0, 0, &mut rect_ptr as *mut *mut ERect as *mut c_void, 0.0);
        }
        if !rect_ptr.is_null() {
            let r = &*rect_ptr;
            let w = (r.right - r.left) as i32;
            let h = (r.bottom - r.top) as i32;
            if w > 0 && h > 0 {
                let mut wr = winapi::shared::windef::RECT { left: 0, top: 0, right: w, bottom: h };
                AdjustWindowRect(&mut wr, style, 0);
                let sw = GetSystemMetrics(SM_CXSCREEN);
                let sh = GetSystemMetrics(SM_CYSCREEN);
                let ww = wr.right - wr.left;
                let wh = wr.bottom - wr.top;
                SetWindowPos(hwnd, HWND_TOPMOST, (sw - ww) / 2, (sh - wh) / 2, ww, wh, SWP_NOACTIVATE);
            }
        }
    }

    if !headless {
        show_window(hwnd);
    }

    blog!("entering message loop");
    let mut msg: MSG = std::mem::zeroed();
    while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    blog!("message loop ended");

    EDITOR_HWND.store(0, Ordering::SeqCst);
    if has_editor { dispatch(effect, EFF_EDIT_CLOSE, 0, 0, std::ptr::null_mut(), 0.0); }
}

#[cfg(windows)]
unsafe fn show_window(hwnd: winapi::shared::windef::HWND) {
    use winapi::um::winuser::*;
    SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
    ShowWindow(hwnd, SW_SHOW);
    UpdateWindow(hwnd);
    SetForegroundWindow(hwnd);
    BringWindowToTop(hwnd);
}

#[cfg(windows)]
unsafe extern "system" fn wnd_proc(
    hwnd: winapi::shared::windef::HWND,
    msg: winapi::shared::minwindef::UINT,
    w: winapi::shared::minwindef::WPARAM,
    l: winapi::shared::minwindef::LPARAM,
) -> winapi::shared::minwindef::LRESULT {
    use winapi::um::winuser::*;
    match msg {
        WM_DESTROY => { PostQuitMessage(0); 0 }
        WM_CLOSE => {
            // Headless (instrument) → just hide so audio keeps playing.
            if HEADLESS.load(Ordering::SeqCst) {
                ShowWindow(hwnd, SW_HIDE);
            } else {
                DestroyWindow(hwnd);
            }
            0
        }
        m if m == WM_APP_SHOW => { show_window(hwnd); 0 }
        m if m == WM_APP_QUIT => { DestroyWindow(hwnd); 0 }
        WM_SIZE => {
            let mut rc: winapi::shared::windef::RECT = std::mem::zeroed();
            GetClientRect(hwnd, &mut rc);
            let cw = rc.right - rc.left;
            let ch = rc.bottom - rc.top;
            if cw > 0 && ch > 0 {
                let child = GetWindow(hwnd, GW_CHILD);
                if !child.is_null() {
                    SetWindowPos(child, std::ptr::null_mut(), 0, 0, cw, ch, SWP_NOZORDER | SWP_NOACTIVATE);
                }
            }
            DefWindowProcW(hwnd, msg, w, l)
        }
        _ => DefWindowProcW(hwnd, msg, w, l),
    }
}
