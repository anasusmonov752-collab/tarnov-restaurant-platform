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
//
// VOICELAB (2026-11): Aisha API kalitini endi voicelab.uz beradi — kalit
// "vlk_" bilan boshlanadi va BOSHQA API'ga boradi: api.voicelab.uz/v1/tts,
// Authorization: Bearer, JSON {text, language, voice_id}, javob 200 audio/wav
// yoki 202 (navbatda — status_url so'raladi). voice_id majburiy: /v1/voices
// dan olinadi (kalitda "Голоса: Читать" ruxsati) yoki env VOICELAB_VOICE_UZ /
// VOICELAB_VOICE_RU. Kalit turi prefiksdan aniqlanadi — eski Aisha kaliti ham ishlaydi.

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

const VL = 'https://api.voicelab.uz';
const isVoiceLab = () => /^vlk_/.test(process.env.AISHA_API_KEY || '');
const vlHeaders = extra => Object.assign({ Authorization: 'Bearer ' + process.env.AISHA_API_KEY }, extra || {});
const voices = {};                       // til -> voice_id (xotirada)

async function vlJson(url, opts = {}) {
  const r = await fetch(url.startsWith('http') ? url : VL + url, Object.assign({ signal: AbortSignal.timeout(30000) }, opts,
    { headers: vlHeaders(opts.headers) }));
  const body = await r.text();
  if (!r.ok) throw new Error(`VoiceLab ${r.status}: ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : {};
}

// Ovoz NOMI bo'yicha (katalog alifbo tartibida — "birinchisi" tasodifiy ovoz
// bo'lib chiqdi, aksent bilan; Anas 2026-11-10). Gulnoza — Aisha'ning asosiy
// o'zbekcha ovozi. Env VOICELAB_VOICE_UZ/RU: "voice_..." id yoki ovoz nomi.
const PREFER = { uz: ['Gulnoza', 'Sardor', 'Lola'], ru: ['Alina', 'Vera', 'Maksim'] };
const voiceNames = {};                   // til -> tanlangan ovoz nomi (logga)

/** Til uchun ovoz id: env (id yoki nom), bo'lmasa PREFER ro'yxati, bo'lmasa tizim ovozi */
async function voiceFor(lang) {
  const L = lang === 'ru' ? 'ru' : 'uz';
  const env = (process.env['VOICELAB_VOICE_' + L.toUpperCase()] || '').trim();
  if (/^voice_/.test(env)) return env;
  if (voices[L]) return voices[L];
  const j = await vlJson(`/v1/voices?language=${L}&model_id=lison`);
  const list = (j.data || []).filter(v => v && v.id);
  const nameOf = v => String(v.display_name || v.name || '').trim();
  const byName = n => list.find(v => nameOf(v).toLowerCase() === n.toLowerCase())
    || list.find(v => nameOf(v).toLowerCase().startsWith(n.toLowerCase()));
  let pick = null;
  for (const n of (env ? [env] : []).concat(PREFER[L])) { pick = byName(n); if (pick) break; }
  pick = pick || list.find(v => v.kind === 'system') || list[0];
  if (!pick) throw new Error(`VoiceLab: ${L} uchun ovoz topilmadi`);
  voices[L] = pick.id;
  voiceNames[L] = nameOf(pick);
  return pick.id;
}

async function synthVoiceLab(text, lang) {
  const L = lang === 'ru' ? 'ru' : 'uz';
  const voice_id = await voiceFor(L);
  const r = await fetch(VL + '/v1/tts', {
    method: 'POST', signal: AbortSignal.timeout(45000),
    headers: vlHeaders({ 'Content-Type': 'application/json', 'Idempotency-Key': 'th-' + crypto.randomUUID() }),
    body: JSON.stringify({ text: String(text).slice(0, MAX_CHARS), language: L, voice_id, speed: 1 })
  });
  if (r.status === 200) return Buffer.from(await r.arrayBuffer());
  const body = await r.text();
  if (r.status !== 202) throw new Error(`VoiceLab TTS ${r.status}: ${body.slice(0, 200)}`);
  // Navbatda — tayyor bo'lguncha so'raymiz (25 s gacha)
  const job = JSON.parse(body);
  for (let i = 0; i < 25; i++) {
    await new Promise(res => setTimeout(res, 1000));
    const g = await vlJson(job.status_url || `/v1/tts/generations/${job.id}`);
    if (g.status === 'completed' && g.audio_url) {
      const a = await fetch(g.audio_url, { signal: AbortSignal.timeout(30000) });   // imzolangan havola — kalitsiz
      if (!a.ok) throw new Error('VoiceLab audio ' + a.status);
      return Buffer.from(await a.arrayBuffer());
    }
    if (g.status === 'failed') throw new Error('VoiceLab: ' + JSON.stringify(g.error || {}).slice(0, 200));
  }
  throw new Error('VoiceLab: 25 s da tayyor bo\'lmadi');
}

/** Matn -> WAV (Buffer) */
async function synth(text, lang = 'uz') {
  if (isVoiceLab()) return synthVoiceLab(text, lang);
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

/**
 * Ishga tushganda bir marta: kalit ishlayaptimi (logga — Render Logs'da
 * "[TTS]" qatori). Qisqa sinov sintezi (~4 kredit) + OGG ga o'girish.
 * Hech kimga yuborilmaydi.
 */
async function selfCheck() {
  if (!enabled()) return { ok: false, reason: 'off' };
  try {
    const wav = await synth('Salom', 'uz');
    const ogg = await toOgg(wav);
    if (isVoiceLab()) await voiceFor('ru').catch(e => console.error('[TTS] ruscha ovoz:', e.message));
    const info = isVoiceLab()
      ? `VoiceLab, uz=${voiceNames.uz || process.env.VOICELAB_VOICE_UZ} (${voices.uz || ''}), ru=${voiceNames.ru || process.env.VOICELAB_VOICE_RU || '—'}`
      : 'Aisha';
    console.log(`[TTS] tayyor (${info}): wav ${wav.length} B -> ogg ${ogg.length} B`);
    return { ok: true };
  } catch (e) {
    console.error('[TTS] ISHLAMAYAPTI:', e.message);
    return { ok: false, reason: e.message };
  }
}

module.exports = { enabled, speak, synth, toOgg, selfCheck, voiceFor, isVoiceLab };
