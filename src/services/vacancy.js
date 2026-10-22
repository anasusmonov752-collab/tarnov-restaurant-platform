// ── VAKANSIYA XIZMATI ────────────────────────────────────────
// Tekshiruv va ko'rinishlar bir joyda. Uch xil o'quvchi bor va
// ularning huquqi har xil:
//
//   agentlik — hammasini ko'radi
//   mijoz    — o'z vakansiyasini ko'radi va tahrirlaydi
//   nomzod   — ko'radi, lekin RESTORAN NOMINI KO'RMAYDI
//
// Oxirgisi pul masalasi: nomzod restoran nomini bilsa, to'g'ridan-to'g'ri
// borib ishga kiradi va biz hech narsa olmaymiz. Mijozni ham shunday
// himoya qilamiz — u nomzod ismini faqat kontakt ochilgach ko'radi.

const { isValidRole, guessRole } = require('../data/roles');
const I18N = require('../../public/js/th-i18n');
const { t } = I18N;
const { langsLabel } = require('../utils/labels');

const VALID_STATUS = ['open', 'paused', 'closed'];
const SHIFTS = ['kunduzgi', 'kechki', 'ikkalasi'];
// Maosh nimaga (salaryFrom/To): restoranlarda kunlik va smenalik to'lov
// odatiy — oylikka aylantirib yozsak, ish beruvchi aytmagan raqam chiqardi.
const PERIODS = ['month', 'day', 'shift'];
const PAYOUTS = ['daily', 'weekly', 'twice', 'monthly'];
// Ro'yxat maydonlari: bitta band — bitta qator, ko'pi bilan 6 ta
const lines = x => (Array.isArray(x) ? x : String(x || '').split('\n'))
  .map(s => String(s).replace(/^[\s•\-–—*]+/, '').trim().slice(0, 140)).filter(Boolean).slice(0, 6);

// Vakansiya necha kundan keyin "eskirgan" hisoblanadi.
// hh'da soxta e'lon muammosi shundan kelib chiqadi: e'lon osilib turadi,
// lekin o'rin allaqachon to'lgan.
const STALE_DAYS = 14;

function isStale(v) {
  if (!v.confirmedAt) return true;
  return (Date.now() - new Date(v.confirmedAt).getTime()) > STALE_DAYS * 864e5;
}

// Sarlavhadan lavozimni aniqlash. Forma lavozim so'ramagan paytda
// yozilgan vakansiyalar hammasi 'boshqa' bo'lib qolgan edi: qidiruv
// ularni "shu lavozimga ochiq vakansiya" deb tanimay, dublikat ochardi.
// Funksiyaning o'zi data/roles.js da — rezyume, vakansiya va qidiruv
// uchun YAGONA jadval (bu yerda eksport qolgan: vac.guessRole chaqiruvlari).

