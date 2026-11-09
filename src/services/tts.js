// ── AI OVOZI (o'zbek/rus) — Aisha TTS ────────────────────────
// Gemini o'zbekcha gapirmaydi. Aisha (aisha.group, mahalliy) — o'zbek
// ("Gulnoza") va rus ovozi, REST: POST back.aisha.group/api/v1/tts/post/
// (multipart, X-Api-Key), sinxron javob {audio_path} — WAV. Telegram ovozli
// xabari OGG/Opus bo'lishi kerak — ffmpeg-static bilan o'giriladi
// (loyihada bor: routes/restaurant video uchun).
// Narx: ~1 so'm / belgi. Bir xil matn (shablon) qayta sintez qilinmaydi —
// Telegram file_id xotirada saqlanadi.
// Yoqish: AISHA_API_KEY (Render env). O'chirish: AI_VOICE=0. Kalit yo'q —
// hech narsa qilinmaydi (matn baribir ketadi).

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const tg = require('./telegram');

const BASE = 'https://back.aisha.group';
const MAX_CHARS = 1000;
const cache = new Map();                 // til+matn xeshi -> Telegram voice file_id

const enabled = () => !!process.env.AISHA_API_KEY && process.env.AI_VOICE !== '0';

/** Matn -> WAV (Buffer) */
async function synth(text, lang = 'uz') {
  const fd = new FormData();
  fd.append('transcript', String(text).slice(0, MAX_CHARS));
  fd.append('language', lang === 'ru' ? 'ru' : 'uz');
  if (lang !== 'ru') { fd.append('model', 'Gulnoza'); fd.append('mood', 'Neutral'); }
  const r = await fetch(BASE + '/api/v1/tts/post/', {
    method: 'POST', headers: { 'X-Api-Key': process.env.AISHA_API_KEY, 'Accept-Language': 'uz' }, body: fd,
    signal: AbortSignal.timeout(30000)
  });
  if (r.status !== 201 && r.status !== 200) throw new Error('Aisha TTS ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  const p = j.audio_path || j.audio_url;
  if (!p) throw new Error('Aisha TTS: audio_path yo\'q');
  const a = await fetch(/^https?:/.test(p) ? p : BASE + p, { signal: AbortSignal.timeout(30000) });
  if (!a.ok) throw new Error('Aisha audio ' + a.status);
  return Buffer.from(await a.arrayBuffer());
}

/** WAV -> OGG/Opus (Telegram ovozli xabari) — ffmpeg-static */
function toOgg(wav) {
  const ffmpeg = require('ffmpeg-static');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  const inp = path.join(dir, 'in.wav'), out = path.join(dir, 'out.ogg');
  fs.writeFileSync(inp, wav);
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, ['-y', '-i', inp, '-c:a', 'libopus', '-b:a', '32k', '-ac', '1', out], { timeout: 30000 }, err => {
      try {
        if (err) return reject(err);
        resolve(fs.readFileSync(out));
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
  });
}

/** Faylni sendVoice bilan yuklash (multipart) */
async function uploadVoice(chatId, ogg, caption = '') {
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('voice', new Blob([ogg], { type: 'audio/ogg' }), 'voice.ogg');
  if (caption) fd.append('caption', caption.slice(0, 1000));
  const r = await fetch(`https://api.telegram.org/bot${tg.platformToken()}/sendVoice`, { method: 'POST', body: fd, signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  if (!j.ok) throw new Error('sendVoice: ' + (j.description || r.status));
  return j.result;
}

/**
 * Chatga AI ovozi bilan aytish. Yoqilmagan yoki xato bo'lsa — false
 * (chaqiruvchi matnni baribir yuboradi; ovoz — qo'shimcha).
 */
async function speak(chatId, text, lang = 'uz') {
  if (!enabled() || !chatId || !text) return false;
  const key = (lang === 'ru' ? 'ru' : 'uz') + ':' + crypto.createHash('sha1').update(String(text)).digest('hex');
  try {
    const fid = cache.get(key);
    if (fid) { await tg.sendVoice(tg.platformToken(), chatId, fid); return true; }
    const ogg = await toOgg(await synth(text, lang));
    const msg = await uploadVoice(chatId, ogg);
    if (msg && msg.voice && msg.voice.file_id) cache.set(key, msg.voice.file_id);
    return true;
  } catch (e) {
    console.error('[TTS] ovoz ketmadi:', e.message);
    return false;
  }
}

module.exports = { enabled, speak, synth, toOgg };
