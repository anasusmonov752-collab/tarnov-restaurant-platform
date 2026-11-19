// ── Telegram ovozi -> Mini App ichida o'ynatish ──
// Telegram ovozli xabari OGG/Opus. iPhone'dagi Mini App (WKWebView) uni
// ishonchli o'ynatmaydi — shuning uchun ilgari ovoz mijozning Telegram
// chatiga yuborilardi. Endi bir marta AAC (m4a) ga o'giriladi (ffmpeg-static,
// tts.js bilan bir xil) va xotirada saqlanadi; endpoint Range so'rovlarini
// qo'llaydi (iOS <audio> faqat 206 javob bilan o'ynatadi).

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const tg = require('./telegram');

const MAX_BYTES = 5 * 1024 * 1024;       // ovozli tanishuv odatda < 300 KB
const KEEP = 40;                          // xotirada nechta fayl
const cache = new Map();                  // fileId -> Buffer (Map tartibi — eng eskisi birinchi)
const inflight = new Map();               // bir vaqtda ikki so'rov bir faylni ikki marta o'girmasin

function remember(id, buf) {
  cache.delete(id); cache.set(id, buf);
  while (cache.size > KEEP) cache.delete(cache.keys().next().value);
}

function transcode(inp, out) {
  const ffmpeg = require('ffmpeg-static');
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, ['-y', '-v', 'error', '-i', inp, '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-movflags', '+faststart', out],
      { timeout: 30000 }, err => err ? reject(err) : resolve());
  });
}

/** Telegram file_id -> m4a Buffer (keshdan yoki yangidan) */
async function m4a(fileId, { token = tg.platformToken() } = {}) {
  if (!fileId) throw new Error('Ovoz yo\'q');
  if (cache.has(fileId)) { const b = cache.get(fileId); remember(fileId, b); return b; }
  if (inflight.has(fileId)) return inflight.get(fileId);
  const job = (async () => {
    const f = await tg.getFileBase64(token, fileId, { maxBytes: MAX_BYTES });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'thv-'));
    try {
      const inp = path.join(dir, 'in.ogg'), out = path.join(dir, 'out.m4a');
      await fs.writeFile(inp, Buffer.from(f.base64, 'base64'));
      await transcode(inp, out);
      const buf = await fs.readFile(out);
      remember(fileId, buf);
      return buf;
    } finally {
      fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  })();
  inflight.set(fileId, job);
  try { return await job; } finally { inflight.delete(fileId); }
}

/** "bytes=0-1023" -> {start, end} yoki null (butun fayl) yoki false (noto'g'ri) */
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m || (m[1] === '' && m[2] === '')) return false;
  let start, end;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }   // oxirgi N bayt
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start > end || start >= size) return false;
  return { start, end };
}

/** Buffer'ni Range bilan yuborish (206 / 416 / 200) */
function send(req, res, buf) {
  res.set('Content-Type', 'audio/mp4');
  res.set('Accept-Ranges', 'bytes');
  res.set('Cache-Control', 'private, max-age=3600');
  const r = parseRange(req.headers.range, buf.length);
  if (r === false) { res.set('Content-Range', `bytes */${buf.length}`); return res.status(416).end(); }
  if (!r) { res.set('Content-Length', String(buf.length)); return res.status(200).end(buf); }
  res.set('Content-Range', `bytes ${r.start}-${r.end}/${buf.length}`);
  res.set('Content-Length', String(r.end - r.start + 1));
  return res.status(206).end(buf.subarray(r.start, r.end + 1));
}

/** Mini App'da yozilgan ovoz (iOS — mp4/AAC, Android — webm/Opus) -> OGG/Opus 16 kHz (Gemini o'qiydi) */
async function toOgg(buf) {
  if (!buf || !buf.length) throw new Error('Ovoz bo\'sh');
  if (buf.length > MAX_BYTES) throw new Error('Ovoz juda uzun');
  const ffmpeg = require('ffmpeg-static');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'thr-'));
  try {
    const inp = path.join(dir, 'in.bin'), out = path.join(dir, 'out.ogg');
    await fs.writeFile(inp, buf);
    await new Promise((resolve, reject) => execFile(ffmpeg,
      ['-y', '-v', 'error', '-i', inp, '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '24k', out],
      { timeout: 30000 }, err => err ? reject(err) : resolve()));
    return await fs.readFile(out);
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { m4a, toOgg, send, parseRange, _cache: cache };