/** Foydalanuvchi yuborgan ma'lumotni tozalaydi. */
function clean(b, prev = {}) {
  const num = (x, lo, hi) => {
    const n = parseInt(x, 10);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
  };
  const out = {};

  if (b.title !== undefined)      out.title = String(b.title).trim().slice(0, 120);
  if (b.role !== undefined)       out.role = isValidRole(b.role) ? b.role : 'boshqa';
  // Lavozim tanlanmagan (eski forma, panel) — sarlavhadan aniqlaymiz.
  // Aniq tanlangan lavozimga tegmaymiz.
  const hasRole = isValidRole(out.role !== undefined ? out.role : prev.role);
  if (!hasRole) {
    const g = guessRole(out.title !== undefined ? out.title : prev.title);
    if (g) out.role = g;
  }
  if (b.minExp !== undefined)     out.minExp = num(b.minExp, 0, 50);
  if (b.minAge !== undefined)     out.minAge = num(b.minAge, 14, 80);
  if (b.maxAge !== undefined)     out.maxAge = num(b.maxAge, 14, 80);
  if (b.shift !== undefined)      out.shift = SHIFTS.includes(b.shift) ? b.shift : '';
  if (b.location !== undefined)   out.location = String(b.location).trim().slice(0, 80);
  if (b.salaryFrom !== undefined) out.salaryFrom = num(b.salaryFrom, 0, 1e9);
  if (b.salaryTo !== undefined)   out.salaryTo = num(b.salaryTo, 0, 1e9);
  if (b.schedule !== undefined)   out.schedule = String(b.schedule).trim().slice(0, 120);
  if (b.conditions !== undefined) out.conditions = String(b.conditions).trim().slice(0, 400);
  if (b.notes !== undefined)      out.notes = String(b.notes).trim().slice(0, 600);
  // Nomzod uchun tavsif — joy NOMSIZ yoziladi (forCandidate restoran nomini bermaydi)
  if (b.venue !== undefined)      out.venue = String(b.venue).trim().slice(0, 80);
  if (b.landmark !== undefined)   out.landmark = String(b.landmark).trim().slice(0, 80);
  if (b.hook !== undefined)       out.hook = String(b.hook).trim().slice(0, 160);
  if (b.salaryPeriod !== undefined) out.salaryPeriod = PERIODS.includes(b.salaryPeriod) ? b.salaryPeriod : 'month';
  if (b.payout !== undefined)     out.payout = PAYOUTS.includes(b.payout) ? b.payout : '';
  if (b.perks !== undefined) {
    out.perks = [...new Set((Array.isArray(b.perks) ? b.perks : []).filter(k => I18N.PERK_KEYS.includes(k)))];
  }
  if (b.duties !== undefined)       out.duties = lines(b.duties);
  if (b.requirements !== undefined) out.requirements = lines(b.requirements);
  if (b.headcount !== undefined)  out.headcount = num(b.headcount, 1, 200) || 1;
  if (b.autoNotify !== undefined) out.autoNotify = !!b.autoNotify;
  // E'lon qilish — "hozir ochiq" degani, shuning uchun tasdiq ham yangilanadi.
  // Aks holda eski avtomatik vakansiya e'lon qilinib, darhol "eskirgan"
  // bo'lib nomzod ro'yxatiga tushmay qolardi.
  if (b.listed !== undefined) {
    out.listed = !!b.listed;
    if (out.listed) out.confirmedAt = new Date();
  }

  if (Array.isArray(b.languages)) {
    out.languages = b.languages.map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 8);
  }
  if (b.startDate !== undefined) {
    const d = b.startDate ? new Date(b.startDate) : null;
    out.startDate = d && !isNaN(d.getTime()) ? d : null;
  }
  if (b.status !== undefined && VALID_STATUS.includes(b.status)) {
    out.status = b.status;
    if (b.status === 'closed') out.closedAt = new Date();
  }

  // Maosh chalkash kiritilsa to'g'rilaymiz — "5 dan 3 gacha" bo'lmaydi
  const from = out.salaryFrom ?? prev.salaryFrom;
  const to   = out.salaryTo   ?? prev.salaryTo;
  if (from && to && from > to) { out.salaryFrom = to; out.salaryTo = from; }

  return out;
}

// Bo'shliqni o'zimiz qo'yamiz: toLocaleString node versiyasiga qarab
// vergul yoki ingichka bo'shliq beradi — natija hamma joyda bir xil bo'lsin
const money = n => n ? String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '';

/** Maosh satri: "4 000 000 – 5 000 000 so'm" / "... сум". lang — o'quvchining tili. */
function salaryText(v, lang = 'uz') {
  // Bitta summa aytilsa ikkalasi teng bo'ladi — "4 000 000 – 4 000 000" emas
  let s = '';
  if (v.salaryFrom && v.salaryTo && v.salaryFrom === v.salaryTo) s = t(lang, 'sal.eq', { a: money(v.salaryFrom) });
  else if (v.salaryFrom && v.salaryTo) s = t(lang, 'sal.range', { a: money(v.salaryFrom), b: money(v.salaryTo) });
  else if (v.salaryFrom) s = t(lang, 'sal.from', { a: money(v.salaryFrom) });
  else if (v.salaryTo)   s = t(lang, 'sal.to', { a: money(v.salaryTo) });
  if (!s) return '';
  // "250 000 – 300 000 so'm / smena" — oylik (odatiy) bo'lsa qo'shimchasiz
  if (v.salaryPeriod === 'day' || v.salaryPeriod === 'shift') s += ' ' + t(lang, 'sal.per.' + v.salaryPeriod);
  return s;
}
const payoutText = (v, lang = 'uz') => (PAYOUTS.includes(v.payout) ? t(lang, 'pay.' + v.payout) : '');
const perkLabels = (v, lang = 'uz') => (v.perks || []).filter(k => I18N.PERK_KEYS.includes(k)).map(k => t(lang, 'perk.' + k));

