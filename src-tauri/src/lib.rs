use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;
use tauri_plugin_dialog::DialogExt;
use std::ffi::c_void;

#[derive(Serialize)]
pub struct AudioDevice {
    pub name:  String,
    pub index: usize,
}

#[tauri::command]
fn list_audio_inputs() -> Vec<AudioDevice> {
    let host = cpal::default_host();
    match host.input_devices() {
        Ok(devs) => devs
            .enumerate()
            .filter_map(|(i, d)| d.name().ok().map(|n| AudioDevice { name: n, index: i }))
            .collect(),
        Err(_) => vec![],
    }
}

#[tauri::command]
fn list_audio_outputs() -> Vec<AudioDevice> {
    let host = cpal::default_host();
    match host.output_devices() {
        Ok(devs) => devs
            .enumerate()
            .filter_map(|(i, d)| d.name().ok().map(|n| AudioDevice { name: n, index: i }))
            .collect(),
        Err(_) => vec![],
    }
}

#[tauri::command]
fn list_midi_inputs() -> Vec<String> {
    match midir::MidiInput::new("iceample-scan") {
        Ok(midi) => midi
            .ports()
            .iter()
            .filter_map(|p| midi.port_name(p).ok())
            .collect(),
        Err(_) => vec![],
    }
}

const LIBRARY_FOLDERS: &[&str] = &["Importés", "Modifiés", "Sons", "Voix", "Images", "3D", "Séquences", "Séquences Audio", "Sonneries", "Pistes"];

// Every extension any tool persists into a library folder. Used both when
// browsing a folder and when searching, so a file type is either visible
// everywhere or nowhere — never silently dropped in just one of the two.
const BROWSABLE_EXTS: &[&str] = &[
    // Audio
    "wav", "mp3", "flac", "ogg", "aiff", "aif", "m4a",
    // Images
    "png", "jpg", "jpeg", "webp", "gif", "bmp",
    // Video
    "mp4", "mov", "webm", "mkv", "avi", "m4v",
    // Camera RAW (opened by the RAW tool)
    "cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "dng", "srw", "pef",
    // 3D
    "glb",
    // Project / sequence files
    "iceseq", "icedaw", "icemic", "icevid", "iceimg",
    // Ringtones
    "m4r",
];

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(base64_encode(&buf))
}

fn base64_decode(s: &str) -> Vec<u8> {
    let mut table = [255u8; 128];
    for (i, &c) in b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".iter().enumerate() {
        table[c as usize] = i as u8;
    }
    let bytes: Vec<u8> = s.bytes()
        .filter(|&b| b != b'=' && (b as usize) < 128 && table[b as usize] != 255)
        .map(|b| table[b as usize])
        .collect();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    for chunk in bytes.chunks(4) {
        let b = [
            chunk.get(0).copied().unwrap_or(0),
            chunk.get(1).copied().unwrap_or(0),
            chunk.get(2).copied().unwrap_or(0),
            chunk.get(3).copied().unwrap_or(0),
        ];
        if chunk.len() >= 2 { out.push((b[0] << 2) | (b[1] >> 4)); }
        if chunk.len() >= 3 { out.push((b[1] << 4) | (b[2] >> 2)); }
        if chunk.len() >= 4 { out.push((b[2] << 6) |  b[3]);       }
    }
    out
}

#[tauri::command]
fn save_binary_file(path: String, base64: String) -> Result<(), String> {
    let bytes = base64_decode(&base64);
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[allow(dead_code)]
fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        out.push(CHARS[b0 >> 2] as char);
        out.push(CHARS[((b0 & 3) << 4) | (b1 >> 4)] as char);
        out.push(if chunk.len() > 1 { CHARS[((b1 & 0xf) << 2) | (b2 >> 6)] as char } else { '=' });
        out.push(if chunk.len() > 2 { CHARS[b2 & 0x3f] as char } else { '=' });
    }
    out
}

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub is_dir: bool,
}

#[tauri::command]
fn list_folder_contents(path: String) -> Vec<FileEntry> {
    let mut dirs:  Vec<FileEntry> = Vec::new();
    let mut files: Vec<FileEntry> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&path) {
        for e in entries.filter_map(|e| e.ok()) {
            let p = e.path();
            let name = match p.file_name() { Some(n) => n.to_string_lossy().to_string(), None => continue };
            if p.is_dir() {
                dirs.push(FileEntry { name, path: p.to_string_lossy().to_string(), is_dir: true });
            } else if let Some(ext) = p.extension().and_then(|x| x.to_str()) {
                if BROWSABLE_EXTS.contains(&ext.to_lowercase().as_str()) {
                    files.push(FileEntry { name, path: p.to_string_lossy().to_string(), is_dir: false });
                }
            }
        }
    }
    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.extend(files);   // folders first, then audio files
    dirs
}

#[derive(Serialize)]
pub struct PickedFile {
    pub name: String,
    pub path: String,
}

