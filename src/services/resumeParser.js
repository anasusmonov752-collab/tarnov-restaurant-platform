// ── REZYUME TAHLILCHISI ──────────────────────────────────────
// 1) PDF (yoki matn) fayldan xom matnni ajratadi.
// 2) Mavjud AI qatlami (services/ai.js) orqali matnni tuzilgan
//    maydonlarga (ism, telefon, tajriba, til...) ajratadi.
//
// Rezyumelar ko'pincha rus tilida (hh.uz), ba'zan o'zbekcha bo'ladi —
// prompt ikkalasini ham tushunadi. AI ishlamasa (kvota/xato) tahlil
// aiParsed:false bilan qaytadi, lekin xom matn baribir saqlanadi.

const ai = require('./ai');
const { ROLES, isValidRole } = require('../data/roles');

const MAX_TEXT = 9000; // AI'ga yuboriladigan matn chegarasi (token nazorati)

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
'  "salaryExpectation": "kutilayotgan maosh (matn, bo\'lsa)",\n' +
'  "summary": "nomzod haqida 1-2 jumlalik qisqa xulosa (o\'zbekcha)"\n' +
'}\n\n' +
'Faqat JSON qaytar, boshqa matnsiz.';

/** Bo'sh/xato holatlar uchun xavfsiz standart obyekt. */
function emptyFields() {
  return {
    fullName: '', phone: '', email: '', desiredPosition: '', role: 'boshqa',
    experienceYears: 0, experienceSummary: '', skills: [], languages: [],
    location: '', age: null, education: '', salaryExpectation: '', summary: ''
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
  f.salaryExpectation = toStr(raw.salaryExpectation).slice(0, 80);
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
        maxTokens: 1200,
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

/**
 * PDF ichidagi eng mos JPEG rasmni (odatda nomzod fotosi) topib base64 dataURL qaytaradi.
 * hh.uz rezyumelarida foto DCTDecode (JPEG) sifatida ichma-ich saqlanadi — buni
 * FF D8 ... FF D9 (JPEG boshi/oxiri) belgilaridan qidiramiz. Kutubxona kerak emas.
 */
function extractPhoto(buffer) {
  try {
    if (!buffer || buffer.length < 100) return '';
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
    // Foto-ga o'xshashlar: o'lchami ma'lum, kichik emas, portret/kvadrat nisbatda (banner/varaqni chetlab o'tamiz)
    const photoLike = found.filter(f => f.dim && Math.min(f.dim.w, f.dim.h) >= 80 && Math.max(f.dim.w, f.dim.h) <= 1400 && f.dim.w <= f.dim.h * 1.5);
    const pool = photoLike.length ? photoLike : found;
    pool.sort((a, b) => b.len - a.len);
    const best = pool[0];
    if (best.len > 600 * 1024) return ''; // juda katta — hujjat shishmasligi uchun o'tkazib yuboramiz
    return 'data:image/jpeg;base64,' + buffer.slice(best.start, best.end).toString('base64');
  } catch { return ''; }
}

module.exports = { extractText, structure, emptyFields, extractPhoto };
