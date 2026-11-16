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
const Vacancy = require('../models/Vacancy');
const { roleLabel, isValidRole } = require('../data/roles');
const contactLog = require('./contactLog');

/**
 * Navbatga kim tushadi. Chiqarib tashlanadi:
 *   anketa nomzodi — u allaqachon botda, SMS ortiqcha
 *   Telegramga ulangan — botdan yozamiz, bepul
 *   ish qidirmayotgan, ishga olingan, rad etilgan
 *   telefoni yo'q yoki buzuq (phoneKey bo'sh)
 *   allaqachon SMS ketgan (smsSentAt)
 *   Toshkentdan tashqarida yashaydi (Anas, 2026-11-16: Chirchiq, Farg'ona,
 *     Olmaliq... — ishlar Toshkentda). Hudud bo'sh bo'lsa QOLADI (hh qidiruvi
 *     Toshkent bo'yicha edi). hh hududga metro bekatini yozadi ("Тинчлик") —
 *     shuning uchun tumanlar va bekatlar ham Toshkent. Keles — Tarnov filiali.
 */
const TASHKENT_RE = new RegExp('^\\s*$|ташкент|тошкент|tashkent|toshkent|keles|келес|'
  + 'чиланзар|chilonzor|юнусобод|юнусабад|yunusobod|мирзо|mirzo|яккасарай|yakkasaroy|сергели|sergeli|'
  + 'алмазар|олмазор|olmazor|учтепа|uchtepa|бектемир|bektemir|мирабад|миробод|mirobod|яшнабад|yashnobod|'
  + 'шайхантахур|shayxontohur|янгихаёт|yangihayot|тинчлик|tinchlik|чорсу|chorsu|себзор|sebzor|'
  + 'бунёдкор|bunyodkor|новза|novza|беруни|beruniy|буюк ипак|ipak yo|хамза|hamza|олой|oloy', 'i');