#[tauri::command]
fn pick_audio_file(app: tauri::AppHandle) -> Option<PickedFile> {
    app.dialog()
        .file()
        .add_filter("Audio", &["wav","mp3","flac","ogg","aiff","aif","m4a"])
        .blocking_pick_file()
        .map(|p| {
            let path = p.to_string();
            let name = std::path::Path::new(&path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("fichier")
                .to_string();
            PickedFile { name, path }
        })
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&new_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_file(src: String, dst: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&dst).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn pick_multiple_audio_files(app: tauri::AppHandle) -> Vec<PickedFile> {
    app.dialog()
        .file()
        .add_filter("Audio", &["wav","mp3","flac","ogg","aiff","aif","m4a"])
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|p| {
            let path = p.to_string();
            let name = std::path::Path::new(&path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("fichier")
                .to_string();
            PickedFile { name, path }
        })
        .collect()
}

fn sidecar_path(name: &str) -> std::path::PathBuf {
    let exe_name = format!("{}.exe", name);
    // Cherche d'abord à côté de l'exécutable (build de prod)
    if let Ok(exe) = std::env::current_exe() {
        let sibling = exe.parent().unwrap_or(std::path::Path::new(".")).join(&exe_name);
        if sibling.exists() { return sibling; }
    }
    // Fallback : PATH système (dev ou déjà installé)
    std::path::PathBuf::from(name)
}

#[tauri::command]
async fn update_ytdlp() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let yt_dlp = sidecar_path("yt-dlp");
        let out = std::process::Command::new(&yt_dlp)
            .args(["-U"])
            .output()
            .map_err(|_| "Impossible de lancer yt-dlp".to_string())?;
        let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
        let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
        if out.status.success() || stdout.contains("up-to-date") || stdout.contains("Updated") {
            Ok(stdout + &stderr)
        } else {
            Err(stdout + &stderr)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn download_audio_yt(url: String, output_dir: String, browser: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let template = format!("{}/import_{}.%(ext)s", output_dir, ts);
        let yt_dlp   = sidecar_path("yt-dlp");
        let ffmpeg   = sidecar_path("ffmpeg");
        let ffmpeg_s = ffmpeg.to_str().unwrap_or("ffmpeg").to_string();
        let mut cmd  = std::process::Command::new(&yt_dlp);
        cmd.args(["-x", "--audio-format", "wav", "--no-playlist",
                  "--ffmpeg-location", &ffmpeg_s,
                  "--js-runtimes", "node"]);
        if let Some(br) = browser {
            if !br.is_empty() { cmd.arg("--cookies-from-browser").arg(&br); }
        }
        cmd.arg("--output").arg(&template).arg(&url);
        let out = cmd.output()
            .map_err(|_| "Erreur lors du lancement de yt-dlp".to_string())?;
        let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
        if out.status.success() {
            Ok(format!("import_{}.wav", ts))
        } else {
            Err(stderr)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct SearchEntry {
    pub name:   String,
    pub path:   String,
    pub folder: String,
}

#[tauri::command]
fn search_library(root: String, query: String) -> Vec<SearchEntry> {
    let q = query.to_lowercase();
    let mut results = Vec::new();
    for folder in LIBRARY_FOLDERS {
        let folder_path = format!("{}/{}", root, folder);
        if let Ok(entries) = std::fs::read_dir(&folder_path) {
            for entry in entries.filter_map(|e| e.ok()) {
                let p = entry.path();
                if !p.is_file() { continue; }
                let name = match p.file_name().and_then(|n| n.to_str()) {
                    Some(n) => n.to_string(),
                    None => continue,
                };
                let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                if !BROWSABLE_EXTS.contains(&ext.as_str()) { continue; }
                if name.to_lowercase().contains(&q) {
                    results.push(SearchEntry {
                        name,
                        path: p.to_string_lossy().to_string(),
                        folder: folder.to_string(),
                    });
                }
            }
        }
    }
    results
}

#[tauri::command]
fn pick_and_setup_library(app: tauri::AppHandle) -> Result<String, String> {
    let path = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .ok_or_else(|| "Annulé".to_string())?;

    let root = path.to_string();
    for name in LIBRARY_FOLDERS {
        std::fs::create_dir_all(format!("{}/{}", root, name)).map_err(|e| e.to_string())?;
    }
    Ok(root)
}

/// Create (if needed) a default library under the user's Documents folder and
/// return its path. Lets the library work out of the box, no dialog required.
#[tauri::command]
fn setup_default_library(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let base = app.path().document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    let root = base.join("Iceample");
    for name in LIBRARY_FOLDERS {
        std::fs::create_dir_all(root.join(name)).map_err(|e| e.to_string())?;
    }
    Ok(root.to_string_lossy().to_string())
}

/// Pick any folder (no structure created) — used to bookmark the user's own folders.
#[tauri::command]
fn pick_folder(app: tauri::AppHandle) -> Option<String> {
    app.dialog().file().blocking_pick_folder().map(|p| p.to_string())
}

/// Open a folder in the OS file manager.
#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    #[cfg(windows)]
    { std::process::Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?; }
    #[cfg(all(unix, not(target_os = "macos")))]
    { std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?; }
    Ok(())
}

// ── VST Host ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct VstInfo {
    pub name: String,
    pub vendor: String,
    pub path: String,
    pub format: String,
}

fn scan_folder_vst(dir: &str, out: &mut Vec<VstInfo>, depth: u32) {
    if depth > 3 { return }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for entry in rd.filter_map(|e| e.ok()) {
        let path = entry.path();
        let ext  = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string();
        if path.is_file() {
            match ext.as_str() {
                "dll"  => out.push(VstInfo { name: stem, vendor: String::new(), path: path.to_string_lossy().into_owned(), format: "vst2".into() }),
                "clap" => out.push(VstInfo { name: stem, vendor: String::new(), path: path.to_string_lossy().into_owned(), format: "clap".into() }),
                _ => {}
            }
        } else if path.is_dir() {
            if ext == "vst3" {
                out.push(VstInfo { name: stem, vendor: String::new(), path: path.to_string_lossy().into_owned(), format: "vst3".into() });
            } else {
                scan_folder_vst(&path.to_string_lossy(), out, depth + 1);
            }
        }
    }
}

#[tauri::command]
fn scan_vsts(extra_paths: Vec<String>) -> Vec<VstInfo> {
    let mut results = Vec::new();
    let defaults: &[&str] = &[
        r"C:\Program Files\VSTPlugins",
        r"C:\Program Files\Steinberg\VSTPlugins",
        r"C:\Program Files\Common Files\VST2",
        r"C:\Program Files (x86)\VSTPlugins",
        r"C:\Program Files (x86)\Steinberg\VSTPlugins",
        r"C:\Program Files\Common Files\VST3",
        r"C:\Program Files (x86)\Common Files\VST3",
        r"C:\Program Files\Common Files\CLAP",
        r"C:\Program Files (x86)\Common Files\CLAP",
    ];
    for p in defaults        { scan_folder_vst(p, &mut results, 0); }
    for p in &extra_paths    { scan_folder_vst(p, &mut results, 0); }
    let mut seen = std::collections::HashSet::new();
    results.retain(|v| seen.insert(v.path.clone()));
    results.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    results
}

#[tauri::command]
fn pick_vst_folder(app: tauri::AppHandle) -> Option<String> {
    app.dialog().file().blocking_pick_folder().map(|p| p.to_string())
}

/// Let the user pick any plugin file directly (e.g. a 32-bit VST on the Desktop
/// that isn't in a scanned folder). Returns its VstInfo with the format inferred
/// from the extension.
#[tauri::command]
fn pick_vst_file(app: tauri::AppHandle) -> Option<VstInfo> {
    let picked = app.dialog().file()
        .add_filter("Plugins (VST2 / VST3 / CLAP)", &["dll", "vst3", "clap"])
        .blocking_pick_file()?;
    let path = picked.to_string();
    let p    = std::path::Path::new(&path);
    let ext  = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("VST").to_string();
    let format = match ext.as_str() { "clap" => "clap", "vst3" => "vst3", _ => "vst2" };
    Some(VstInfo { name: stem, vendor: String::new(), path, format: format.into() })
}

// ── VST2 AEffect ──────────────────────────────────────────────────────────────

const VST_MAGIC: i32          = 0x56737450;
const EFF_OPEN: i32           = 0;
const EFF_CLOSE: i32          = 1;
const EFF_EDIT_GET_RECT: i32  = 13;
const EFF_EDIT_OPEN: i32      = 14;
const EFF_EDIT_CLOSE: i32     = 15;
const EFF_GET_CHUNK: i32      = 23;  // effGetChunk — dump full plugin state
const EFF_SET_CHUNK: i32      = 24;  // effSetChunk — restore plugin state
const FLAG_PROGRAM_CHUNKS: i32 = 0x20; // kPluginProgramChunks

// ── VST2 effect state (saved from GUI, restored before offline processing) ────
enum VstEffectState {
    Chunk(Vec<u8>),
    Params(Vec<f32>),
}
static VST_EFFECT_STATES: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, VstEffectState>>>
    = std::sync::OnceLock::new();
fn vst_effect_states() -> &'static std::sync::Mutex<std::collections::HashMap<String, VstEffectState>> {
    VST_EFFECT_STATES.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

/// Save VST2 state after GUI close (chunk if supported, else parameter dump).
unsafe fn save_vst2_effect_state(path: &str, effect: *mut AEffect) {
    let dispatch = match (*effect).dispatcher { Some(f) => f, None => return };
    let state = if (*effect).flags & FLAG_PROGRAM_CHUNKS != 0 {
        let mut chunk_ptr: *mut c_void = std::ptr::null_mut();
        let size = dispatch(effect, EFF_GET_CHUNK, 0, 0,
            &mut chunk_ptr as *mut _ as *mut c_void, 0.0) as usize;
        if size > 0 && !chunk_ptr.is_null() {
            VstEffectState::Chunk(std::slice::from_raw_parts(chunk_ptr as *const u8, size).to_vec())
        } else { return }
    } else {
        let n = (*effect).num_params as usize;
        if n == 0 || (*effect)._get_parameter.is_null() { return }
        let get_p: unsafe extern "C" fn(*mut AEffect, i32) -> f32 =
            std::mem::transmute((*effect)._get_parameter);
        VstEffectState::Params((0..n as i32).map(|i| get_p(effect, i)).collect())
    };
    if let Ok(mut map) = vst_effect_states().lock() {
        map.insert(path.to_string(), state);
    }
}

/// Restore saved VST2 state before offline processing.
unsafe fn restore_vst2_effect_state(path: &str, effect: *mut AEffect) {
    let dispatch = match (*effect).dispatcher { Some(f) => f, None => return };
    let map = match vst_effect_states().lock() { Ok(m) => m, Err(_) => return };
    match map.get(path) {
        Some(VstEffectState::Chunk(data)) => {
            let ptr = data.as_ptr() as *mut c_void;
            dispatch(effect, EFF_SET_CHUNK, 0, data.len() as isize, ptr, 0.0);
        }
        Some(VstEffectState::Params(params)) => {
            if !(*effect)._set_parameter.is_null() {
                let set_p: unsafe extern "C" fn(*mut AEffect, i32, f32) =
                    std::mem::transmute((*effect)._set_parameter);
                for (i, &v) in params.iter().enumerate() {
                    set_p(effect, i as i32, v);
                }
            }
        }
        None => {}
    }
}

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
    unsafe extern "C" fn(*mut AEffect, i32, i32, isize, *mut c_void, f32) -> isize
) -> *mut AEffect;

unsafe extern "C" fn vst2_host_callback(
    _e: *mut AEffect, opcode: i32, _i: i32, v: isize, p: *mut c_void, o: f32,
) -> isize {
    match opcode {
        1  => 2400,   // audioMasterVersion → VST 2.4
        6  => 1,      // audioMasterWantMidi
        23 => {       // audioMasterGetSampleRate
            let _ = o; 44100
        }
        25 => 512,    // audioMasterGetBlockSize
        33 => {       // audioMasterGetVendorString
            if !p.is_null() {
                let s = b"Iceample\0";
                std::ptr::copy_nonoverlapping(s.as_ptr(), p as *mut u8, s.len());
            }
            1
        }
        34 => {       // audioMasterGetProductString
            if !p.is_null() {
                let s = b"Iceample\0";
                std::ptr::copy_nonoverlapping(s.as_ptr(), p as *mut u8, s.len());
            }
            1
        }
        35 => 2400,   // audioMasterGetVendorVersion
        42 => 1,      // audioMasterCanDo
        _  => { let _ = v; 0 }
    }
}

#[repr(C)]
struct ERect { top: i16, left: i16, bottom: i16, right: i16 }

// ── Win32 VST2 editor window (Windows only) ───────────────────────────────────

#[cfg(windows)]
fn open_vst2_window(path: String, name: String) -> Result<(), String> {
    use winapi::um::winuser::*;
    use winapi::um::libloaderapi::GetModuleHandleW;

    unsafe {
        let lib = libloading::Library::new(&path)
            .map_err(|e| format!("Chargement impossible: {}", e))?;

        let vst_main: libloading::Symbol<VstPluginMain> = lib
            .get(b"VSTPluginMain\0")
            .or_else(|_| lib.get(b"main\0"))
            .map_err(|_| "Export VSTPluginMain introuvable".to_string())?;

        let effect = vst_main(vst2_host_callback);
        if effect.is_null() || (*effect).magic != VST_MAGIC {
            return Err("Plugin VST2 invalide (magic incorrect)".to_string());
        }
        let dispatch = (*effect).dispatcher.ok_or("Dispatcher null")?;
        dispatch(effect, EFF_OPEN, 0, 0, std::ptr::null_mut(), 0.0);

        let class_name: Vec<u16> = "IceampleVST\0".encode_utf16().collect();
        let title:      Vec<u16> = format!("{}\0", name).encode_utf16().collect();
        let hinst = GetModuleHandleW(std::ptr::null());

        let wc = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(vst_wnd_proc),
            cbClsExtra: 0, cbWndExtra: 0, hInstance: hinst,
            hIcon: std::ptr::null_mut(),
            hCursor: LoadCursorW(std::ptr::null_mut(), IDC_ARROW),
            hbrBackground: (COLOR_WINDOW + 1) as *mut _,
            lpszMenuName: std::ptr::null(), lpszClassName: class_name.as_ptr(),
        };
        RegisterClassW(&wc);

        let style = WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_SIZEBOX;
        let hwnd = CreateWindowExW(
            0, class_name.as_ptr(), title.as_ptr(), style,
            CW_USEDEFAULT, CW_USEDEFAULT, 800, 600,
            std::ptr::null_mut(), std::ptr::null_mut(), hinst, std::ptr::null_mut(),
        );
        if hwnd.is_null() { return Err("Impossible de créer la fenêtre VST".to_string()); }

        // Get editor rect BEFORE opening (some VSTs require this order)
        let mut rect_ptr: *mut ERect = std::ptr::null_mut();
        dispatch(effect, EFF_EDIT_GET_RECT, 0, 0,
            &mut rect_ptr as *mut *mut ERect as *mut c_void, 0.0);

        dispatch(effect, EFF_EDIT_OPEN, 0, 0, hwnd as *mut c_void, 0.0);

        // If rect was null before open, try again after
        if rect_ptr.is_null() {
            dispatch(effect, EFF_EDIT_GET_RECT, 0, 0,
                &mut rect_ptr as *mut *mut ERect as *mut c_void, 0.0);
        }

        if !rect_ptr.is_null() {
            let r = &*rect_ptr;
            let w = (r.right  - r.left) as i32;
            let h = (r.bottom - r.top)  as i32;
            if w > 0 && h > 0 {
                let mut wr = winapi::shared::windef::RECT { left: 0, top: 0, right: w, bottom: h };
                AdjustWindowRect(&mut wr, style, 0);
                // Center on screen
                let sw = GetSystemMetrics(SM_CXSCREEN);
                let sh = GetSystemMetrics(SM_CYSCREEN);
                let ww = wr.right - wr.left;
                let wh = wr.bottom - wr.top;
                let x  = (sw - ww) / 2;
                let y  = (sh - wh) / 2;
                SetWindowPos(hwnd, HWND_TOPMOST, x, y, ww, wh, SWP_SHOWWINDOW);
            }
        }

        // Force window to top regardless of focus rules
        SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
        ShowWindow(hwnd, SW_SHOW);
        UpdateWindow(hwnd);
        SetForegroundWindow(hwnd);
        BringWindowToTop(hwnd);

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        // ── Save state before the instance is destroyed ───────────────────────
        save_vst2_effect_state(&path, effect);

        dispatch(effect, EFF_EDIT_CLOSE, 0, 0, std::ptr::null_mut(), 0.0);
        dispatch(effect, EFF_CLOSE,      0, 0, std::ptr::null_mut(), 0.0);
        // lib dropped here, plugin unloaded
    }
    Ok(())
}

#[cfg(windows)]
unsafe extern "system" fn vst_wnd_proc(
    hwnd: winapi::shared::windef::HWND,
    msg:  winapi::shared::minwindef::UINT,
    w:    winapi::shared::minwindef::WPARAM,
    l:    winapi::shared::minwindef::LPARAM,
) -> winapi::shared::minwindef::LRESULT {
    use winapi::um::winuser::*;
    match msg {
        WM_DESTROY => { PostQuitMessage(0); 0 }
        WM_CLOSE   => { DestroyWindow(hwnd); 0 }
        WM_SIZE => {
            // Resize the VST's embedded child window to fill our client area.
            // This keeps the plugin UI filling the container when the user resizes.
            let mut rc: winapi::shared::windef::RECT = std::mem::zeroed();
            GetClientRect(hwnd, &mut rc);
            let cw = rc.right  - rc.left;
            let ch = rc.bottom - rc.top;
            if cw > 0 && ch > 0 {
                // Only resize the first direct child (the VST's root window)
                let child = GetWindow(hwnd, GW_CHILD);
                if !child.is_null() {
                    SetWindowPos(child, std::ptr::null_mut(),
                        0, 0, cw, ch,
                        SWP_NOZORDER | SWP_NOACTIVATE);
                }
            }
            DefWindowProcW(hwnd, msg, w, l)
        }
        _ => DefWindowProcW(hwnd, msg, w, l),
    }
}

// ── Win32 helpers shared by all plugin formats ────────────────────────────────

#[cfg(windows)]
unsafe fn run_message_loop(_hwnd: winapi::shared::windef::HWND) {
    use winapi::um::winuser::*;
    let mut msg: MSG = std::mem::zeroed();
    while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
}

#[cfg(windows)]
unsafe fn create_plugin_hwnd(
    title: &str, w: i32, h: i32,
    hinst: winapi::shared::minwindef::HINSTANCE,
) -> winapi::shared::windef::HWND {
    use winapi::um::winuser::*;
    let class_name: Vec<u16> = "IceampleVST\0".encode_utf16().collect();
    let title_w:    Vec<u16> = format!("{}\0", title).encode_utf16().collect();
    let style = WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX;
    let mut wr = winapi::shared::windef::RECT { left: 0, top: 0, right: w, bottom: h };
    AdjustWindowRect(&mut wr, style, 0);
    CreateWindowExW(
        0, class_name.as_ptr(), title_w.as_ptr(), style,
        CW_USEDEFAULT, CW_USEDEFAULT,
        wr.right - wr.left, wr.bottom - wr.top,
        std::ptr::null_mut(), std::ptr::null_mut(), hinst, std::ptr::null_mut(),
    )
}

// ── CLAP editor (Windows) ─────────────────────────────────────────────────────

#[cfg(windows)]
mod clap_host {
    use super::c_void;

    #[repr(C)] pub struct ClapVersion { pub major: u32, pub minor: u32, pub revision: u32 }

    #[repr(C)]
    pub struct ClapEntry {
        pub clap_version: ClapVersion,
        pub init:        unsafe extern "C" fn(*const std::ffi::c_char) -> bool,
        pub deinit:      unsafe extern "C" fn(),
        pub get_factory: unsafe extern "C" fn(*const std::ffi::c_char) -> *const c_void,
    }

    #[repr(C)]
    pub struct ClapPluginDescriptor {
        pub clap_version: ClapVersion,
        pub id: *const std::ffi::c_char,
        pub name: *const std::ffi::c_char,
        pub vendor: *const std::ffi::c_char,
        pub url: *const std::ffi::c_char,
        pub manual_url: *const std::ffi::c_char,
        pub support_url: *const std::ffi::c_char,
        pub version: *const std::ffi::c_char,
        pub description: *const std::ffi::c_char,
        pub features: *const *const std::ffi::c_char,
    }

    #[repr(C)]
    pub struct ClapPlugin {
        pub clap_version: ClapVersion,
        pub desc: *const ClapPluginDescriptor,
        pub plugin_data: *mut c_void,
        pub init:   unsafe extern "C" fn(*const ClapPlugin) -> bool,
        pub destroy:unsafe extern "C" fn(*const ClapPlugin),
        pub activate:   *const c_void,
        pub deactivate: *const c_void,
        pub start_processing: *const c_void,
        pub stop_processing:  *const c_void,
        pub reset:   *const c_void,
        pub process: *const c_void,
        pub get_extension: unsafe extern "C" fn(*const ClapPlugin, *const std::ffi::c_char) -> *const c_void,
        pub on_main_thread: unsafe extern "C" fn(*const ClapPlugin),
    }

    #[repr(C)]
    pub struct ClapPluginFactory {
        pub get_plugin_count:      unsafe extern "C" fn(*const ClapPluginFactory) -> u32,
        pub get_plugin_descriptor: unsafe extern "C" fn(*const ClapPluginFactory, u32) -> *const ClapPluginDescriptor,
        pub create_plugin: unsafe extern "C" fn(*const ClapPluginFactory, *const ClapHost, *const std::ffi::c_char) -> *mut ClapPlugin,
    }

    #[repr(C)]
    pub struct ClapHost {
        pub clap_version: ClapVersion,
        pub host_data: *mut c_void,
        pub name:    *const std::ffi::c_char,
        pub vendor:  *const std::ffi::c_char,
        pub url:     *const std::ffi::c_char,
        pub version: *const std::ffi::c_char,
        pub get_extension:   unsafe extern "C" fn(*const ClapHost, *const std::ffi::c_char) -> *const c_void,
        pub request_restart: unsafe extern "C" fn(*const ClapHost),
        pub request_process: unsafe extern "C" fn(*const ClapHost),
        pub request_callback:unsafe extern "C" fn(*const ClapHost),
    }

    #[repr(C)]
    pub struct ClapGuiResizeHints {
        pub can_resize_horizontally: bool, pub can_resize_vertically: bool,
        pub preserve_aspect_ratio: bool,
        pub aspect_ratio_width: u32, pub aspect_ratio_height: u32,
    }

    #[repr(C)]
    pub struct ClapPluginGui {
        pub is_api_supported: unsafe extern "C" fn(*const ClapPlugin, *const std::ffi::c_char, bool) -> bool,
        pub get_preferred_api:unsafe extern "C" fn(*const ClapPlugin, *mut *const std::ffi::c_char, *mut bool) -> bool,
        pub create:  unsafe extern "C" fn(*const ClapPlugin, *const std::ffi::c_char, bool) -> bool,
        pub destroy: unsafe extern "C" fn(*const ClapPlugin),
        pub set_scale: unsafe extern "C" fn(*const ClapPlugin, f64) -> bool,
        pub get_size:  unsafe extern "C" fn(*const ClapPlugin, *mut u32, *mut u32) -> bool,
        pub can_resize: unsafe extern "C" fn(*const ClapPlugin) -> bool,
        pub get_resize_hints: unsafe extern "C" fn(*const ClapPlugin, *mut ClapGuiResizeHints) -> bool,
        pub adjust_size: unsafe extern "C" fn(*const ClapPlugin, *mut u32, *mut u32) -> bool,
        pub set_size:    unsafe extern "C" fn(*const ClapPlugin, u32, u32) -> bool,
        pub set_parent:  unsafe extern "C" fn(*const ClapPlugin, *const ClapWindow) -> bool,
        pub set_transient: unsafe extern "C" fn(*const ClapPlugin, *const ClapWindow) -> bool,
        pub suggest_title: unsafe extern "C" fn(*const ClapPlugin, *const std::ffi::c_char),
        pub show: unsafe extern "C" fn(*const ClapPlugin) -> bool,
        pub hide: unsafe extern "C" fn(*const ClapPlugin) -> bool,
    }

    #[repr(C)]
    pub struct ClapWindow {
        pub api: *const std::ffi::c_char,
        pub win32: winapi::shared::windef::HWND,
    }

    pub unsafe extern "C" fn host_get_ext(_: *const ClapHost, _: *const std::ffi::c_char) -> *const c_void { std::ptr::null() }
    pub unsafe extern "C" fn host_noop(_: *const ClapHost) {}
}

#[cfg(windows)]
fn open_clap_window(path: String, name: String) -> Result<(), String> {
    use clap_host::*;
    use winapi::um::winuser::*;
    use winapi::um::libloaderapi::GetModuleHandleW;
    use std::ffi::CString;

    unsafe {
        let lib = libloading::Library::new(&path)
            .map_err(|e| format!("Chargement impossible: {}", e))?;

        let entry_ptr: libloading::Symbol<*mut ClapEntry> = lib.get(b"clap_entry\0")
            .map_err(|_| "Export clap_entry introuvable".to_string())?;
        let entry = &**entry_ptr;

        let path_c = CString::new(path.as_str()).unwrap_or_default();
        (entry.init)(path_c.as_ptr());

        let factory_id = b"clap.plugin-factory\0".as_ptr() as *const std::ffi::c_char;
        let factory = (entry.get_factory)(factory_id) as *const ClapPluginFactory;
        if factory.is_null() { return Err("CLAP factory introuvable".to_string()); }

        let count = ((*factory).get_plugin_count)(factory);
        if count == 0 { return Err("Aucun plugin dans ce fichier CLAP".to_string()); }

        let desc = ((*factory).get_plugin_descriptor)(factory, 0);
        if desc.is_null() { return Err("Descriptor CLAP null".to_string()); }

        let host = ClapHost {
            clap_version: ClapVersion { major: 1, minor: 0, revision: 0 },
            host_data: std::ptr::null_mut(),
            name:    b"Iceample\0".as_ptr() as *const _,
            vendor:  b"Iceample\0".as_ptr() as *const _,
            url:     b"\0".as_ptr() as *const _,
            version: b"2.0\0".as_ptr() as *const _,
            get_extension:    host_get_ext,
            request_restart:  host_noop,
            request_process:  host_noop,
            request_callback: host_noop,
        };

        let plugin = ((*factory).create_plugin)(factory, &host, (*desc).id);
        if plugin.is_null() { return Err("Création du plugin CLAP échouée".to_string()); }
        if !((*plugin).init)(plugin) { return Err("Init du plugin CLAP échouée".to_string()); }

        let gui_id = b"clap.gui\0".as_ptr() as *const std::ffi::c_char;
        let gui = ((*plugin).get_extension)(plugin, gui_id) as *const ClapPluginGui;
        if gui.is_null() { return Err("Ce plugin CLAP n'a pas d'interface graphique".to_string()); }

        let win32_api = b"win32\0".as_ptr() as *const std::ffi::c_char;
        if !((*gui).is_api_supported)(plugin, win32_api, false) {
            return Err("L'interface CLAP ne supporte pas Win32".to_string());
        }
        if !((*gui).create)(plugin, win32_api, false) {
            return Err("Création de la GUI CLAP échouée".to_string());
        }

        let mut w: u32 = 800;
        let mut h: u32 = 600;
        ((*gui).get_size)(plugin, &mut w, &mut h);

        let hinst = GetModuleHandleW(std::ptr::null());
        let hwnd = create_plugin_hwnd(&name, w as i32, h as i32, hinst);
        if hwnd.is_null() { return Err("Impossible de créer la fenêtre".to_string()); }

        let window = ClapWindow { api: win32_api, win32: hwnd };
        ((*gui).set_parent)(plugin, &window);
        ((*gui).show)(plugin);

        ShowWindow(hwnd, SW_SHOW);
        UpdateWindow(hwnd);
        run_message_loop(hwnd);

        ((*gui).hide)(plugin);
        ((*gui).destroy)(plugin);
        ((*plugin).destroy)(plugin);
        (entry.deinit)();
        drop(lib);
    }
    Ok(())
}

// ── VST3 editor (Windows) ─────────────────────────────────────────────────────

#[cfg(windows)]
fn find_vst3_dll(bundle_path: &str) -> Option<std::path::PathBuf> {
    let base = std::path::Path::new(bundle_path);
    // Bundle folder: PluginName.vst3/Contents/x86_64-win/PluginName.vst3
    let dll = base.join("Contents").join("x86_64-win");
    if let Ok(rd) = std::fs::read_dir(&dll) {
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) == Some("vst3") {
                return Some(p);
            }
        }
    }
    // Some distributions ship a flat .vst3 file (single DLL)
    if base.is_file() { return Some(base.to_path_buf()); }
    None
}

