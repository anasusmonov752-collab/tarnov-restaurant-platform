// ── TAKLIF NAVBATI: hh bazasiga SHAXSIY raqamdan SMS ─────────
//
// hh.uz dan kelgan nomzodlar Telegramda emas — bot ularga birinchi bo'lib
// yoza olmaydi. Yagona yo'l — SMS. Avtomatik yuborish ATAYLAB yo'q:
//   - operatorlar ommaviy yuborishni bloklaydi (raqam qora ro'yxatga tushadi)
//   - Eskiz shartnomasi hozircha yo'q (CLAUDE.md)
// Shuning uchun panel faqat TAYYOR HAVOLA beradi: telefonda SMS ilovasi
// raqam va matn bilan ochiladi, odam "yuborish" ni bosadi.
//
// Qoida YAGONA shu faylda: kimga yozish mumkin (QUEUE), matn (render) va
// yuborilgandan keyin nima bo'ladi (markSent -> contactLog).

const Candidate = require('../models/Candidate');
const { roleLabel, isValidRole } = require('../data/roles');
const contactLog = require('./contactLog');

/**
 * Navbatga kim tushadi. Chiqarib tashlanadi:
 *   anketa nomzodi — u allaqachon botda, SMS ortiqcha
 *   Telegramga ulangan — botdan yozamiz, bepul
 *   ish qidirmayotgan, ishga olingan, rad etilgan
 *   telefoni yo'q yoki buzuq (phoneKey bo'sh)
 *   allaqachon SMS ketgan (smsSentAt)
 */
const QUEUE = {
  isTest: { $ne: true },
  source: { $ne: 'anketa' },
  smsSentAt: null,
  phoneKey: { $ne: '' },
  jobStatus: { $ne: 'not_looking' },
  status: { $nin: ['hired', 'rejected'] },
  $or: [{ tgChatId: '' }, { tgChatId: null }]
};

// SMS bitta bo'lib ketishi uchun matn GSM-7 jadvalida bo'lishi kerak.
// Bitta "—" yoki "’" belgisi butun xabarni UCS-2 ga o'tkazadi: chegara
// 160 dan 70 ga tushadi va bitta SMS uchtaga bo'linadi.
const GSM7 = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?'
  + '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€';

/** {chars, parts, bad} — bad: GSM-7 ga kirmaydigan belgilar */
function smsInfo(text) {
  const s = String(text || '');
  const bad = [];
  let units = 0;
  for (const ch of s) {
    if (GSM7.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else { units += 1; if (!bad.includes(ch)) bad.push(ch); }
  }
  const ucs2 = bad.length > 0;
  const len = ucs2 ? Array.from(s).length : units;
  const one = ucs2 ? 70 : 160, many = ucs2 ? 67 : 153;
  return { chars: len, ucs2, bad, parts: len === 0 ? 0 : (len <= one ? 1 : Math.ceil(len / many)) };
}

// Standart matn — ASCII (GSM-7), bitta SMS ichiga sig'adi.
// Nega shunday: kim yozyapti (TalentHub), nima taklif (ish), narxi (bepul),
// qancha vaqt (2 daqiqa), bitta havola. Boshqa hech narsa.
const DEFAULT_TPL = 'Assalomu alaykum, {ism}! TalentHub - Toshkent restoranlarida ish bor. '
  + '{lavozim}: anketa 2 daqiqa, bepul. {havola}';

/** Faqat birinchi so'z: "Karimova Aziza Baxtiyorovna" -> "Aziza" ham emas, "Karimova" */
function firstName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  // hh rezyumelarida tartib "Familiya Ism Otasining ismi" — ism ikkinchi so'z
  return (parts.length >= 2 ? parts[1] : parts[0]).slice(0, 20);
}

/** +998901234567 — phoneKey (oxirgi 9 raqam) dan, formatdan qat'i nazar */
const e164 = c => (c.phoneKey ? '+998' + c.phoneKey : '');

function render(tpl, c, link) {
  const name = firstName(c.fullName);
  return String(tpl || DEFAULT_TPL)
    .replace(/\{ism\}/g, name)
    .replace(/\{lavozim\}/g, isValidRole(c.role) ? roleLabel(c.role) : 'Restoran ishi')
    .replace(/\{havola\}/g, link || '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Navbat: eng yangi rezyumelar oldin (eski rezyume egasi allaqachon ishga kirgan) */
async function list(agencyId, { role = '', limit = 30, skip = 0 } = {}) {
  const q = Object.assign({ restaurantId: agencyId }, QUEUE);
  if (isValidRole(role)) q.role = role;
  const [rows, total, sentToday, byRole] = await Promise.all([
    Candidate.find(q, 'id fullName phone phoneKey role location experienceYears createdAt')
      .sort({ createdAt: -1 }).skip(skip).limit(Math.min(100, limit)).lean(),
    Candidate.countDocuments(q),
    Candidate.countDocuments({ restaurantId: agencyId,
      smsSentAt: { $gte: new Date(Date.now() - 864e5) } }),
    Candidate.aggregate([
      { $match: Object.assign({ restaurantId: agencyId }, QUEUE) },
      { $group: { _id: '$role', n: { $sum: 1 } } }, { $sort: { n: -1 } }
    ])
  ]);
  return {
    total, sentToday,
    byRole: byRole.filter(x => isValidRole(x._id)).map(x => ({ role: x._id, label: roleLabel(x._id), n: x.n })),
    rows: rows.map(c => ({
      id: c.id,
      name: c.fullName || '',
      first: firstName(c.fullName),
      phone: e164(c),
      role: c.role,
      roleLabel: isValidRole(c.role) ? roleLabel(c.role) : '',
      location: c.location || '',
      exp: c.experienceYears || 0,
      days: Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 864e5)
    }))
  };
}

/**
 * SMS yuborildi deb belgilash. Birinchi aloqa ham shu — contactLog bilan
 * bir xil qoida (panelda "javobsiz" sanog'i to'g'ri qolsin).
 */
async function markSent(agencyId, id, undo = false) {
  const c = await Candidate.findOne({ restaurantId: agencyId, id }, 'smsSentAt firstContactAt').lean();
  if (!c) return false;
  if (!undo) {
    const now = new Date();
    await Candidate.updateOne({ restaurantId: agencyId, id }, { $set: { smsSentAt: now } });
    // Birinchi aloqa ham shu — lekin AYNAN shu vaqt bilan, qaytarilganda
    // orqaga olish uchun (contactLog o'z vaqtini qo'ysa taqqoslab bo'lmaydi)
    await Candidate.updateOne({ restaurantId: agencyId, id, firstContactAt: null },
      { $set: { firstContactAt: now } });
    await contactLog.seen(agencyId, [id]);
    return true;
  }
  // Qaytarish: SMS yuborilmagan ekan — "bog'lanildi" belgisi ham olinadi,
  // lekin faqat SHU amal qo'ygan bo'lsa (oldin qo'ng'iroq qilingan bo'lishi mumkin)
  await Candidate.updateOne({ restaurantId: agencyId, id }, { $set: { smsSentAt: null } });
  if (c.smsSentAt && c.firstContactAt && +c.smsSentAt === +c.firstContactAt)
    await Candidate.updateOne({ restaurantId: agencyId, id }, { $set: { firstContactAt: null } });
  return true;
}

module.exports = { QUEUE, DEFAULT_TPL, list, markSent, render, smsInfo, firstName, e164 };