const QUEUE = {
  isTest: { $ne: true },
  source: { $ne: 'anketa' },
  smsSentAt: null,
  phoneKey: { $ne: '' },
  jobStatus: { $ne: 'not_looking' },
  status: { $nin: ['hired', 'rejected'] },
  $and: [
    { $or: [{ tgChatId: '' }, { tgChatId: null }] },
    { $or: [{ location: null }, { location: TASHKENT_RE }] }
  ]
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

// Standart matn — REKRUTER OVOZI (Anas, 2026-11-15): SMS shaxsiy raqamdan ketadi,
// "men" deb yozish rost; tizim xabaridek emas, odamdan odamga. Tartib:
//   salom + ism -> kimman (TalentHub rekruteri) -> nega yozyapman (hh.uz rezyumesi)
//   -> qaysi ish -> "platformamiz orqali batafsil ma'lumot oling".
// Maosh, to'lov muddati va "ariza" SMS'da YO'Q (Anas qarori): SMS qiziqish
// uyg'otadi, javobni botning birinchi ekrani beradi (firstTouch.candidateInvite —
// maosh, filiallar, bitta tugma). 2 ta SMS (GSM-7) — me'yor; 3+ — sahifa qizil.
// 2026-11-16 (Anas): "rezyumengiz tayyor, to'ldirish shart emas" kabi gaplar KERAK
// EMAS; raqam qayerdan olingani aytiladi (shaxsiy raqamdan yozilgan SMS spamga
// o'xshamasin). SHAXSIY VA'DA YO'Q ("sizni shu ishga taklif qilamiz" — 510 kishiga,
// Tarnovga esa bir necha odam kerak): maqsad platformaga olib kirish, aniq ish
// (Tarnov) — misol va isbot. Yangi restoran qo'shilsa faqat nomi almashadi.
// 4-VERSIYA (Anas tanlovi, 2026-11-16): UMUMIY taklif — lavozim, restoran va
// "Toshkent" yo'q, maqsad platformaga olib kirish. IKKI TILDA: o'zbekcha, bo'sh
// qator, ruscha (KIRILLDA — Anas tanlovi; xabar UCS-2, ~5 SMS — lotindagi ruscha
// 2 SMS edi, rad etildi). Havola ALOHIDA qatorda — telefonda bosish qulay.
const DEFAULT_TPL = "Assalomu alaykum, {ism}! TalentHub agentligidan yozyapman, raqamingiz hh.uz'dagi rezyumengizdan. Restoranlardagi ochiq ishlarni platformamizda ko'ring:\n{havola}\n\nЗдравствуйте! Агентство TalentHub, номер из вашего резюме на hh.uz. Вакансии в ресторанах — по ссылке выше.";

// Shaxsiy havola tokeni: 10 belgi [A-Za-z0-9]. Pastki chiziq yo'q — boshqa
// /start turlari (a_, v_, ref_, emp_, f_) bilan aralashmaydi. Havola
// t.me/<bot>?start=<token> — umumiy anketa havolasi bilan bir xil uzunlik.
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function newToken() {
  const b = require('crypto').randomBytes(10);
  return Array.from(b, x => ALNUM[x % ALNUM.length]).join('');
}
/**
 * Shaxsiy havolani KIM bosdi? (2026-11-16 jonli: Anas yuborgan SMS'idagi havolani
 * o'zi tekshirib bosdi — uning Telegrami hh nomzodiga ulanib, o'z profili uzildi,
 * nomzodning havolasi kuydi.) Bog'lamaslik kerak:
 *   admin — agentlik admin chati: ko'rinish beriladi, token saqlanadi;
 *   other — chat BOSHQA telefonli nomzodga ulangan: bu boshqa odam (havola
 *           uzatilgan yoki SMS yuboruvchi bosgan) — o'z ekrani, token saqlanadi.
 * Telefoni bir xil bo'lsa — o'sha odamning ikkinchi yozuvi, bog'lanadi.
 * @returns {{ mode: 'bind'|'admin'|'other', me? }}
 */
async function inviteClaim(cand, chatId, adminChatId) {
  const { phoneKey } = require('../utils/candidateKeys');
  const isAdmin = adminChatId && String(adminChatId) === String(chatId);
  // Test rejimi "hh nomzod": admin o'z sinov rezyumesining havolasini bosadi — bog'lanadi
  if (isAdmin && cand.isTest) return { mode: 'bind' };
  if (isAdmin) return { mode: 'admin' };
  const me = await Candidate.findOne({ tgChatId: String(chatId), tgState: 'linked', id: { $ne: cand.id } });
  const a = me && phoneKey(me.phone), b = phoneKey(cand.phone);
  if (me && (!a || !b || a !== b)) return { mode: 'other', me };
  return { mode: 'bind' };
}

/** Navbatdagi nomzodlarga token (yo'q bo'lsa) — SMS'da shaxsiy havola bo'lishi uchun */
async function ensureTokens(agencyId, rows) {
  for (const c of rows) {
    if (c.tgInviteToken) continue;
    c.tgInviteToken = newToken();
    await Candidate.updateOne({ restaurantId: agencyId, id: c.id, tgInviteToken: { $in: ['', null] } },
      { $set: { tgInviteToken: c.tgInviteToken, tgInviteChannel: 'sms' } });
  }
}

// Kirill ism SMS'ni uchga bo'ladi: bitta kirill harfi butun xabarni UCS-2 ga
// o'tkazadi (160 o'rniga 70 belgi). hh rezyumelarida ism ko'pincha kirillchada
// ("Нилуфар") — SMS'da lotinga o'giriladi. Botda asl yozuvi qoladi.
const CYR = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'yo', ж:'j', з:'z', и:'i', й:'y', к:'k', л:'l',
  м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'x', ц:'ts', ч:'ch', ш:'sh', щ:'sh',
  ъ:"'", ы:'i', ь:'', э:'e', ю:'yu', я:'ya', ў:"o'", қ:'q', ғ:"g'", ҳ:'h' };
function latin(s) {
  return Array.from(String(s || '')).map((ch, i, a) => {
    const lo = ch.toLowerCase();
    if (!(lo in CYR)) return ch;
    // "Е" so'z boshida — "Ye" (Yelena); boshqa joyda "e"
    let t = (lo === 'е' && (i === 0 || /\s/.test(a[i - 1]))) ? 'ye' : CYR[lo];
    return ch !== lo && t ? t[0].toUpperCase() + t.slice(1) : t;
  }).join('');
}

/**
 * Murojaat uchun ism (asl yozuvda): hh tartibi "Familiya Ism Otasining ismi" —
 * ism ikkinchi so'z. Ismini yashirgan nomzod ("ФИО скрыто соискателем") — bo'sh:
 * aks holda SMS "Assalomu alaykum, skrito!" bo'lardi (jonli navbatda topildi,
 * 2026-11-16). KATTA harfli ism ("САИДА") — "Саида".
 */
function nameWord(full) {
  const s = String(full || '').trim();
  if (!s || /скрыт|hidden|^фио\b/i.test(s)) return '';
  const parts = s.split(/\s+/).filter(Boolean);
  let w = parts.length >= 2 ? parts[1] : parts[0];
  if (w.length > 1 && w === w.toUpperCase()) w = w[0] + w.slice(1).toLowerCase();
  return w;
}

/** SMS uchun ism — lotinda (kirill harf SMS'ni uchga bo'ladi) */
function firstName(full) {
  return latin(nameWord(full)).slice(0, 20);
}