// Minimal VST3 interface vtable indices
// FUnknown: 0=queryInterface, 1=addRef, 2=release
// IPluginFactory: 3=getFactoryInfo, 4=countClasses, 5=getClassInfo, 6=createInstance
// IPluginBase: 3=initialize, 4=terminate  (extends FUnknown)
// IEditController: 3=initialize, 4=terminate, 5=setComponentState, 6=setState, 7=getState,
//   8=getParameterCount, 9=getParameterInfo, 10=getParamStringByValue,
//   11=getParamValueByString, 12=normalizedParamToPlain, 13=plainParamToNormalized,
//   14=getParamNormalized, 15=setParamNormalized, 16=setComponentHandler, 17=createView
// IPlugView: 3=isPlatformTypeSupported, 4=attached, 5=removed, 6=onWheel, 7=onKeyDown,
//   8=onKeyUp, 9=getSize, 10=onSize, 11=onFocus, 12=setFrame, 13=canResize, 14=checkSizeConstraint

#[cfg(windows)]
mod vst3_host {
    use super::c_void;

    // IID as [u8;16]
    #[allow(dead_code)]
    pub const IPLUGIN_FACTORY_IID: [u8; 16] = [
        0x7A, 0x4D, 0x81, 0x1C, 0x52, 0x11, 0x4A, 0x1F,
        0xAE, 0xD9, 0xD2, 0xEE, 0x0B, 0x61, 0x5A, 0xA0,
    ];
    pub const IEDIT_CONTROLLER_IID: [u8; 16] = [
        0xDC, 0xD7, 0xBB, 0xE3, 0x77, 0x42, 0x44, 0x8D,
        0xA8, 0x74, 0xAA, 0xCC, 0x97, 0x9C, 0x75, 0x9E,
    ];

    // PClassInfo category for audio effects
    pub const VST_AUDIO_EFFECT: &[u8] = b"Audio Module Class\0";

    #[repr(C)]
    #[allow(dead_code)]
    pub struct PFactoryInfo {
        pub vendor: [u8; 64],
        pub url:    [u8; 256],
        pub email:  [u8; 128],
        pub flags:  i32,
    }
    impl Default for PFactoryInfo {
        fn default() -> Self { unsafe { std::mem::zeroed() } }
    }

    #[repr(C)]
    pub struct PClassInfo {
        pub cid:         [u8; 16],
        pub cardinality: i32,
        pub category:    [u8; 32],
        pub name:        [u8; 64],
    }
    impl Default for PClassInfo {
        fn default() -> Self { unsafe { std::mem::zeroed() } }
    }

    #[repr(C)]
    pub struct ViewRect { pub left: i32, pub top: i32, pub right: i32, pub bottom: i32 }
    impl Default for ViewRect {
        fn default() -> Self { unsafe { std::mem::zeroed() } }
    }

    // Raw vtable pointers — we index them manually
    #[repr(C)]
    pub struct IUnknown { pub vtable: *const *const c_void }

    #[allow(dead_code)]
    pub unsafe fn query_interface(obj: *mut IUnknown, iid: &[u8; 16], out: *mut *mut c_void) -> i32 {
        let vtbl = (*obj).vtable;
        let qi: unsafe extern "system" fn(*mut IUnknown, *const u8, *mut *mut c_void) -> i32
            = std::mem::transmute(*vtbl);
        qi(obj, iid.as_ptr(), out)
    }

    #[allow(dead_code)]
    pub unsafe fn add_ref(obj: *mut IUnknown) -> u32 {
        let vtbl = (*obj).vtable;
        let f: unsafe extern "system" fn(*mut IUnknown) -> u32 = std::mem::transmute(*vtbl.add(1));
        f(obj)
    }

    pub unsafe fn release(obj: *mut IUnknown) -> u32 {
        let vtbl = (*obj).vtable;
        let f: unsafe extern "system" fn(*mut IUnknown) -> u32 = std::mem::transmute(*vtbl.add(2));
        f(obj)
    }

    // IPluginFactory vtable helpers
    pub unsafe fn factory_count_classes(factory: *mut IUnknown) -> i32 {
        let vtbl = (*factory).vtable;
        let f: unsafe extern "system" fn(*mut IUnknown) -> i32 = std::mem::transmute(*vtbl.add(4));
        f(factory)
    }

    pub unsafe fn factory_get_class_info(factory: *mut IUnknown, idx: i32, info: *mut PClassInfo) -> i32 {
        let vtbl = (*factory).vtable;
        let f: unsafe extern "system" fn(*mut IUnknown, i32, *mut PClassInfo) -> i32
            = std::mem::transmute(*vtbl.add(5));
        f(factory, idx, info)
    }

    pub unsafe fn factory_create_instance(factory: *mut IUnknown, cid: *const u8, iid: *const u8, obj: *mut *mut c_void) -> i32 {
        let vtbl = (*factory).vtable;
        let f: unsafe extern "system" fn(*mut IUnknown, *const u8, *const u8, *mut *mut c_void) -> i32
            = std::mem::transmute(*vtbl.add(6));
        f(factory, cid, iid, obj)
    }

    // IEditController vtable helpers
    pub unsafe fn controller_initialize(ctrl: *mut IUnknown, ctx: *mut c_void) -> i32 {
        let vtbl = (*ctrl).vtable;
        let f: unsafe extern "system" fn(*mut IUnknown, *mut c_void) -> i32
            = std::mem::transmute(*vtbl.add(3));
        f(ctrl, ctx)
    }

    pub unsafe fn controller_create_view(ctrl: *mut IUnknown, name: *const std::ffi::c_char) -> *mut IUnknown {
        let vtbl = (*ctrl).vtable;
        let f: unsafe extern "system" fn(*mut IUnknown, *const std::ffi::c_char) -> *mut IUnknown
            = std::mem::transmute(*vtbl.add(17));
        f(ctrl, name)
    }

    // IPlugView vtable helpers
    pub unsafe fn view_is_platform_supported(view: *mut IUnknown, ptype: *const std::ffi::c_char) -> i32 {
        let vtbl = (*view).vtable;
        let f: unsafe extern "system" fn(*mut IUnknown, *const std::ffi::c_char) -> i32
            = std::mem::transmute(*vtbl.add(3));
        f(view, ptype)
    }

    pub unsafe fn view_attached(view: *mut IUnknown, parent: *mut c_void, ptype: *const std::ffi::c_char) -> i32 {
        let vtbl = (*view).vtable;
        let f: unsafe extern "system" fn(*mut IUnknown, *mut c_void, *const std::ffi::c_char) -> i32
            = std::mem::transmute(*vtbl.add(4));
        f(view, parent, ptype)
    }

    pub unsafe fn view_removed(view: *mut IUnknown) -> i32 {
        let vtbl = (*view).vtable;
        let f: unsafe extern "system" fn(*mut IUnknown) -> i32 = std::mem::transmute(*vtbl.add(5));
        f(view)
    }

    pub unsafe fn view_get_size(view: *mut IUnknown, rect: *mut ViewRect) -> i32 {
        let vtbl = (*view).vtable;
        let f: unsafe extern "system" fn(*mut IUnknown, *mut ViewRect) -> i32
            = std::mem::transmute(*vtbl.add(9));
        f(view, rect)
    }
}

