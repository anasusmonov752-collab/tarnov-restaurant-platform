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

const { isValidRole } = require('../data/roles');

const VALID_STATUS = ['open', 'paused', 'closed'];
const SHIFTS = ['kunduzgi', 'kechki', 'ikkalasi'];

// Vakansiya necha kundan keyin "eskirgan" hisoblanadi.
// hh'da soxta e'lon muammosi shundan kelib chiqadi: e'lon osilib turadi,
// lekin o'rin allaqachon to'lgan.
const STALE_DAYS = 14;

function isStale(v) {
  if (!v.confirmedAt) return true;
  return (Date.now() - new Date(v.confirmedAt).getTime()) > STALE_DAYS * 864e5;
}

/** Foydalanuvchi yuborgan ma'lumotni tozalaydi. */
function clean(b, prev = {}) {
  const num = (x, lo, hi) => {
    const n = parseInt(x, 10);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
  };
  const out = {};

  if (b.title !== undefined)      out.title = String(b.title).trim().slice(0, 120);
  if (b.role !== undefined)       out.role = isValidRole(b.role) ? b.role : 'boshqa';
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

const money = n => n ? Number(n).toLocaleString('uz-UZ').replace(/,/g, ' ') : '';

/** Maosh satri: "4 000 000 – 5 000 000 so'm" */
function salaryText(v) {
  if (v.salaryFrom && v.salaryTo) return `${money(v.salaryFrom)} – ${money(v.salaryTo)} so'm`;
  if (v.salaryFrom) return `${money(v.salaryFrom)} so'mdan`;
  if (v.salaryTo)   return `${money(v.salaryTo)} so'mgacha`;
  return '';
}

/** Mijoz va agentlik uchun — hamma narsa ochiq. */
function full(v, extra = {}) {
  return Object.assign({
    id: v.id, clientId: v.clientId,
    title: v.title, role: v.role,
    minExp: v.minExp, minAge: v.minAge, maxAge: v.maxAge,
    languages: v.languages || [], shift: v.shift, location: v.location,
    salaryFrom: v.salaryFrom, salaryTo: v.salaryTo, salaryText: salaryText(v),
    schedule: v.schedule, conditions: v.conditions,
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
  return {
    id: v.id,
    title: v.title,
    role: v.role,
    where,
    place: where ? `${where}da restoran` : 'Toshkentda restoran',
    salaryText: salaryText(v),
    shift: v.shift,
    schedule: v.schedule,
    conditions: v.conditions,
    minExp: v.minExp,
    languages: v.languages || [],
    startDate: v.startDate,
    confirmedAt: v.confirmedAt,
    freshDays: Math.floor((Date.now() - new Date(v.confirmedAt || v.createdAt).getTime()) / 864e5)
  };
}

module.exports = { clean, full, forCandidate, salaryText, isStale, VALID_STATUS, SHIFTS, STALE_DAYS };
