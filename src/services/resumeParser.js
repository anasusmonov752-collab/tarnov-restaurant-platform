// ── REZYUME TAHLILCHISI ──────────────────────────────────────
// 1) PDF (yoki matn) fayldan xom matnni ajratadi.
// 2) Mavjud AI qatlami (services/ai.js) orqali matnni tuzilgan
//    maydonlarga (ism, telefon, tajriba, til...) ajratadi.
//
// Rezyumelar ko'pincha rus tilida (hh.uz), ba'zan o'zbekcha bo'ladi —
// prompt ikkalasini ham tushunadi. AI ishlamasa (kvota/xato) tahlil
// aiParsed:false bilan qaytadi, lekin xom matn baribir saqlanadi.

const zlib = require('zlib');
const ai = require('./ai');
const { ROLES, isValidRole } = require('../data/roles');

const MAX_TEXT = 15000; // AI'ga yuboriladigan matn chegarasi — ish tajribasi bo'limi ham sig'sin

/** PDF buffer'dan matn ajratadi. pdf-parse lazy require — o'rnatilmagan bo'lsa aniq xato. */
async function extractPdfText(buffer) {
  let pdfParse;
  try {
    // index.js'ning debug bloklaridan qochish uchun to'g'ridan-to'g'ri lib'ni chaqiramiz.
    pdfParse = require('pdf-parse/lib/pdf-parse.js');
  } catch {
    try { pdfParse = require('pdf-parse'); }
    catch { throw Object.assign(new Error('pdf-parse o\'rnatilmagan (npm install)'), { status: 500 }); }
  }
  const data = await pdfParse(buffer);
  return String(data.text || '').trim();
}

/** Fayl turiga qarab matn ajratadi (PDF yoki oddiy matn/txt). */
async function extractText(buffer, mimetype, fileName) {
  const isPdf = String(mimetype || '').includes('pdf') || /\.pdf$/i.test(fileName || '');
  if (isPdf) return extractPdfText(buffer);
  // txt / boshqa matnli fayllar
  return String(buffer.toString('utf8') || '').trim();
}

const ROLE_LIST = ROLES.map(r => r.key + ' (' + r.label + ')').join(', ');

const SYSTEM_PROMPT = 'Sen HR yordamchisisan. Senga rezyume matni beriladi (rus yoki o\'zbek tilida bo\'lishi mumkin). Undan quyidagi ma\'lumotlarni ajratib, FAQAT JSON obyekt qaytar. Matnda ma\'lumot bo\'lmasa — bo\'sh qiymat ("" yoki 0 yoki []) qo\'y, hech narsa o\'ylab topma.\n\n' +
'JSON kalitlari (aynan shu nomlar bilan):\n' +
'{\n' +
'  "fullName": "to\'liq ism (asl tilda)",\n' +
'  "phone": "asosiy telefon raqami (bittasi)",\n' +
'  "email": "email",\n' +
'  "desiredPosition": "istagan yoki oxirgi lavozim (asl matn)",\n' +
'  "role": "quyidagi kalitlardan MOS kelganini tanla, mos kelmasa \'boshqa\': ' + ROLE_LIST + '",\n' +
'  "experienceYears": "umumiy ish tajribasi YILLARDA (butun son, taxminiy)",\n' +
'  "experienceSummary": "tajriba haqida 1 qisqa jumla (o\'zbekcha)",\n' +
'  "skills": ["asosiy ko\'nikmalar ro\'yxati"],\n' +
'  "languages": ["biladigan tillar, masalan: Rus, O\'zbek, Ingliz"],\n' +
'  "location": "shahar yoki hudud",\n' +
'  "age": "yoshi (son yoki null)",\n' +
'  "education": "ta\'lim (qisqa)",\n' +
'  "workHistory": [{"company":"kompaniya nomi","position":"lavozim","period":"ishlagan muddati (masalan: 2021-2023 yoki 2 yil)","description":"shu ish joyidagi asosiy majburiyat/vazifalar — rezyumeda yozilganini qisqartirib (2-4 jumla)"}],  // rezyumening "Опыт работы"/"Ish tajribasi" bo\'limidagi HAR BIR ish joyini, oxirgisidan boshlab, alohida band qilib yoz (6 tagacha)\n' +
'  "salaryExpectation": "kutilayotgan maosh (matn, bo\'lsa)",\n' +
'  "shift": "ish smenasi — matndan aniqlansa faqat shulardan biri: kunduzgi | kechki | ikkalasi, aniqlanmasa bo\'sh",\n' +
'  "fitScore": "nomzodning istagan lavozimiga (role/desiredPosition) umumiy mosligi 1 dan 5 gacha (yarim ball mumkin, masalan 4.5) — tajriba, til, ko\'nikma va ta\'limga qarab",\n' +
'  "fitReason": "moslik bahosi sababi — 1 qisqa jumla (o\'zbekcha)",\n' +
'  "summary": "nomzod haqida 1-2 jumlalik qisqa xulosa (o\'zbekcha)"\n' +
'}\n\n' +
'Faqat JSON qaytar, boshqa matnsiz.';