#[cfg(windows)]
fn open_vst3_window(path: String, name: String) -> Result<(), String> {
    use vst3_host::*;
    use winapi::um::winuser::*;
    use winapi::um::libloaderapi::GetModuleHandleW;

    let dll_path = find_vst3_dll(&path)
        .ok_or_else(|| "DLL VST3 introuvable dans le bundle".to_string())?;

    unsafe {
        let lib = libloading::Library::new(&dll_path)
            .map_err(|e| format!("Chargement impossible: {}", e))?;

        type GetFactory = unsafe extern "system" fn() -> *mut IUnknown;
        let get_factory: libloading::Symbol<GetFactory> = lib.get(b"GetPluginFactory\0")
            .map_err(|_| "Export GetPluginFactory introuvable".to_string())?;

        let factory = get_factory();
        if factory.is_null() { return Err("Factory VST3 null".to_string()); }

        // Find an audio effect class
        let class_count = factory_count_classes(factory);
        let mut target_cid: Option<[u8; 16]> = None;
        for i in 0..class_count {
            let mut info = PClassInfo::default();
            factory_get_class_info(factory, i, &mut info);
            let cat = info.category.split(|&b| b == 0).next().unwrap_or(&[]);
            if cat == &VST_AUDIO_EFFECT[..VST_AUDIO_EFFECT.len()-1] {
                target_cid = Some(info.cid);
                break;
            }
        }
        let cid = target_cid.ok_or("Aucun effet audio trouvé dans le plugin VST3")?;

        // Create IEditController instance
        let mut ctrl_ptr: *mut c_void = std::ptr::null_mut();
        let res = factory_create_instance(
            factory, cid.as_ptr(), IEDIT_CONTROLLER_IID.as_ptr(), &mut ctrl_ptr,
        );
        if res != 0 || ctrl_ptr.is_null() {
            return Err(format!("Impossible de créer le contrôleur VST3 (0x{:08X})", res as u32));
        }
        let ctrl = ctrl_ptr as *mut IUnknown;
        controller_initialize(ctrl, std::ptr::null_mut());

        // Create the editor view
        let view = controller_create_view(ctrl, b"editor\0".as_ptr() as *const _);
        if view.is_null() { return Err("createView VST3 a retourné null".to_string()); }

        let hwnd_type = b"HWND\0".as_ptr() as *const _;
        if view_is_platform_supported(view, hwnd_type) != 0 {
            release(view); release(ctrl);
            return Err("Ce plugin VST3 ne supporte pas HWND".to_string());
        }

        // Get preferred size
        let mut rect = ViewRect::default();
        view_get_size(view, &mut rect);
        let w = (rect.right  - rect.left).max(400);
        let h = (rect.bottom - rect.top).max(300);

        let hinst = GetModuleHandleW(std::ptr::null());
        let hwnd = create_plugin_hwnd(&name, w, h, hinst);
        if hwnd.is_null() { return Err("Impossible de créer la fenêtre".to_string()); }

        let res2 = view_attached(view, hwnd as *mut c_void, hwnd_type);
        if res2 != 0 {
            return Err(format!("view->attached() échoué (0x{:08X})", res2 as u32));
        }

        ShowWindow(hwnd, SW_SHOW);
        UpdateWindow(hwnd);
        run_message_loop(hwnd);

        view_removed(view);
        release(view);
        release(ctrl);
        drop(lib);
    }
    Ok(())
}

#[cfg(not(windows))]
fn open_vst2_window(_path: String, _name: String) -> Result<(), String> {
    Err("Éditeur VST disponible sur Windows uniquement".to_string())
}

#[cfg(not(windows))]
fn open_clap_window(_path: String, _name: String) -> Result<(), String> {
    Err("Éditeur CLAP disponible sur Windows uniquement".to_string())
}

#[cfg(not(windows))]
fn open_vst3_window(_path: String, _name: String) -> Result<(), String> {
    Err("Éditeur VST3 disponible sur Windows uniquement".to_string())
}

// ── 32-bit out-of-process bridge ──────────────────────────────────────────────
// A 64-bit process cannot LoadLibrary a 32-bit plugin DLL. When we detect one we
// spawn `iceample-vst-bridge.exe` (a 32-bit host) which loads the plugin and
// opens its editor / plays its audio out-of-process.

/// Read a DLL's PE machine field; `true` if it is 32-bit (IMAGE_FILE_MACHINE_I386).
fn dll_is_32bit(path: &str) -> bool {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = match std::fs::File::open(path) { Ok(f) => f, Err(_) => return false };
    if f.seek(SeekFrom::Start(0x3C)).is_err() { return false; }
    let mut e = [0u8; 4];
    if f.read_exact(&mut e).is_err() { return false; }
    let pe_off = u32::from_le_bytes(e) as u64;
    if f.seek(SeekFrom::Start(pe_off + 4)).is_err() { return false; } // skip "PE\0\0"
    let mut m = [0u8; 2];
    if f.read_exact(&mut m).is_err() { return false; }
    u16::from_le_bytes(m) == 0x014c
}

/// Locate the bridge executable (bundled next to the app, or dev build output).
fn bridge_exe_path() -> Option<std::path::PathBuf> {
    use std::path::PathBuf;
    let exe_name = "iceample-vst-bridge.exe";
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(cur) = std::env::current_exe() {
        if let Some(dir) = cur.parent() {
            roots.push(dir.to_path_buf());        // next to the main exe
            roots.push(dir.join("bridge"));       // bundled resource (tauri.conf resources)
            roots.push(dir.join("resources/bridge"));
            roots.push(dir.join("../../../vst-bridge/target/i686-pc-windows-msvc/debug"));
            roots.push(dir.join("../../../vst-bridge/target/i686-pc-windows-msvc/release"));
        }
    }
    roots.push(PathBuf::from("../vst-bridge/target/i686-pc-windows-msvc/debug"));
    roots.push(PathBuf::from("../vst-bridge/target/i686-pc-windows-msvc/release"));
    roots.push(PathBuf::from("vst-bridge/target/i686-pc-windows-msvc/debug"));
    roots.push(PathBuf::from("vst-bridge/target/i686-pc-windows-msvc/release"));
    for r in roots {
        let p = r.join(exe_name);
        if p.exists() { return Some(p); }
    }
    None
}

/// Spawn the 32-bit bridge to open a plugin editor (fire-and-forget; the child
/// owns its own window lifecycle). Detects early failure (bad DLL) and reports it.
#[cfg(windows)]
/// Tracks the single standalone editor process so a new "open editor" replaces
/// the previous window instead of stacking another one.
fn bridge_editor_mutex() -> &'static Mutex<Option<std::process::Child>> {
    static M: OnceLock<Mutex<Option<std::process::Child>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(None))
}

fn spawn_bridge_editor(path: &str, name: &str, audio: bool) -> Result<(), String> {
    let exe = bridge_exe_path()
        .ok_or("Pont VST 32 bits introuvable (iceample-vst-bridge.exe non compilé)")?;
    // Close any previous standalone editor so windows don't pile up.
    if let Ok(mut lock) = bridge_editor_mutex().lock() {
        if let Some(mut old) = lock.take() { let _ = old.kill(); let _ = old.wait(); }
    }
    let mut cmd = std::process::Command::new(exe);
    cmd.args(["--path", path, "--name", name]);
    if audio { cmd.arg("--audio"); }
    #[cfg(debug_assertions)] cmd.env("ICEAMPLE_BRIDGE_LOG", "1");
    cmd.stderr(std::process::Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("Lancement du pont échoué: {}", e))?;
    // Give it a moment; if it exits non-zero quickly, surface the error.
    std::thread::sleep(std::time::Duration::from_millis(600));
    if let Ok(Some(status)) = child.try_wait() {
        if !status.success() {
            let mut errbuf = String::new();
            if let Some(mut se) = child.stderr.take() {
                use std::io::Read;
                let _ = se.read_to_string(&mut errbuf);
            }
            let last = errbuf.lines().last().unwrap_or("le pont s'est fermé").trim();
            return Err(format!("Pont 32 bits — {}", last));
        }
    }
    // Still alive → drain stderr (so a full pipe can't block it) and keep the
    // handle so the next "open editor" can close this window first.
    if let Some(mut se) = child.stderr.take() {
        std::thread::spawn(move || {
            use std::io::Read; let mut buf = [0u8; 4096];
            while let Ok(n) = se.read(&mut buf) { if n == 0 { break } }
        });
    }
    if let Ok(mut lock) = bridge_editor_mutex().lock() { *lock = Some(child); }
    Ok(())
}

// ── Bridged 32-bit instrument (persistent: audio + MIDI over socket) ──────────
#[cfg(windows)]
struct BridgeInstrument {
    child:  std::process::Child,
    stream: std::net::TcpStream,
}
#[cfg(windows)]
fn bridge_instr_mutex() -> &'static Mutex<Option<BridgeInstrument>> {
    static M: OnceLock<Mutex<Option<BridgeInstrument>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(None))
}

/// Send a 4-byte frame to the active bridge instrument. Returns true if one is
/// active and the frame was written (so callers know not to fall back in-process).
#[cfg(windows)]
fn bridge_send(frame: [u8; 4]) -> bool {
    use std::io::Write;
    if let Ok(mut lock) = bridge_instr_mutex().lock() {
        if let Some(bi) = lock.as_mut() {
            if bi.stream.write_all(&frame).and_then(|_| bi.stream.flush()).is_ok() {
                return true;
            }
            *lock = None; // bridge died → drop it
        }
    }
    false
}

/// Shut down and reap the active bridge instrument, if any.
#[cfg(windows)]
fn stop_bridge_instrument() {
    if let Ok(mut lock) = bridge_instr_mutex().lock() {
        if let Some(mut bi) = lock.take() {
            use std::io::Write;
            let _ = bi.stream.write_all(&[2, 0, 0, 0]).and_then(|_| bi.stream.flush());
            std::thread::sleep(std::time::Duration::from_millis(120));
            let _ = bi.child.kill();
            let _ = bi.child.wait();
        }
    }
}

/// Spawn the 32-bit bridge as a persistent, headless instrument host: it plays
/// its own audio and receives MIDI from us over a localhost socket.
#[cfg(windows)]
fn spawn_bridge_instrument(path: &str, name: &str, app: &tauri::AppHandle) -> Result<(), String> {
    stop_bridge_instrument();
    let exe = bridge_exe_path()
        .ok_or("Pont VST 32 bits introuvable (iceample-vst-bridge.exe non compilé)")?;

    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let mut cmd = std::process::Command::new(exe);
    cmd.args(["--path", path, "--name", name, "--audio", "--headless", "--port"])
        .arg(port.to_string())
        .stderr(std::process::Stdio::piped());
    #[cfg(debug_assertions)] cmd.env("ICEAMPLE_BRIDGE_LOG", "1");
    let mut child = cmd.spawn().map_err(|e| format!("Lancement du pont échoué: {}", e))?;

    listener.set_nonblocking(true).ok();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(8);
    let stream = loop {
        match listener.accept() {
            Ok((s, _)) => break s,
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if let Ok(Some(_)) = child.try_wait() {
                    let mut errbuf = String::new();
                    if let Some(mut se) = child.stderr.take() {
                        use std::io::Read;
                        let _ = se.read_to_string(&mut errbuf);
                    }
                    let last = errbuf.lines().last().unwrap_or("le pont s'est fermé").trim();
                    return Err(format!("Pont 32 bits — {}", last));
                }
                if std::time::Instant::now() > deadline {
                    let _ = child.kill();
                    return Err("Le pont n'a pas répondu (timeout)".into());
                }
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            Err(e) => { let _ = child.kill(); return Err(e.to_string()); }
        }
    };
    stream.set_nodelay(true).ok();
    // Drain stderr on a background thread so a full pipe can never block (and
    // thereby stall/kill) the headless bridge while it runs.
    if let Some(mut se) = child.stderr.take() {
        std::thread::spawn(move || {
            use std::io::Read; let mut buf = [0u8; 4096];
            while let Ok(n) = se.read(&mut buf) { if n == 0 { break } }
        });
    }
    // Reader thread: MIDI the plugin emits (e.g. an arpeggiator's notes) comes
    // back as [1, status, d1, d2]; forward it to the UI so the piano's own synth
    // can play it.
    if let Ok(rstream) = stream.try_clone() {
        let app = app.clone();
        std::thread::spawn(move || {
            use std::io::Read;
            use tauri::Emitter;
            let mut rs = rstream;
            let mut frame = [0u8; 4];
            while rs.read_exact(&mut frame).is_ok() {
                if frame[0] == 1 {
                    let _ = app.emit("vst-midi-out",
                        serde_json::json!({ "status": frame[1], "data1": frame[2], "data2": frame[3] }));
                }
            }
        });
    }
    *bridge_instr_mutex().lock().unwrap() = Some(BridgeInstrument { child, stream });
    Ok(())
}

#[tauri::command]
fn open_vst_editor(path: String, format: String, name: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        // 32-bit plugin in a 64-bit host → route through the out-of-process bridge.
        if dll_is_32bit(&path) {
            if format == "vst2" {
                return spawn_bridge_editor(&path, &name, false);
            }
            return Err(format!(
                "Plugin {} en 32 bits : le pont ne supporte que le VST2 pour l'instant",
                format.to_uppercase()
            ));
        }
    }
    #[cfg(windows)]
    {
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        match format.as_str() {
            "vst2" => { std::thread::spawn(move || { tx.send(open_vst2_window(path, name)).ok(); }); }
            "vst3" => { std::thread::spawn(move || { tx.send(open_vst3_window(path, name)).ok(); }); }
            "clap" => { std::thread::spawn(move || { tx.send(open_clap_window(path, name)).ok(); }); }
            _ => return Err(format!("Format {} non supporté", format)),
        }
        // Wait up to 500ms for early failure; after that the message loop is running → OK
        return match rx.recv_timeout(std::time::Duration::from_millis(500)) {
            Ok(r)  => r,
            Err(_) => Ok(()), // still running → window is open
        };
    }
    #[cfg(not(windows))]
    Err(format!("Format {} non supporté", format))
}

// ── VST Instrument Engine (real-time, cpal) ───────────────────────────────────

struct SendEffectPtr(*mut AEffect);
unsafe impl Send for SendEffectPtr {}
impl SendEffectPtr {
    fn raw(&self) -> *mut AEffect { self.0 }
}

#[repr(C)]
struct VstMidiEvent {
    event_type:        i32,   // 1 = kVstMidiType
    byte_size:         i32,   // sizeof(VstMidiEvent)
    delta_frames:      i32,
    flags:             i32,   // 1 = kVstMidiEventIsRealtime
    note_length:       i32,
    note_offset:       i32,
    midi_data:         [i8; 4],
    detune:            i8,
    note_off_velocity: i8,
    _reserved1:        i8,
    _reserved2:        i8,
}