// Avtomatik yasalgan sarlavha ("Ofitsiant, kechki smena") — o'quvchi tilida.
// Qo'lda yozilgan sarlavhaga TEGMAYMIZ: u mijozning o'z so'zi.
// Ikkala tildagi shakl tekshiriladi: rus tilli mijoz formada yaratgan
// vakansiya o'zbek tilli o'quvchiga ham o'zbekcha chiqsin.
function titleFor(v, lang) {
  if (!lang) return v.title;
  const auto = I18N.LANGS.some(l => v.title === I18N.vacTitle(v.role, v.shift, l));
  return auto ? I18N.vacTitle(v.role, v.shift, lang) : v.title;
}

/**
 * Mijoz va agentlik uchun — hamma narsa ochiq.
 * lang berilsa (Mini App) maosh va avtomatik sarlavha shu tilda;
 * berilmasa (agentlik paneli) — avvalgidek.
 */
function full(v, extra = {}, lang) {
  return Object.assign({
    id: v.id, clientId: v.clientId,
    title: titleFor(v, lang), role: v.role,
    minExp: v.minExp, minAge: v.minAge, maxAge: v.maxAge,
    // Mini App'da tillar o'quvchi tilida ("Rus" -> "Русский"); panelda — kiritilgandek
    languages: lang ? langsLabel(v.languages, lang) : (v.languages || []),
    shift: v.shift, location: v.location,
    salaryFrom: v.salaryFrom, salaryTo: v.salaryTo, salaryText: salaryText(v, lang || 'uz'),
    schedule: v.schedule,
    // "Ovqat · Forma" — ma'lum so'zlar o'quvchi tilida (th-i18n.perksText)
    conditions: lang ? I18N.perksText(v.conditions, lang) : v.conditions,
    venue: v.venue || '', landmark: v.landmark || '', hook: v.hook || '',
    salaryPeriod: v.salaryPeriod || 'month', payout: v.payout || '', payoutText: payoutText(v, lang || 'uz'),
    perks: v.perks || [], perkLabels: perkLabels(v, lang || 'uz'),
    duties: v.duties || [], requirements: v.requirements || [],
    verifiedAt: v.verifiedAt || null,
    startDate: v.startDate, headcount: v.headcount,
    notes: v.notes, status: v.status,
    source: v.source || 'manual', listed: v.listed !== false,
    confirmedAt: v.confirmedAt, stale: isStale(v),
    autoNotify: v.autoNotify,
    createdAt: v.createdAt, closedAt: v.closedAt
  }, extra);
}

/**
 * Nomzod uchun — restoran nomi YO'Q.
 * `client` faqat hudud uchun kerak: "Chilonzorda restoran".
 */
function forCandidate(v, client) {
  const where = v.location || (client && client.location) || '';
  // Ishonch belgisi faqat haqiqat bo'lsa: agentlik ish beruvchiga qo'ng'iroq
  // qilib tekshirgan (verifiedAt) yoki vakansiyani ish beruvchining o'zi
  // tasdiqlagan (faol mijoz). Aks holda — faqat "qachon joylangan".
  const trust = v.verifiedAt ? 'verified' : (client && client.status === 'active' ? 'client' : 'posted');
  const since = v.verifiedAt || (trust === 'client' ? v.confirmedAt : v.createdAt) || v.createdAt;
  return {
    id: v.id,
    title: v.title,
    role: v.role,
    where,
    place: where ? `${where}da restoran` : 'Toshkentda restoran',
    venue: v.venue || '',
    landmark: v.landmark || '',
    hook: v.hook || '',
    salaryText: salaryText(v),
    payoutText: payoutText(v),
    perkLabels: perkLabels(v),
    duties: v.duties || [],
    requirements: v.requirements || [],
    trust,
    trustDays: Math.floor((Date.now() - new Date(since).getTime()) / 864e5),
    shift: v.shift,
    schedule: v.schedule,
    conditions: v.conditions,
    minExp: v.minExp,
    minAge: v.minAge, maxAge: v.maxAge,
    headcount: v.headcount || 1,
    languages: v.languages || [],
    startDate: v.startDate,
    confirmedAt: v.confirmedAt,
    freshDays: Math.floor((Date.now() - new Date(v.confirmedAt || v.createdAt).getTime()) / 864e5)
  };
}

module.exports = { clean, full, forCandidate, salaryText, payoutText, perkLabels, titleFor, isStale, guessRole,
  VALID_STATUS, SHIFTS, PERIODS, PAYOUTS, STALE_DAYS };