/** Bo'sh/xato holatlar uchun xavfsiz standart obyekt. */
function emptyFields() {
  return {
    fullName: '', phone: '', email: '', desiredPosition: '', role: 'boshqa',
    experienceYears: 0, experienceSummary: '', skills: [], languages: [],
    location: '', age: null, education: '', salaryExpectation: '',
    workHistory: [], shift: '', fitScore: 0, fitReason: '', summary: ''
  };
}

function toStr(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }
function toArr(v) {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean).slice(0, 25);
  if (typeof v === 'string' && v.trim()) return v.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).slice(0, 25);
  return [];
}
function toNum(v) {
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/** AI javobini xavfsiz, tipli obyektga keltiradi. */
function normalize(raw) {
  const f = emptyFields();
  if (!raw || typeof raw !== 'object') return f;
  f.fullName          = toStr(raw.fullName).slice(0, 120);
  f.phone             = toStr(raw.phone).slice(0, 40);
  f.email             = toStr(raw.email).slice(0, 120);
  f.desiredPosition   = toStr(raw.desiredPosition).slice(0, 160);
  f.role              = isValidRole(toStr(raw.role)) ? toStr(raw.role) : 'boshqa';
  f.experienceYears   = Math.min(60, toNum(raw.experienceYears));
  f.experienceSummary = toStr(raw.experienceSummary).slice(0, 300);
  f.skills            = toArr(raw.skills);
  f.languages         = toArr(raw.languages);
  f.location          = toStr(raw.location).slice(0, 80);
  const age = toNum(raw.age);
  f.age               = (age >= 14 && age <= 90) ? age : null;
  f.education         = toStr(raw.education).slice(0, 200);
  f.workHistory       = Array.isArray(raw.workHistory)
    ? raw.workHistory.slice(0, 8).map(w => ({
        company:     toStr(w && w.company).slice(0, 100),
        position:    toStr(w && w.position).slice(0, 100),
        period:      toStr(w && w.period).slice(0, 60),
        description: toStr(w && w.description).slice(0, 600)
      })).filter(w => w.company || w.position || w.period || w.description)
    : [];
  f.salaryExpectation = toStr(raw.salaryExpectation).slice(0, 80);
  const sh = toStr(raw.shift).toLowerCase();
  f.shift             = ['kunduzgi', 'kechki', 'ikkalasi'].includes(sh) ? sh : '';
  const fs = parseFloat(String(raw.fitScore).replace(',', '.'));
  f.fitScore          = Number.isFinite(fs) ? Math.round(Math.max(0, Math.min(5, fs)) * 10) / 10 : 0;
  f.fitReason         = toStr(raw.fitReason).slice(0, 300);
  f.summary           = toStr(raw.summary).slice(0, 400);
  return f;
}

/** AI yo'q yoki ishlamaganda — matndan telefon/email va taxminiy ismni oladi. */
function fallbackFromText(text) {
  const f = emptyFields();
  const phone = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
  if (phone) f.phone = phone[1].replace(/[^0-9+]/g, '').slice(0, 40);
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (email) f.email = email[0].slice(0, 120);
  // Birinchi "mazmunli" qatorni ism sifatida taxmin qilamiz (juda qo'pol)
  const firstLine = text.split('\n').map(s => s.trim())
    .find(s => s.length >= 3 && s.length <= 60 && /[a-zA-Zа-яА-ЯёЁ]/.test(s));
  if (firstLine) f.fullName = firstLine.slice(0, 120);
  return f;
}

/**
 * Xom matnni tuzilgan maydonlarga ajratadi.
 * @returns {Promise<{ fields: object, aiParsed: boolean }>}
 */
async function structure(rawText, restaurantId) {
  const text = String(rawText || '').slice(0, MAX_TEXT);
  if (!text.trim()) return { fields: emptyFields(), aiParsed: false };
  if (!ai.isConfigured()) return { fields: fallbackFromText(text), aiParsed: false };

  // O'tkinchi xatolar (429/503/AI_BAD_JSON) uchun bir necha marta qayta urinamiz.
  // Aks holda bitta xato butun rezyumeni "Qo'lda to'ldiring" holatiga tushiradi.
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = await ai.complete({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }],
        json: true,
        tier: 'smart',
        maxTokens: 2200,
        restaurantId
      });
      const fields = normalize(out);
      const fb = fallbackFromText(text);
      if (!fields.fullName) fields.fullName = fb.fullName;
      if (!fields.phone)    fields.phone    = fb.phone;
      if (!fields.email)    fields.email    = fb.email;
      return { fields, aiParsed: true };
    } catch (err) {
      lastErr = err;
      if (err.code === 'QUOTA_EXHAUSTED') break;           // kunlik limit — qayta urinish foydasiz
      if (attempt < 3) await new Promise(r => setTimeout(r, 1200 * attempt));
    }
  }
  console.warn('[resumeParser] AI tahlili ishlamadi:', lastErr && lastErr.message);
  return { fields: fallbackFromText(text), aiParsed: false, error: lastErr && (lastErr.code || lastErr.message) };
}