#[repr(C)]
struct VstEventsFixed {
    num_events: i32,
    _reserved:  isize,
    events:     [*const c_void; 32],
}

use std::sync::{Mutex, OnceLock};

#[allow(dead_code)]
struct SendStream(cpal::Stream);
unsafe impl Send for SendStream {}

// Command sent to the plugin thread to open its editor
// (effEditOpen must run on the same thread as VSTPluginMain)
enum VstPluginCmd {
    OpenEditor {
        name:  String,
        reply: std::sync::mpsc::Sender<Result<(), String>>,
    },
}

struct VstInstrumentEngine {
    midi_tx:  crossbeam_channel::Sender<[u8; 3]>,
    _stream:  SendStream,
    _lib:     Box<libloading::Library>,
    eff:      SendEffectPtr,
    // Channel to the plugin thread (same thread that called VSTPluginMain)
    cmd_tx:   std::sync::mpsc::SyncSender<VstPluginCmd>,
}

static VST_INSTRUMENT: OnceLock<Mutex<Option<VstInstrumentEngine>>> = OnceLock::new();
fn vst_instr_mutex() -> &'static Mutex<Option<VstInstrumentEngine>> {
    VST_INSTRUMENT.get_or_init(|| Mutex::new(None))
}

// Run the VST2 editor window entirely on the plugin thread (same thread as init).
// This avoids the deadlock where effEditOpen blocks waiting for JUCE's message
// thread, which in turn waits for our thread to process a SendMessage.
#[cfg(windows)]
fn run_vst2_editor_on_plugin_thread(
    effect: *mut AEffect,
    name:   &str,
    reply:  std::sync::mpsc::Sender<Result<(), String>>,
) {
    use winapi::um::winuser::*;
    use winapi::um::libloaderapi::GetModuleHandleW;
    unsafe {
        let dispatch = match (*effect).dispatcher {
            Some(d) => d,
            None    => { reply.send(Err("No dispatcher".into())).ok(); return; }
        };
        if (*effect).flags & 1 == 0 {
            reply.send(Err("Ce plugin n'a pas d'éditeur".into())).ok();
            return;
        }
        let class_name: Vec<u16> = "IceampleVSTInstr\0".encode_utf16().collect();
        let title:      Vec<u16> = format!("{}\0", name).encode_utf16().collect();
        let hinst = GetModuleHandleW(std::ptr::null());
        let wc = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(vst_wnd_proc),
            cbClsExtra: 0, cbWndExtra: 0, hInstance: hinst,
            hIcon: std::ptr::null_mut(),
            hCursor: LoadCursorW(std::ptr::null_mut(), IDC_ARROW),
            hbrBackground: (COLOR_WINDOW + 1) as *mut _,
            lpszMenuName: std::ptr::null(), lpszClassName: class_name.as_ptr(),
        };
        RegisterClassW(&wc);
        let style = WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_SIZEBOX | WS_CLIPCHILDREN;
        let hwnd = CreateWindowExW(
            WS_EX_APPWINDOW,
            class_name.as_ptr(), title.as_ptr(), style,
            CW_USEDEFAULT, CW_USEDEFAULT, 800, 600,
            std::ptr::null_mut(), std::ptr::null_mut(), hinst, std::ptr::null_mut(),
        );
        if hwnd.is_null() { reply.send(Err("Cannot create window".into())).ok(); return; }

        ShowWindow(hwnd, SW_SHOW);
        UpdateWindow(hwnd);

        // effEditOpen on the plugin thread (same as VSTPluginMain) — no deadlock
        dispatch(effect, EFF_EDIT_OPEN, 0, 0, hwnd as *mut c_void, 0.0);
        eprintln!("[VST-EDITOR] effEditOpen returned");

        // Resize to plugin's preferred size
        let mut rect_ptr: *mut ERect = std::ptr::null_mut();
        dispatch(effect, EFF_EDIT_GET_RECT, 0, 0,
            &mut rect_ptr as *mut *mut ERect as *mut c_void, 0.0);
        if !rect_ptr.is_null() {
            let r = &*rect_ptr;
            let w = (r.right - r.left) as i32;
            let h = (r.bottom - r.top) as i32;
            eprintln!("[VST-EDITOR] rect {}x{}", w, h);
            if w > 0 && h > 0 {
                let mut wr = winapi::shared::windef::RECT { left:0,top:0,right:w,bottom:h };
                AdjustWindowRect(&mut wr, style, 0);
                let sw = GetSystemMetrics(SM_CXSCREEN);
                let sh = GetSystemMetrics(SM_CYSCREEN);
                let ww = wr.right - wr.left;
                let wh = wr.bottom - wr.top;
                SetWindowPos(hwnd, HWND_TOPMOST,
                    ((sw-ww)/2).max(0), ((sh-wh)/2).max(0),
                    ww, wh, SWP_SHOWWINDOW | SWP_FRAMECHANGED);
            }
        }
        SetForegroundWindow(hwnd);
        BringWindowToTop(hwnd);

        const TIMER_IDLE: usize = 1;
        SetTimer(hwnd, TIMER_IDLE, 50, None);
        dispatch(effect, 19, 0, 0, std::ptr::null_mut(), 0.0);
        reply.send(Ok(())).ok();

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            if msg.message == WM_TIMER && msg.wParam == TIMER_IDLE {
                dispatch(effect, 19, 0, 0, std::ptr::null_mut(), 0.0);
            } else {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
        KillTimer(hwnd, TIMER_IDLE);
        dispatch(effect, EFF_EDIT_CLOSE, 0, 0, std::ptr::null_mut(), 0.0);
    }
}

fn start_vst2_instrument(path: &str) -> Result<VstInstrumentEngine, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    let lib = Box::new(unsafe { libloading::Library::new(path) }
        .map_err(|e| format!("Load error: {}", e))?);

    let effect = unsafe {
        let vst_main: libloading::Symbol<VstPluginMain> = lib.get(b"VSTPluginMain\0")
            .or_else(|_| lib.get(b"main\0"))
            .map_err(|_| "VSTPluginMain not found".to_string())?;
        vst_main(vst2_host_callback)
    };

    if effect.is_null() || unsafe { (*effect).magic } != VST_MAGIC {
        return Err("Invalid VST2 plugin".to_string());
    }

    let dispatch = unsafe { (*effect).dispatcher }.ok_or("No dispatcher")?;

    const SR: f32 = 44100.0;
    const BS: i32 = 512;

    unsafe {
        dispatch(effect, EFF_OPEN, 0, 0, std::ptr::null_mut(), 0.0);
        dispatch(effect, 10, 0, 0,       std::ptr::null_mut(), SR);   // effSetSampleRate
        dispatch(effect, 11, 0, BS as isize, std::ptr::null_mut(), 0.0); // effSetBlockSize
        dispatch(effect, 12, 0, 1,       std::ptr::null_mut(), 0.0);  // effMainsChanged(1)
    }

    let (midi_tx, midi_rx) = crossbeam_channel::bounded::<[u8; 3]>(1024);
    let eff_ptr = SendEffectPtr(effect);

    let host   = cpal::default_host();
    let device = host.default_output_device().ok_or("No output device")?;

    // Use device's default config so we're always compatible
    let supported = device.default_output_config()
        .map_err(|e| format!("No default config: {}", e))?;
    let sample_rate = supported.sample_rate().0;
    let channels    = supported.channels() as usize;
    let config = cpal::StreamConfig {
        channels:    supported.channels(),
        sample_rate: supported.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };

    // Tell the VST the real sample rate
    unsafe {
        dispatch(effect, 10, 0, 0, std::ptr::null_mut(), sample_rate as f32);
    }

    let stream = device.build_output_stream(
        &config,
        move |data: &mut [f32], _| {
            let effect = eff_ptr.raw();
            let frames = if channels > 0 { data.len() / channels } else { data.len() / 2 };

            // Collect MIDI events
            let mut midi_evs: Vec<VstMidiEvent> = Vec::new();
            while let Ok(msg) = midi_rx.try_recv() {
                if midi_evs.len() < 32 {
                    midi_evs.push(VstMidiEvent {
                        event_type:        1,
                        byte_size:         std::mem::size_of::<VstMidiEvent>() as i32,
                        delta_frames:      0,
                        flags:             1,
                        note_length:       0,
                        note_offset:       0,
                        midi_data:         [msg[0] as i8, msg[1] as i8, msg[2] as i8, 0],
                        detune:            0,
                        note_off_velocity: 0,
                        _reserved1:        0,
                        _reserved2:        0,
                    });
                }
            }

            if !midi_evs.is_empty() {
                unsafe {
                    let ptrs: Vec<*const c_void> = midi_evs.iter()
                        .map(|e| e as *const VstMidiEvent as *const c_void)
                        .collect();
                    let mut evs = VstEventsFixed {
                        num_events: ptrs.len() as i32,
                        _reserved:  0,
                        events:     [std::ptr::null(); 32],
                    };
                    for (i, p) in ptrs.iter().enumerate() {
                        evs.events[i] = *p;
                    }
                    if let Some(dispatch_fn) = (*effect).dispatcher {
                        dispatch_fn(effect, 25, 0, 0, // effProcessEvents
                            &mut evs as *mut VstEventsFixed as *mut c_void, 0.0);
                    }
                }
            }

            // Audio buffers — always provide valid (silent) input buffers, never null
            let mut in_l  = vec![0.0f32; frames];
            let mut in_r  = vec![0.0f32; frames];
            let mut out_l = vec![0.0f32; frames];
            let mut out_r = vec![0.0f32; frames];
            let mut in_ptrs  = [in_l.as_mut_ptr(),  in_r.as_mut_ptr()];
            let mut out_ptrs = [out_l.as_mut_ptr(), out_r.as_mut_ptr()];

            unsafe {
                if !(*effect)._process_replacing.is_null() {
                    let process_fn: unsafe extern "C" fn(*mut AEffect, *mut *mut f32, *mut *mut f32, i32)
                        = std::mem::transmute((*effect)._process_replacing);
                    process_fn(effect, in_ptrs.as_mut_ptr(), out_ptrs.as_mut_ptr(), frames as i32);
                }
            }

            for i in 0..frames {
                for ch in 0..channels {
                    let s = if ch % 2 == 0 { out_l[i] } else { out_r[i] };
                    data[i * channels + ch] = s.clamp(-1.0, 1.0);
                }
            }
        },
        |err| eprintln!("VST instrument audio error: {}", err),
        None,
    ).map_err(|e| format!("Stream error: {}", e))?;

    stream.play().map_err(|e| e.to_string())?;

    // cmd_tx is a placeholder; the real channel is attached in load_vst_instrument
    let (dummy_tx, _) = std::sync::mpsc::sync_channel(0);
    Ok(VstInstrumentEngine { midi_tx, _stream: SendStream(stream), _lib: lib, eff: SendEffectPtr(effect), cmd_tx: dummy_tx })
}

#[tauri::command]
fn load_vst_instrument(path: String, format: String, app: tauri::AppHandle) -> Result<(), String> {
    if let Ok(mut lock) = vst_instr_mutex().lock() { *lock = None; }
    #[cfg(windows)]
    {
        // 32-bit instrument → host it in the out-of-process bridge.
        if format == "vst2" && dll_is_32bit(&path) {
            let name = std::path::Path::new(&path)
                .file_stem().and_then(|s| s.to_str()).unwrap_or("VST").to_string();
            return spawn_bridge_instrument(&path, &name, &app);
        }
        // Switching to an in-process instrument → tear down any bridge.
        stop_bridge_instrument();
    }
    match format.as_str() {
        "vst2" => {
            let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
            // cmd channel: lets us send OpenEditor commands to the plugin thread
            let (cmd_tx, cmd_rx) = std::sync::mpsc::sync_channel::<VstPluginCmd>(2);

            std::thread::spawn(move || {
                // COM STA required by JUCE-based VSTs
                #[cfg(windows)]
                unsafe { winapi::um::objbase::CoInitialize(std::ptr::null_mut()); }

                let result = std::panic::catch_unwind(|| start_vst2_instrument(&path));
                let eng = match result {
                    Ok(Ok(e))  => e,
                    Ok(Err(e)) => { tx.send(Err(e)).ok(); return; }
                    Err(_)     => { tx.send(Err("VST crashed during init".into())).ok(); return; }
                };

                let eff_raw = eng.eff.raw();

                // Store engine with real cmd_tx
                {
                    let mut lock = vst_instr_mutex().lock().unwrap();
                    *lock = Some(VstInstrumentEngine {
                        midi_tx:  eng.midi_tx,
                        _stream:  eng._stream,
                        _lib:     eng._lib,
                        eff:      SendEffectPtr(eff_raw),
                        cmd_tx:   cmd_tx,
                    });
                }
                tx.send(Ok(())).ok();

                // ── Plugin thread stays alive to handle editor commands ──────
                // effEditOpen MUST run on this thread (same as VSTPluginMain)
                // to avoid deadlock in JUCE's callFunctionOnMessageThread.
                loop {
                    match cmd_rx.recv() {
                        Ok(VstPluginCmd::OpenEditor { name, reply }) => {
                            #[cfg(windows)]
                            run_vst2_editor_on_plugin_thread(eff_raw, &name, reply);
                            #[cfg(not(windows))]
                            { reply.send(Err("Windows only".into())).ok(); }
                        }
                        Err(_) => break, // engine dropped → shutdown
                    }
                }
            });

            match rx.recv_timeout(std::time::Duration::from_secs(10)) {
                Ok(Ok(())) => Ok(()),
                Ok(Err(e)) => Err(e),
                Err(_)     => Err("VST initialization timed out".to_string()),
            }
        }
        _ => Err(format!("Format {} not supported for real-time instrument", format)),
    }
}

