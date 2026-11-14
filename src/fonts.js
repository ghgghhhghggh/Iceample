// fonts.js — A font able to draw a given text.
//
// ffmpeg's drawtext (texts burned into videos) uses ONE font file and has no
// fallback: Arial alone turns Chinese, Japanese or Korean into empty boxes.
// So the font follows the script of the text, picked among the fonts every
// Windows 10/11 install ships (nothing bundled, nothing from the user's
// machine). The CSS family is the same font, for previews and canvases.
// (The bundled ffmpeg has HarfBuzz + FriBidi: Arabic and Hebrew are joined and
// laid out right to left by drawtext itself.)

const SCRIPTS = [
  // kana → Japanese (checked before Han: Japanese text mixes both)
  { re: /[぀-ヿㇰ-ㇿｦ-ﾟ]/, file: 'YuGothM.ttc', bold: 'YuGothB.ttc', css: "'Yu Gothic UI','Yu Gothic','Meiryo'" },
  // Hangul → Korean
  { re: /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿]/, file: 'malgun.ttf', bold: 'malgunbd.ttf', css: "'Malgun Gothic'" },
  // Han ideographs / CJK punctuation → Chinese
  { re: /[⺀-⿟　-〿㐀-䶿一-鿿豈-﫿]/, file: 'msyh.ttc', bold: 'msyhbd.ttc', css: "'Microsoft YaHei','Microsoft YaHei UI'" },
  // Arabic, Hebrew
  { re: /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/, file: 'segoeui.ttf', bold: 'segoeuib.ttf', css: "'Segoe UI'" },
  // Indian scripts
  { re: /[ऀ-෿]/, file: 'Nirmala.ttc', bold: 'Nirmala.ttc', css: "'Nirmala UI'" },
  // Thai
  { re: /[฀-๿]/, file: 'LeelawUI.ttf', bold: 'LeelaUIb.ttf', css: "'Leelawadee UI'" },
]
const LATIN = { file: 'arial.ttf', bold: 'arialbd.ttf', css: 'Arial' }

/** { file, css } of a font that has the glyphs of `text`. */
export function fontForText(text, { bold = false } = {}) {
  const s = String(text || '')
  const f = SCRIPTS.find(x => x.re.test(s)) || LATIN
  return { file: bold ? f.bold : f.file, css: f.css }
}

/** The font file for ffmpeg's drawtext, already escaped for its option
 *  parser (the drive colon), to be put inside single quotes: fontfile='…'. */
export function ffmpegFontFile(text, opts) {
  return 'C\\:/Windows/Fonts/' + fontForText(text, opts).file
}

/** CSS font-family for the same text (falls back to the app's sans-serif). */
export function cssFontFor(text) {
  return fontForText(text).css + ', Arial, sans-serif'
}