/** JPEG o'lchamini (w,h) SOF markeridan o'qiydi — foto-ga o'xshashini tanlash uchun. */
function jpegSize(buf, start, end) {
  let p = start + 2;
  while (p < end - 8) {
    if (buf[p] !== 0xFF) { p++; continue; }
    const m = buf[p + 1];
    if ((m >= 0xC0 && m <= 0xC3) || (m >= 0xC5 && m <= 0xC7) || (m >= 0xC9 && m <= 0xCB) || (m >= 0xCD && m <= 0xCF)) {
      const h = (buf[p + 5] << 8) | buf[p + 6];
      const w = (buf[p + 7] << 8) | buf[p + 8];
      return { w, h };
    }
    if (m === 0xD8 || m === 0xD9 || (m >= 0xD0 && m <= 0xD7)) { p += 2; continue; }
    const len = (buf[p + 2] << 8) | buf[p + 3];
    if (len < 2) break;
    p += 2 + len;
  }
  return null;
}

/** PDF ichidan JPEG (DCTDecode) fotoni FF D8 ... FF D9 belgilaridan topadi. */
function extractJpegPhoto(buffer) {
  const n = buffer.length;
  const found = [];
  let i = 0;
  while (i < n - 3) {
    if (buffer[i] === 0xFF && buffer[i + 1] === 0xD8 && buffer[i + 2] === 0xFF) {
      let j = i + 3;
      while (j < n - 1 && !(buffer[j] === 0xFF && buffer[j + 1] === 0xD9)) j++;
      if (j < n - 1) {
        const end = j + 2, len = end - i;
        if (len > 2500 && len < 900 * 1024) found.push({ start: i, end, len, dim: jpegSize(buffer, i, end) });
        i = end; continue;
      }
    }
    i++;
  }
  if (!found.length) return '';
  const photoLike = found.filter(f => f.dim && Math.min(f.dim.w, f.dim.h) >= 80 && Math.max(f.dim.w, f.dim.h) <= 1400 && f.dim.w <= f.dim.h * 1.5);
  const pool = photoLike.length ? photoLike : found;
  pool.sort((a, b) => b.len - a.len);
  const best = pool[0];
  if (best.len > 600 * 1024) return '';
  return 'data:image/jpeg;base64,' + buffer.slice(best.start, best.end).toString('base64');
}