#[tauri::command]
fn open_vst_instrument_editor(name: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        // Bridged instrument → ask the bridge to show its editor window.
        if bridge_send([3, 0, 0, 0]) { return Ok(()); }
    }
    // Get the cmd_tx from the loaded engine
    let cmd_tx = {
        let lock = vst_instr_mutex().lock().map_err(|e| e.to_string())?;
        let eng = lock.as_ref().ok_or("No VST instrument loaded")?;
        eng.cmd_tx.clone()
    };
    // Send the OpenEditor command to the plugin thread
    // (effEditOpen runs on that thread — same as VSTPluginMain — no deadlock)
    let (reply_tx, reply_rx) = std::sync::mpsc::channel::<Result<(), String>>();
    cmd_tx.try_send(VstPluginCmd::OpenEditor { name, reply: reply_tx })
        .map_err(|_| "Plugin thread busy or unavailable".to_string())?;
    // Wait up to 10s for the window to open (effEditOpen can be slow)
    match reply_rx.recv_timeout(std::time::Duration::from_secs(10)) {
        Ok(r)  => r,
        Err(_) => Err("Editor timed out".to_string()),
    }
}

#[tauri::command]
fn unload_vst_instrument() {
    #[cfg(windows)]
    stop_bridge_instrument();
    if let Ok(mut lock) = vst_instr_mutex().lock() {
        *lock = None;
    }
}

#[tauri::command]
fn vst_note_on(note: u8, velocity: u8) -> Result<(), String> {
    #[cfg(windows)]
    { if bridge_send([1, 0x90, note, velocity]) { return Ok(()); } }
    let lock = vst_instr_mutex().lock().unwrap();
    match lock.as_ref() {
        Some(eng) => {
            let _ = eng.midi_tx.try_send([0x90, note, velocity]);
            Ok(())
        }
        None => Err("No VST instrument loaded".to_string()),
    }
}

/// Tell a bridged tempo-synced plugin (e.g. an arpeggiator) the project BPM so
/// it runs in time with the app's metronome. No-op when no bridge is active.
#[tauri::command]
fn set_vst_tempo(bpm: f32) {
    #[cfg(windows)]
    {
        let b = bpm.round().clamp(20.0, 400.0) as u16;
        bridge_send([4, (b & 0xff) as u8, (b >> 8) as u8, 0]);
    }
    #[cfg(not(windows))]
    let _ = bpm;
}

#[tauri::command]
fn vst_note_off(note: u8) -> Result<(), String> {
    #[cfg(windows)]
    { if bridge_send([1, 0x80, note, 0]) { return Ok(()); } }
    let lock = vst_instr_mutex().lock().unwrap();
    match lock.as_ref() {
        Some(eng) => {
            let _ = eng.midi_tx.try_send([0x80, note, 0]);
            Ok(())
        }
        None => Err("No VST instrument loaded".to_string()),
    }
}

// ── VST2 Effect: offline audio processing ─────────────────────────────────────
// Processes a PCM float32 buffer through a VST2 effect plugin and returns
// the processed audio. Input/output are base64-encoded interleaved float32
// stereo (L0,R0,L1,R1,...). Used by the editor FX chain.
#[tauri::command]
fn apply_vst2_effect(
    vst_path:    String,
    audio_b64:   String,  // interleaved float32 stereo, base64
    sample_rate: u32,
    num_frames:  u32,
) -> Result<String, String> {
    const BLOCK: usize = 512;
    let channels: usize = 2;

    // Decode base64 → raw bytes → f32 samples
    let raw = base64_decode(&audio_b64);
    if raw.len() < num_frames as usize * channels * 4 {
        return Err("Audio buffer too small".into());
    }
    let samples: Vec<f32> = raw.chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0],b[1],b[2],b[3]]))
        .collect();

    // De-interleave: L[0..n], R[0..n]
    let n = num_frames as usize;
    let in_l: Vec<f32> = (0..n).map(|i| samples.get(i*2).copied().unwrap_or(0.0)).collect();
    let in_r: Vec<f32> = (0..n).map(|i| samples.get(i*2+1).copied().unwrap_or(0.0)).collect();
    let mut out_l = vec![0.0f32; n];
    let mut out_r = vec![0.0f32; n];

    // Load VST
    let lib = unsafe { libloading::Library::new(&vst_path) }
        .map_err(|e| format!("VST load error: {}", e))?;
    let effect = unsafe {
        let vst_main: libloading::Symbol<VstPluginMain> = lib.get(b"VSTPluginMain\0")
            .or_else(|_| lib.get(b"main\0"))
            .map_err(|_| "VSTPluginMain not found".to_string())?;
        vst_main(vst2_host_callback)
    };
    if effect.is_null() || unsafe { (*effect).magic } != VST_MAGIC {
        return Err("Invalid VST2 plugin".into());
    }
    let dispatch = unsafe { (*effect).dispatcher }.ok_or("No dispatcher")?;

    unsafe {
        dispatch(effect, EFF_OPEN, 0, 0, std::ptr::null_mut(), 0.0);
        dispatch(effect, 10, 0, 0, std::ptr::null_mut(), sample_rate as f32); // effSetSampleRate
        dispatch(effect, 11, 0, BLOCK as isize, std::ptr::null_mut(), 0.0);   // effSetBlockSize

        // ── Restore state saved from the GUI (effSetChunk or setParameter) ────
        restore_vst2_effect_state(&vst_path, effect);

        dispatch(effect, 12, 0, 1, std::ptr::null_mut(), 0.0);                // effMainsChanged(1)
    }

    // Process in blocks
    let mut pos = 0;
    while pos < n {
        let frames = (n - pos).min(BLOCK);
        let mut blk_il: Vec<f32> = in_l[pos..pos+frames].to_vec();
        let mut blk_ir: Vec<f32> = in_r[pos..pos+frames].to_vec();
        blk_il.resize(BLOCK, 0.0);
        blk_ir.resize(BLOCK, 0.0);
        let mut blk_ol = vec![0.0f32; BLOCK];
        let mut blk_or = vec![0.0f32; BLOCK];
        let mut in_ptrs  = [blk_il.as_mut_ptr(), blk_ir.as_mut_ptr()];
        let mut out_ptrs = [blk_ol.as_mut_ptr(), blk_or.as_mut_ptr()];
        unsafe {
            if !(*effect)._process_replacing.is_null() {
                let process: unsafe extern "C" fn(*mut AEffect, *mut *mut f32, *mut *mut f32, i32)
                    = std::mem::transmute((*effect)._process_replacing);
                process(effect, in_ptrs.as_mut_ptr(), out_ptrs.as_mut_ptr(), frames as i32);
            }
        }
        out_l[pos..pos+frames].copy_from_slice(&blk_ol[..frames]);
        out_r[pos..pos+frames].copy_from_slice(&blk_or[..frames]);
        pos += frames;
    }

    unsafe {
        dispatch(effect, 12, 0, 0, std::ptr::null_mut(), 0.0); // effMainsChanged(0)
        dispatch(effect, EFF_CLOSE, 0, 0, std::ptr::null_mut(), 0.0);
    }
    drop(lib);

    // Re-interleave and encode to base64
    let mut result = Vec::with_capacity(n * channels * 4);
    for i in 0..n {
        result.extend_from_slice(&out_l[i].to_le_bytes());
        result.extend_from_slice(&out_r[i].to_le_bytes());
    }
    Ok(base64_encode(&result))
}

// ── Audio Metadata ────────────────────────────────────────────────────────────

#[tauri::command]
async fn read_audio_metadata(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Try ffprobe first (sidecar), fall back to PATH
        let ffprobe = {
            let sp = sidecar_path("ffprobe");
            if sp.exists() { sp } else { std::path::PathBuf::from("ffprobe") }
        };
        let out = std::process::Command::new(&ffprobe)
            .args(["-v", "quiet", "-print_format", "json",
                   "-show_format", "-show_streams", path.as_str()])
            .output()
            .map_err(|e| format!("ffprobe introuvable: {}", e))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).into_owned());
        }
        String::from_utf8(out.stdout).map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn write_audio_metadata(path: String, tags: String, artwork_path: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ffmpeg = sidecar_path("ffmpeg");
        let ext = std::path::Path::new(&path)
            .extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let tmp = format!("{}.tmp_meta.{}", path, ext);

        let tags_val: serde_json::Value = serde_json::from_str(&tags)
            .map_err(|e| e.to_string())?;

        let mut args: Vec<String> = vec!["-y".into(), "-i".into(), path.clone()];

        if let Some(ref art) = artwork_path {
            args.extend(["-i".into(), art.clone()]);
            // map audio from first input, image from second
            args.extend(["-map".into(), "0:a".into(), "-map".into(), "1:v".into()]);
            args.extend(["-c:a".into(), "copy".into(), "-c:v".into(), "copy".into()]);
            // ID3 cover tag for MP3
            if ext == "mp3" {
                args.extend(["-id3v2_version".into(), "3".into()]);
                args.extend(["-metadata:s:v".into(), "title=Album cover".into()]);
                args.extend(["-metadata:s:v".into(), "comment=Cover (front)".into()]);
            }
        } else {
            args.extend(["-codec".into(), "copy".into()]);
        }

        if let Some(obj) = tags_val.as_object() {
            for (k, v) in obj {
                if let Some(s) = v.as_str() {
                    args.push("-metadata".into());
                    args.push(format!("{}={}", k, s));
                }
            }
        }
        args.push(tmp.clone());

        let out = std::process::Command::new(&ffmpeg)
            .args(&args)
            .output()
            .map_err(|e| format!("ffmpeg: {}", e))?;
        if !out.status.success() {
            let _ = std::fs::remove_file(&tmp);
            return Err(String::from_utf8_lossy(&out.stderr).into_owned());
        }
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn extract_audio_artwork(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ffmpeg = sidecar_path("ffmpeg");
        let tmp = format!("{}.artwork_tmp.jpg", path);
        let out = std::process::Command::new(&ffmpeg)
            .args(["-y", "-i", &path, "-an", "-vcodec", "copy", &tmp])
            .output()
            .map_err(|e| e.to_string())?;
        if out.status.success() {
            match std::fs::read(&tmp) {
                Ok(bytes) => {
                    let _ = std::fs::remove_file(&tmp);
                    Ok(base64_encode(&bytes))
                }
                Err(_) => Ok(String::new()),
            }
        } else {
            let _ = std::fs::remove_file(&tmp);
            Ok(String::new()) // no artwork is not an error
        }
    }).await.map_err(|e| e.to_string())?
}

// ── QR code ──────────────────────────────────────────────────────────────────

#[tauri::command]
async fn generate_qrcode(
    data: String, fg: String, bg: String, ec: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use qrcode::{QrCode, EcLevel};
        use qrcode::render::svg;

        let ec_level = match ec.as_str() {
            "L" => EcLevel::L,
            "Q" => EcLevel::Q,
            "H" => EcLevel::H,
            _   => EcLevel::M,
        };
        let code = QrCode::with_error_correction_level(data.as_bytes(), ec_level)
            .map_err(|e| e.to_string())?;

        let fg_color = svg::Color(Box::leak(fg.into_boxed_str()));
        let bg_color = svg::Color(Box::leak(bg.into_boxed_str()));

        let svg_str: String = code.render::<svg::Color<'_>>()
            .min_dimensions(400, 400)
            .dark_color(fg_color)
            .light_color(bg_color)
            .quiet_zone(true)
            .build();

        Ok(svg_str)
    }).await.map_err(|e| e.to_string())?
}

// ── FFmpeg runner (multi-input, arbitrary args) ────────────────────────────────

#[tauri::command]
async fn ffmpeg_run(args: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ffmpeg = sidecar_path("ffmpeg");
        let out = std::process::Command::new(&ffmpeg)
            .args(&args)
            .output()
            .map_err(|e| format!("FFmpeg introuvable: {}", e))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).into_owned());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

// ── PDF helpers ───────────────────────────────────────────────────────────────

fn remap_obj_refs(
    obj: &mut lopdf::Object,
    map: &std::collections::HashMap<lopdf::ObjectId, lopdf::ObjectId>,
) {
    use lopdf::Object;
    match obj {
        Object::Reference(id) => { if let Some(&n) = map.get(id) { *id = n; } }
        Object::Array(arr)    => arr.iter_mut().for_each(|o| remap_obj_refs(o, map)),
        Object::Dictionary(d) => d.iter_mut().for_each(|(_, o)| remap_obj_refs(o, map)),
        Object::Stream(s)     => s.dict.iter_mut().for_each(|(_, o)| remap_obj_refs(o, map)),
        _ => {}
    }
}

// ── PDF Commands ──────────────────────────────────────────────────────────────