/** Ism bo'sh bo'lsa "Assalomu alaykum, !" qolmasin */
// Qator tashlash saqlanadi (ikki til orasida bo'sh qator, havola alohida qatorda)
const tidy = s => String(s).replace(/,[ \t]*([!.?])/g, '$1').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim();

/** +998901234567 — phoneKey (oxirgi 9 raqam) dan, formatdan qat'i nazar */
const e164 = c => (c.phoneKey ? '+998' + c.phoneKey : '');

/**
 * Ochiq vakansiyasi bor lavozimlar va SMS'dagi {lavozim} so'zi.
 * Navbatga FAQAT shu lavozimdagilar tushadi: vakansiyasi yo'q menejerga SMS
 * ketsa, havolada unga "boshqa ishlar" (ranner) chiqadi — nomzod ham, ishonch ham
 * yo'qoladi (Anas, 2026-11-16). {lavozim} — haqiqiy vakansiya nomi: oshpazlar
 * uchun vakansiya "Salatchi" bo'lsa SMS'da "salatchi" (aks holda aldangandek).
 * Lavozim nomi bilan boshlanadigan vakansiya bo'lsa — lavozim nomi.
 */
async function openRoles(agencyId) {
  const vs = await Vacancy.find({ agencyId, status: 'open', listed: { $ne: false }, isTest: { $ne: true } },
    'role title createdAt').sort({ createdAt: 1 }).lean();
  const out = {};
  for (const v of vs) {
    if (!isValidRole(v.role)) continue;
    const label = roleLabel(v.role).toLowerCase();
    // "Salatchi (sovuq oshxona)" -> "salatchi": SMS'da "{lavozim}lar" — qavs/izoh sig'maydi
    const title = latin(String(v.title || '').replace(/\s*[(,].*$/, '').trim()).toLowerCase();
    if (!out[v.role] || title.startsWith(label)) out[v.role] = title.startsWith(label) || !title ? label : title;
  }
  return out;                                  // { xostess: 'xostess', oshpaz: 'salatchi', ... }
}

function render(tpl, c, link, lavozim) {
  const name = firstName(c.fullName);
  const text = String(tpl || DEFAULT_TPL)
    .replace(/\{ism\}/g, name)
    .replace(/\{lavozim\}/g, lavozim || (isValidRole(c.role) ? roleLabel(c.role) : 'restoran').toLowerCase())
    .replace(/\{havola\}/g, link || '');
  return tidy(text);
}

/** Navbat: eng yangi rezyumelar oldin (eski rezyume egasi allaqachon ishga kirgan) */
async function list(agencyId, { role = '', limit = 30, skip = 0, bot = 'TalentHubUzBot' } = {}) {
  const words = await openRoles(agencyId);
  const roles = Object.keys(words);
  const base = Object.assign({ restaurantId: agencyId }, QUEUE, { role: { $in: roles } });
  const q = Object.assign({}, base, isValidRole(role) ? { role: roles.includes(role) ? role : '__yoq__' } : {});
  const [rows, total, sentToday, byRole] = await Promise.all([
    Candidate.find(q, 'id fullName phone phoneKey role location experienceYears createdAt tgInviteToken hasPhoto photoAt updatedAt')
      .sort({ createdAt: -1 }).skip(skip).limit(Math.min(100, limit)).lean(),
    Candidate.countDocuments(q),
    Candidate.countDocuments({ restaurantId: agencyId,
      smsSentAt: { $gte: new Date(Date.now() - 864e5) } }),
    Candidate.aggregate([
      { $match: base },
      { $group: { _id: '$role', n: { $sum: 1 } } }, { $sort: { n: -1 } }
    ])
  ]);
  await ensureTokens(agencyId, rows);
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
      lavozim: words[c.role] || '',            // SMS'dagi so'z — haqiqiy vakansiya nomi
      location: c.location || '',
      exp: c.experienceYears || 0,
      days: Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 864e5),
      link: `t.me/${bot}?start=${c.tgInviteToken}`,
      // Rasm — panel guard'i bilan (base64 javobga kirmaydi); ?v= — yangilansa kesh eskirmasin
      photo: c.hasPhoto ? `/api/recruitment/${c.id}/photo?v=${new Date(c.photoAt || c.updatedAt || 0).getTime()}` : ''
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
    await Candidate.updateOne({ restaurantId: agencyId, id },
      { $set: { smsSentAt: now, tgInviteSentAt: now, tgInviteChannel: 'sms' } });
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

module.exports = { QUEUE, DEFAULT_TPL, list, markSent, render, smsInfo, firstName, nameWord, tidy, e164, newToken, ensureTokens, latin, openRoles, inviteClaim, TASHKENT_RE };