// ── PNG yasash yordamchilari (xom pikseldan) ──
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
/** Xom pikselni (RGB/Gray) nearest-neighbor bilan kichraytiradi. */
function downscale(raw, w, h, ch, maxDim) {
  if (Math.max(w, h) <= maxDim) return { raw, w, h };
  const scale = maxDim / Math.max(w, h);
  const nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
  const out = Buffer.alloc(nw * nh * ch);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, Math.floor(y / scale));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.floor(x / scale));
      const si = (sy * w + sx) * ch, di = (y * nw + x) * ch;
      for (let c = 0; c < ch; c++) out[di + c] = raw[si + c];
    }
  }
  return { raw: out, w: nw, h: nh };
}
function rawToPng(raw, w, h, ch) {
  const colorType = ch === 1 ? 0 : ch === 4 ? 6 : 2;
  const rowLen = w * ch;
  const filtered = Buffer.alloc((rowLen + 1) * h);
  for (let y = 0; y < h; y++) {
    filtered[y * (rowLen + 1)] = 0;
    raw.copy(filtered, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen);
  }
  const idat = zlib.deflateSync(filtered, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

/**
 * PDF ichidagi FlateDecode rasm XObject'ni (hh fotosi shunday saqlanadi) topadi:
 * zlib bilan ochib, xom pikseldan PNG yasaydi. 8-bit DeviceRGB/DeviceGray,
 * predictorsiz holatni qo'llab-quvvatlaydi (hh rezyumelari aynan shunday).
 */
function extractFlatePhoto(buffer) {
  const s = buffer.toString('latin1');
  const rx = /\/Subtype\s*\/Image/g;
  let m, best = null;
  while ((m = rx.exec(s)) !== null) {
    const streamKw = s.indexOf('stream', m.index);
    if (streamKw < 0) continue;
    const dict = s.slice(Math.max(0, m.index - 500), streamKw);
    if (!/\/FlateDecode/.test(dict)) continue;
    if (/\/Predictor/.test(dict)) continue;             // predictorli holat hozircha o'tkaziladi
    if (/\/ImageMask\s*true/.test(dict)) continue;
    const wM = dict.match(/\/Width\s+(\d+)/);
    const hM = dict.match(/\/Height\s+(\d+)/);
    if (!wM || !hM) continue;
    const w = +wM[1], h = +hM[1];
    const bpc = dict.match(/\/BitsPerComponent\s+(\d+)/);
    if (bpc && +bpc[1] !== 8) continue;
    if (Math.min(w, h) < 100 || Math.max(w, h) > 2000) continue;   // ikonka/banner emas
    const ch = /\/DeviceRGB/.test(dict) ? 3 : /\/DeviceGray/.test(dict) ? 1 : /\/DeviceCMYK/.test(dict) ? 4 : 3;
    if (ch === 4) continue;                              // CMYK'ni hozircha o'tkazamiz
    let ds = streamKw + 6;
    if (s[ds] === '\r') ds++;
    if (s[ds] === '\n') ds++;
    const endIdx = s.indexOf('endstream', ds);
    if (endIdx < 0) continue;
    const comp = buffer.slice(ds, endIdx);
    let raw;
    try { raw = zlib.inflateSync(comp); }
    catch { try { raw = zlib.inflateRawSync(comp); } catch { continue; } }
    const expected = w * h * ch;
    if (raw.length < expected) continue;
    const score = w * h * (ch === 3 ? 2 : 1);            // rangli fotoni afzal ko'ramiz
    if (!best || score > best.score) best = { raw: raw.slice(0, expected), w, h, ch, score };
  }
  if (!best) return '';
  try {
    const d = downscale(best.raw, best.w, best.h, best.ch, 220);
    const png = rawToPng(d.raw, d.w, d.h, best.ch);
    if (png.length > 500 * 1024) return '';
    return 'data:image/png;base64,' + png.toString('base64');
  } catch { return ''; }
}

/**
 * PDF ichidagi nomzod fotosini topib base64 dataURL qaytaradi.
 * Avval JPEG (DCTDecode), topilmasa FlateDecode (xom RGB -> PNG). Kutubxonasiz.
 */
function extractPhoto(buffer) {
  try {
    if (!buffer || buffer.length < 100) return '';
    return extractJpegPhoto(buffer) || extractFlatePhoto(buffer) || '';
  } catch { return ''; }
}

module.exports = { extractText, structure, emptyFields, extractPhoto };