#[tauri::command]
async fn pdf_info(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let doc = lopdf::Document::load(&path).map_err(|e| e.to_string())?;
        let pages = doc.get_pages();
        let page_count = pages.len();
        let (pw, ph) = pages.values().next()
            .and_then(|&pid| doc.get_object(pid).ok())
            .and_then(|o| o.as_dict().ok())
            .and_then(|d| d.get(b"MediaBox").ok())
            .and_then(|o| o.as_array().ok())
            .filter(|a| a.len() == 4)
            .map(|a| {
                let x0 = a[0].as_float().unwrap_or(0.0);
                let y0 = a[1].as_float().unwrap_or(0.0);
                let x1 = a[2].as_float().unwrap_or(595.0);
                let y1 = a[3].as_float().unwrap_or(842.0);
                (x1 - x0, y1 - y0)
            })
            .unwrap_or((595.0, 842.0));
        Ok(format!(r#"{{"page_count":{},"width":{},"height":{}}}"#, page_count, pw, ph))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pdf_merge(paths: Vec<String>, output: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use lopdf::{Document, Object};
        use std::collections::HashMap;

        if paths.is_empty() { return Err("Aucun fichier sélectionné".into()); }
        if paths.len() == 1 {
            return std::fs::copy(&paths[0], &output).map(|_| ()).map_err(|e| e.to_string());
        }

        let docs: Vec<Document> = paths.iter()
            .map(|p| Document::load(p).map_err(|e| format!("Erreur {}: {}", p, e)))
            .collect::<Result<Vec<_>, _>>()?;

        let mut merged = Document::with_version("1.5");
        let mut next_id: u32 = 1;
        let mut all_page_ids: Vec<lopdf::ObjectId> = Vec::new();

        for doc in &docs {
            let mut id_map: HashMap<lopdf::ObjectId, lopdf::ObjectId> = HashMap::new();
            let mut sorted: Vec<lopdf::ObjectId> = doc.objects.keys().cloned().collect();
            sorted.sort();
            for &old in &sorted {
                let new = (next_id, 0);
                id_map.insert(old, new);
                next_id += 1;
            }
            for &old in &sorted {
                if let Some(obj) = doc.objects.get(&old) {
                    let mut new_obj = obj.clone();
                    remap_obj_refs(&mut new_obj, &id_map);
                    merged.objects.insert(id_map[&old], new_obj);
                }
            }
            let pages_map = doc.get_pages();
            let mut nums: Vec<u32> = pages_map.keys().cloned().collect();
            nums.sort();
            for n in nums {
                if let Some(&old_pid) = pages_map.get(&n) {
                    all_page_ids.push(id_map[&old_pid]);
                }
            }
        }

        let pages_id = (next_id, 0); next_id += 1;
        for &pid in &all_page_ids {
            if let Some(Object::Dictionary(d)) = merged.objects.get_mut(&pid) {
                d.set("Parent", Object::Reference(pages_id));
            }
        }
        let kids: Vec<Object> = all_page_ids.iter().map(|&id| Object::Reference(id)).collect();
        {
            let mut d = lopdf::Dictionary::new();
            d.set("Type",  Object::Name(b"Pages".to_vec()));
            d.set("Kids",  Object::Array(kids));
            d.set("Count", Object::Integer(all_page_ids.len() as i64));
            merged.objects.insert(pages_id, Object::Dictionary(d));
        }

        let catalog_id = (next_id, 0); next_id += 1;
        {
            let mut d = lopdf::Dictionary::new();
            d.set("Type",  Object::Name(b"Catalog".to_vec()));
            d.set("Pages", Object::Reference(pages_id));
            merged.objects.insert(catalog_id, Object::Dictionary(d));
        }

        merged.max_id = next_id;
        merged.trailer.set("Root", Object::Reference(catalog_id));
        merged.trailer.set("Size", Object::Integer(next_id as i64));
        merged.save(&output).map(|_| ()).map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pdf_split(path: String, output_dir: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use lopdf::Document;
        let doc = Document::load(&path).map_err(|e| e.to_string())?;
        let total = doc.get_pages().len() as u32;
        std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
        let stem = std::path::Path::new(&path)
            .file_stem().and_then(|s| s.to_str()).unwrap_or("page");
        let mut out_paths = Vec::new();
        for n in 1..=total {
            let mut d = Document::load(&path).map_err(|e| e.to_string())?;
            let to_del: Vec<u32> = (1..=total).filter(|&x| x != n).collect();
            d.delete_pages(&to_del);
            let p = format!("{}/{}_{:03}.pdf", output_dir, stem, n);
            d.save(&p).map(|_| ()).map_err(|e| e.to_string())?;
            out_paths.push(p);
        }
        Ok(out_paths)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pdf_rotate(path: String, output: String, pages: Vec<u32>, degrees: i64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use lopdf::Object;
        let mut doc = lopdf::Document::load(&path).map_err(|e| e.to_string())?;
        let pages_map = doc.get_pages();
        let targets: Vec<u32> = if pages.is_empty() {
            pages_map.keys().cloned().collect()
        } else { pages };
        for n in targets {
            if let Some(&pid) = pages_map.get(&n) {
                if let Some(Object::Dictionary(d)) = doc.objects.get_mut(&pid) {
                    let cur = d.get(b"Rotate")
                        .and_then(|o| o.as_i64())
                        .unwrap_or(0);
                    let new_rot = ((cur + degrees) % 360 + 360) % 360;
                    d.set("Rotate", Object::Integer(new_rot));
                }
            }
        }
        doc.save(&output).map(|_| ()).map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn pdf_reorder(path: String, output: String, order: Vec<u32>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use lopdf::Object;
        let mut doc = lopdf::Document::load(&path).map_err(|e| e.to_string())?;
        let pages_map = doc.get_pages();

        let pages_id: lopdf::ObjectId = {
            let root_id = doc.trailer.get(b"Root")
                .and_then(|o| o.as_reference())
                .map_err(|e| e.to_string())?;
            let cat = doc.objects.get(&root_id)
                .ok_or("Catalog manquant")?
                .as_dict().map_err(|e| e.to_string())?;
            cat.get(b"Pages")
                .and_then(|o| o.as_reference())
                .map_err(|e| e.to_string())?
        };

        let new_kids: Vec<Object> = order.iter()
            .filter_map(|n| pages_map.get(n))
            .map(|&id| Object::Reference(id))
            .collect();
        let count = new_kids.len() as i64;

        if let Some(Object::Dictionary(d)) = doc.objects.get_mut(&pages_id) {
            d.set("Kids",  Object::Array(new_kids));
            d.set("Count", Object::Integer(count));
        }
        doc.save(&output).map(|_| ()).map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn images_to_pdf(paths: Vec<String>, output: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use lopdf::{Document, Object, Stream};
        use image::ImageEncoder;

        let mut doc = Document::with_version("1.5");
        let mut next_id: u32 = 1;
        let pages_id = (next_id, 0); next_id += 1;
        let mut page_ids: Vec<lopdf::ObjectId> = Vec::new();

        for img_path in &paths {
            let img = image::open(img_path)
                .map_err(|e| format!("Image {}: {}", img_path, e))?;
            let rgb = img.to_rgb8();
            let (w, h) = rgb.dimensions();

            // Encode as JPEG in memory
            let mut jpeg: Vec<u8> = Vec::new();
            image::codecs::jpeg::JpegEncoder::new_with_quality(
                &mut std::io::Cursor::new(&mut jpeg), 92,
            )
            .write_image(rgb.as_raw(), w, h, image::ExtendedColorType::Rgb8)
            .map_err(|e| e.to_string())?;

            // Image XObject
            let mut img_dict = lopdf::Dictionary::new();
            img_dict.set("Type",             Object::Name(b"XObject".to_vec()));
            img_dict.set("Subtype",          Object::Name(b"Image".to_vec()));
            img_dict.set("Width",            Object::Integer(w as i64));
            img_dict.set("Height",           Object::Integer(h as i64));
            img_dict.set("ColorSpace",       Object::Name(b"DeviceRGB".to_vec()));
            img_dict.set("BitsPerComponent", Object::Integer(8));
            img_dict.set("Filter",           Object::Name(b"DCTDecode".to_vec()));
            let img_id = (next_id, 0); next_id += 1;
            doc.objects.insert(img_id, Object::Stream(Stream::new(img_dict, jpeg)));

            // Content stream
            let content = format!("q {} 0 0 {} 0 0 cm /Im0 Do Q", w, h).into_bytes();
            let mut cdict = lopdf::Dictionary::new();
            cdict.set("Length", Object::Integer(content.len() as i64));
            let content_id = (next_id, 0); next_id += 1;
            doc.objects.insert(content_id, Object::Stream(Stream::new(cdict, content)));

            // Page
            let page_id = (next_id, 0); next_id += 1;
            {
                let mut xobj_d = lopdf::Dictionary::new();
                xobj_d.set("Im0", Object::Reference(img_id));
                let mut res_d = lopdf::Dictionary::new();
                res_d.set("XObject", Object::Dictionary(xobj_d));
                let mut page_d = lopdf::Dictionary::new();
                page_d.set("Type",     Object::Name(b"Page".to_vec()));
                page_d.set("Parent",   Object::Reference(pages_id));
                page_d.set("MediaBox", Object::Array(vec![
                    Object::Integer(0), Object::Integer(0),
                    Object::Integer(w as i64), Object::Integer(h as i64),
                ]));
                page_d.set("Contents",  Object::Reference(content_id));
                page_d.set("Resources", Object::Dictionary(res_d));
                doc.objects.insert(page_id, Object::Dictionary(page_d));
            }
            page_ids.push(page_id);
        }

        // Pages node
        let kids: Vec<Object> = page_ids.iter().map(|&id| Object::Reference(id)).collect();
        {
            let mut d = lopdf::Dictionary::new();
            d.set("Type",  Object::Name(b"Pages".to_vec()));
            d.set("Kids",  Object::Array(kids));
            d.set("Count", Object::Integer(page_ids.len() as i64));
            doc.objects.insert(pages_id, Object::Dictionary(d));
        }

        // Catalog
        let catalog_id = (next_id, 0); next_id += 1;
        {
            let mut d = lopdf::Dictionary::new();
            d.set("Type",  Object::Name(b"Catalog".to_vec()));
            d.set("Pages", Object::Reference(pages_id));
            doc.objects.insert(catalog_id, Object::Dictionary(d));
        }

        doc.max_id = next_id;
        doc.trailer.set("Root", Object::Reference(catalog_id));
        doc.trailer.set("Size", Object::Integer(next_id as i64));
        doc.save(&output).map(|_| ()).map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

// ── Conversion universelle ────────────────────────────────────────────────────

#[tauri::command]
async fn convert_image(input: String, output: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(&input)
            .map_err(|e| format!("Impossible d'ouvrir l'image: {}", e))?;
        img.save(&output).map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn convert_media(input: String, output: String, extra_args: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ffmpeg = sidecar_path("ffmpeg");
        let mut args: Vec<String> = vec!["-y".into(), "-i".into(), input];
        args.extend(extra_args);
        args.push(output);
        let out = std::process::Command::new(&ffmpeg)
            .args(&args)
            .output()
            .map_err(|e| format!("FFmpeg introuvable: {}", e))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).into_owned());
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

// ── Effets d'image locaux (photon-rs + imageproc) ─────────────────────────────

#[tauri::command]
async fn photon_filter(base64: String, filter: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut img = photon_rs::base64_to_image(&base64);
        match filter.as_str() {
            "grayscale" => photon_rs::monochrome::grayscale(&mut img),
            "sepia"     => photon_rs::monochrome::sepia(&mut img),
            "sharpen"   => photon_rs::conv::sharpen(&mut img),
            "edges"     => photon_rs::conv::edge_detection(&mut img),
            other => return Err(format!("Filtre photon inconnu : {}", other)),
        }
        Ok(base64_encode(&img.get_bytes()))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn imageproc_filter(base64: String, filter: String, param: f32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = base64_decode(&base64);
        let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
        let mut out_bytes: Vec<u8> = Vec::new();
        match filter.as_str() {
            "blur" => {
                let rgba = img.to_rgba8();
                let blurred = imageproc::filter::gaussian_blur_f32(&rgba, param.max(0.1));
                image::DynamicImage::ImageRgba8(blurred)
                    .write_to(&mut std::io::Cursor::new(&mut out_bytes), image::ImageFormat::Png)
                    .map_err(|e| e.to_string())?;
            }
            "canny" => {
                let gray = img.to_luma8();
                let edges = imageproc::edges::canny(&gray, param.max(0.0), (param * 2.0).max(1.0));
                image::DynamicImage::ImageLuma8(edges)
                    .write_to(&mut std::io::Cursor::new(&mut out_bytes), image::ImageFormat::Png)
                    .map_err(|e| e.to_string())?;
            }
            other => return Err(format!("Filtre imageproc inconnu : {}", other)),
        }
        Ok(base64_encode(&out_bytes))
    }).await.map_err(|e| e.to_string())?
}

// ── Amélioration IA locale (Real-ESRGAN ncnn-vulkan, sidecar) ────────────────
// Le binaire + son dossier "realesrgan-models" doivent être placés à côté de
// l'exécutable (voir src-tauri/binaries/README pour la marche à suivre).
#[tauri::command]
async fn upscale_image(base64: String, scale: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = base64_decode(&base64);
        let dir   = std::env::temp_dir();
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let input  = dir.join(format!("iceample_up_in_{}.png", stamp));
        let output = dir.join(format!("iceample_up_out_{}.png", stamp));
        std::fs::write(&input, &bytes).map_err(|e| e.to_string())?;

        let exe        = sidecar_path("realesrgan-ncnn-vulkan");
        let models_dir = exe.parent().unwrap_or(std::path::Path::new(".")).join("realesrgan-models");
        let scale_arg  = scale.clamp(2, 4).to_string();

        let result = std::process::Command::new(&exe)
            .args([
                "-i", input.to_str().unwrap_or_default(),
                "-o", output.to_str().unwrap_or_default(),
                "-n", "realesrgan-x4plus",
                "-s", &scale_arg,
                "-m", models_dir.to_str().unwrap_or("realesrgan-models"),
            ])
            .output();

        let _ = std::fs::remove_file(&input);
        let out = result.map_err(|e| format!("Real-ESRGAN introuvable : {}", e))?;
        if !out.status.success() {
            let _ = std::fs::remove_file(&output);
            return Err(String::from_utf8_lossy(&out.stderr).into_owned());
        }
        let data = std::fs::read(&output).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&output);
        Ok(base64_encode(&data))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn find_libreoffice() -> String {
    let candidates = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        r"C:\Program Files\LibreOffice 7\program\soffice.exe",
        r"C:\Program Files\LibreOffice 6\program\soffice.exe",
        r"C:\Program Files\LibreOffice 24\program\soffice.exe",
    ];
    for p in &candidates {
        if std::path::Path::new(p).exists() { return p.to_string(); }
    }
    if let Ok(o) = std::process::Command::new("where").arg("soffice").output() {
        if o.status.success() {
            if let Ok(s) = String::from_utf8(o.stdout) {
                let line = s.lines().next().unwrap_or("").trim().to_string();
                if !line.is_empty() { return line; }
            }
        }
    }
    String::new()
}

#[tauri::command]
async fn convert_with_libreoffice(
    soffice: String, input: String, output_dir: String, format: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
        let out = std::process::Command::new(&soffice)
            .args(["--headless", "--convert-to", &format, "--outdir", &output_dir, &input])
            .output()
            .map_err(|e| format!("LibreOffice: {}", e))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).into_owned());
        }
        // Locate the generated file
        let stem = std::path::Path::new(&input)
            .file_stem().and_then(|s| s.to_str()).unwrap_or("output");
        let ext = format.split(':').next().unwrap_or(&format);
        let guessed = format!("{}/{}.{}", output_dir, stem, ext);
        if std::path::Path::new(&guessed).exists() { return Ok(guessed); }
        // Fallback: search output_dir for a file with the right extension
        if let Ok(rd) = std::fs::read_dir(&output_dir) {
            for e in rd.filter_map(|e| e.ok()) {
                let p = e.path();
                if p.extension().and_then(|x| x.to_str()).map(|x| x.to_lowercase() == ext).unwrap_or(false) {
                    return Ok(p.to_string_lossy().into_owned());
                }
            }
        }
        Err(format!("Fichier de sortie introuvable: {}", guessed))
    }).await.map_err(|e| e.to_string())?
}

// ── Whisper transcription (whisper.cpp CLI) ──────────────────────────────────
// Runs the user-provided whisper-cli.exe on an audio file and returns the SRT
// text. Same spawning pattern as the yt-dlp/ffmpeg commands above, plus
// CREATE_NO_WINDOW so no console flashes on Windows.

#[tauri::command]
async fn whisper_transcribe(
    exe_path: String, model_path: String, audio_path: String, lang: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !std::path::Path::new(&exe_path).exists() {
            return Err(format!("whisper-missing: exécutable introuvable ({})", exe_path));
        }
        if !std::path::Path::new(&model_path).exists() {
            return Err(format!("whisper-missing: modèle introuvable ({})", model_path));
        }
        let lang_arg = if lang.trim().is_empty() { "auto".to_string() } else { lang };
        // Output next to the audio file: <audio>.sub → whisper writes <audio>.sub.srt
        let temp_base = format!("{}.sub", audio_path);
        let srt_path  = format!("{}.srt", temp_base);

        let mut cmd = std::process::Command::new(&exe_path);
        cmd.args(["-m", &model_path, "-f", &audio_path, "-l", &lang_arg, "-osrt", "-of", &temp_base]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let out = cmd.output()
            .map_err(|e| format!("Lancement de whisper impossible: {}", e))?;

        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
            let lines: Vec<&str> = stderr.lines().collect();
            let tail = lines[lines.len().saturating_sub(6)..].join("\n");
            let _ = std::fs::remove_file(&srt_path);
            let _ = std::fs::remove_file(&temp_base);
            return Err(if tail.trim().is_empty() {
                "whisper: échec sans message".to_string()
            } else {
                format!("whisper: {}", tail)
            });
        }

        let srt = std::fs::read_to_string(&srt_path)
            .map_err(|e| format!("Lecture du SRT impossible ({}): {}", srt_path, e));
        let _ = std::fs::remove_file(&srt_path);
        let _ = std::fs::remove_file(&temp_base);
        srt
    }).await.map_err(|e| e.to_string())?
}

// ── RAW: aperçu JPEG embarqué (sans outil externe) ───────────────────────────
// Presque tous les RAW (CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG…) embarquent un
// ou plusieurs JPEG. On scanne le fichier en UNE passe linéaire : les SOI
// (FF D8 FF) sont empilés, chaque EOI (FF D9) dépile le SOI le plus récent —
// ce qui apparie correctement les JPEG imbriqués (la vignette EXIF vit à
// l'intérieur du grand aperçu). On garde le plus gros segment : c'est
// l'aperçu pleine résolution, le petit étant la vignette.
//
// Filtre qualité : les CR2/DNG stockent aussi les données capteur en JPEG
// *lossless* (SOI suivi de FF C3), illisible par un navigateur et souvent plus
// gros que l'aperçu. On privilégie donc les candidats dont le marqueur suivant
// le SOI est un APPn (FF E0..FF EF, JFIF/EXIF) ou un DQT (FF DB) — absents des
// flux lossless. Si aucun candidat ne passe ce filtre, on retombe sur le plus
// gros candidat brut plutôt que d'échouer.
#[tauri::command]
async fn raw_embedded_preview(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        const MIN_PREVIEW: usize = 8 * 1024; // ignore les vignettes minuscules

        let buf = std::fs::read(&path).map_err(|e| format!("raw-read: {}", e))?;
        let n = buf.len();

        let mut open: Vec<usize> = Vec::new();
        let mut best: Option<(usize, usize)> = None;     // candidat "vrai JPEG"
        let mut best_any: Option<(usize, usize)> = None; // repli, tout candidat

        let mut i = 0usize;
        while i + 1 < n {
            if buf[i] == 0xFF {
                let m = buf[i + 1];
                if m == 0xD8 && i + 2 < n && buf[i + 2] == 0xFF {
                    open.push(i);
                    i += 2;
                    continue;
                }
                if m == 0xD9 {
                    if let Some(start) = open.pop() {
                        let end = i + 2;
                        let len = end - start;
                        if len >= MIN_PREVIEW {
                            if best_any.map_or(true, |(s, e)| len > e - s) {
                                best_any = Some((start, end));
                            }
                            let marker_ok = start + 3 < n
                                && matches!(buf[start + 3], 0xE0..=0xEF | 0xDB);
                            if marker_ok && best.map_or(true, |(s, e)| len > e - s) {
                                best = Some((start, end));
                            }
                        }
                    }
                    i += 2;
                    continue;
                }
            }
            i += 1;
        }

        match best.or(best_any) {
            Some((start, end)) => Ok(base64_encode(&buf[start..end])),
            None => Err("raw-nopreview".to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── RAW: dématriçage réel via dcraw_emu / dcraw ──────────────────────────────
// Lance l'exécutable LibRaw fourni par l'utilisateur, qui écrit un PPM, puis
// renvoie un PNG en base64. Même schéma de spawn que whisper_transcribe
// (CREATE_NO_WINDOW sous Windows) et même préfixe d'erreur "raw-missing:" que
// "whisper-missing:" pour que le JS rouvre son dialogue de configuration.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawOpts {
    pub half: bool,
    pub wb: String,
    pub exposure: f32,
    pub highlights: u8,
    pub quality: u8,
    pub no_auto_bright: bool,
}

// PPM binaire P6 : "P6", largeur, hauteur, maxval (séparés par des blancs, les
// commentaires '#' pouvant s'intercaler), UN seul octet blanc, puis les pixels.
// Renvoie (largeur, hauteur, pixels RGB8).
fn parse_ppm_p6(data: &[u8]) -> Result<(u32, u32, Vec<u8>), String> {
    fn token(data: &[u8], pos: &mut usize) -> Option<u64> {
        loop {
            while *pos < data.len() && data[*pos].is_ascii_whitespace() {
                *pos += 1;
            }
            if *pos < data.len() && data[*pos] == b'#' {
                while *pos < data.len() && data[*pos] != b'\n' {
                    *pos += 1;
                }
            } else {
                break;
            }
        }
        let start = *pos;
        while *pos < data.len() && data[*pos].is_ascii_digit() {
            *pos += 1;
        }
        if *pos == start {
            return None;
        }
        std::str::from_utf8(&data[start..*pos]).ok()?.parse::<u64>().ok()
    }

    if data.len() < 2 || &data[0..2] != b"P6" {
        return Err("raw-ppm: en-tête P6 introuvable".to_string());
    }
    let mut pos = 2usize;
    let w = token(data, &mut pos).ok_or("raw-ppm: largeur illisible")?;
    let h = token(data, &mut pos).ok_or("raw-ppm: hauteur illisible")?;
    let maxval = token(data, &mut pos).ok_or("raw-ppm: maxval illisible")?;
    // Exactement un octet blanc sépare l'en-tête des pixels.
    if pos < data.len() && data[pos].is_ascii_whitespace() {
        pos += 1;
    }
    if w == 0 || h == 0 || w > 65535 || h > 65535 {
        return Err(format!("raw-ppm: dimensions invalides ({}x{})", w, h));
    }
    let px = (w as usize) * (h as usize);
    let body = &data[pos.min(data.len())..];

    let rgb = match maxval {
        0..=255 => {
            let need = px * 3;
            if body.len() < need {
                return Err(format!(
                    "raw-ppm: données tronquées ({} octets, {} attendus)",
                    body.len(), need
                ));
            }
            body[..need].to_vec()
        }
        256..=65535 => {
            // 16 bits big-endian : on ne garde que l'octet de poids fort.
            let need = px * 6;
            if body.len() < need {
                return Err(format!(
                    "raw-ppm: données 16 bits tronquées ({} octets, {} attendus)",
                    body.len(), need
                ));
            }
            body[..need].iter().step_by(2).copied().collect()
        }
        _ => return Err(format!("raw-ppm: maxval non supporté ({})", maxval)),
    };

    Ok((w as u32, h as u32, rgb))
}

#[tauri::command]
async fn raw_develop(
    exe_path: String, raw_path: String, opts: RawOpts,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !std::path::Path::new(&exe_path).exists() {
            return Err(format!("raw-missing: exécutable introuvable ({})", exe_path));
        }
        if !std::path::Path::new(&raw_path).exists() {
            return Err(format!("raw-missing: fichier RAW introuvable ({})", raw_path));
        }

        // On laisse dcraw_emu écrire sa sortie par défaut plutôt que d'utiliser
        // -Z, qui n'existe pas dans toutes les variantes : c'est l'approche la
        // plus portable. dcraw_emu ajoute ".ppm" au chemin complet, le dcraw
        // classique remplace l'extension — on teste donc les deux.
        let mut args: Vec<String> = vec!["-o".into(), "1".into()]; // sortie sRGB
        match opts.wb.as_str() {
            "camera" => args.push("-w".into()),
            "auto" => args.push("-a".into()),
            _ => {} // valeurs par défaut du RAW
        }
        args.push("-q".into());
        args.push(opts.quality.min(3).to_string());
        args.push("-H".into());
        args.push(opts.highlights.min(9).to_string());
        let exposure = if opts.exposure.is_finite() {
            opts.exposure.clamp(0.1, 8.0)
        } else {
            1.0
        };
        args.push("-b".into());
        args.push(format!("{:.3}", exposure));
        if opts.half {
            args.push("-h".into()); // demi-résolution : bien plus rapide
        }
        if opts.no_auto_bright {
            args.push("-W".into());
        }
        args.push(raw_path.clone());

        let mut cmd = std::process::Command::new(&exe_path);
        cmd.args(&args);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let out = cmd.output()
            .map_err(|e| format!("raw-decode: lancement impossible: {}", e))?;

        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
            let lines: Vec<&str> = stderr.lines().collect();
            let tail = lines[lines.len().saturating_sub(6)..].join("\n");
            return Err(if tail.trim().is_empty() {
                "raw-decode: échec sans message".to_string()
            } else {
                format!("raw-decode: {}", tail)
            });
        }

        // Variante dcraw_emu : <raw_path>.ppm — variante dcraw : <stem>.ppm
        let appended = format!("{}.ppm", raw_path);
        let stem_variant = std::path::Path::new(&raw_path)
            .with_extension("ppm")
            .to_string_lossy()
            .into_owned();
        let ppm_path = if std::path::Path::new(&appended).exists() {
            appended.clone()
        } else if std::path::Path::new(&stem_variant).exists() {
            stem_variant.clone()
        } else {
            return Err(format!(
                "raw-decode: PPM de sortie introuvable (essayé: {} et {})",
                appended, stem_variant
            ));
        };

        let ppm = std::fs::read(&ppm_path)
            .map_err(|e| format!("raw-decode: lecture du PPM impossible ({}): {}", ppm_path, e));
        let ppm = match ppm {
            Ok(v) => v,
            Err(e) => {
                let _ = std::fs::remove_file(&ppm_path);
                return Err(e);
            }
        };
        let parsed = parse_ppm_p6(&ppm);
        let _ = std::fs::remove_file(&ppm_path); // temporaire, au mieux
        let (w, h, rgb) = parsed?;

        let img = image::RgbImage::from_raw(w, h, rgb)
            .ok_or_else(|| "raw-ppm: tampon incohérent avec les dimensions".to_string())?;
        let mut png: Vec<u8> = Vec::new();
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .map_err(|e| format!("raw-png: {}", e))?;

        Ok(base64_encode(&png))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn pick_files_with_filter(
    app: tauri::AppHandle,
    filter_name: String,
    extensions: Vec<String>,
) -> Option<Vec<String>> {
    let ext_refs: Vec<&str> = extensions.iter().map(String::as_str).collect();
    app.dialog().file()
        .add_filter(&filter_name, &ext_refs)
        .blocking_pick_files()
        .map(|v| v.into_iter().map(|p| p.to_string()).collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_audio_inputs,
            list_audio_outputs,
            list_midi_inputs,
            pick_and_setup_library,
            setup_default_library,
            pick_folder,
            open_folder,
            list_folder_contents,
            search_library,
            pick_audio_file,
            rename_file,
            delete_file,
            pick_multiple_audio_files,
            copy_file,
            download_audio_yt,
            update_ytdlp,
            read_text_file,
            save_text_file,
            save_binary_file,
            read_file_base64,
            scan_vsts,
            pick_vst_folder,
            pick_vst_file,
            open_vst_editor,
            load_vst_instrument,
            unload_vst_instrument,
            open_vst_instrument_editor,
            vst_note_on,
            vst_note_off,
            set_vst_tempo,
            apply_vst2_effect,
            read_audio_metadata,
            write_audio_metadata,
            extract_audio_artwork,
            generate_qrcode,
            ffmpeg_run,
            whisper_transcribe,
            raw_embedded_preview,
            raw_develop,
            pdf_info,
            pdf_merge,
            pdf_split,
            pdf_rotate,
            pdf_reorder,
            images_to_pdf,
            find_libreoffice,
            convert_with_libreoffice,
            pick_files_with_filter,
            convert_image,
            convert_media,
            photon_filter,
            imageproc_filter,
            upscale_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
