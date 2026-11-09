// ── MAOSH VA BOZOR TAHLILI ───────────────────────────────────
// Restoran noto'g'ri maosh bilan haftalab vaqt yo'qotmasin: "Chilonzorda
// ofitsiant o'rtacha 5 mln kutadi, sizning 3.5 mln taklifingizga ariza kam
// keladi". Manba — O'ZIMIZNING baza: nomzodlar kutgan maosh (anketa/rezyume,
// matchScore.parseMoney — pastki chegara) va ochiq vakansiyalar taklifi.
// Hech kimda yo'q ma'lumot — sotuvda birinchi suhbat bahonasi (ochiq sahifa
// /maosh.html), Mini App'da vakansiya formasida maslahat.
// Maxfiylik: kamida MIN_N ta yozuv bo'lmasa o'rtacha ko'rsatilmaydi (bitta
// odamning maoshi ochilib qolmasin). Sinov yozuvlari hisoblanmaydi.

const Candidate = require('../models/Candidate');
const Vacancy = require('../models/Vacancy');
const { parseMoney } = require('./matchScore');
const { isValidRole } = require('../data/roles');

const MIN_N = 5;
const norm = s => String(s || '').toLowerCase().replace(/[ʻʼ‘’`']/g, '').replace(/\s*(tumani|район)\s*/g, ' ').trim();

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)) / 100000) * 100000;   // 100 mingga yaxlitlab
}

/**
 * @returns {{ role, n, median, p25, p75, active, nearby, offers: { n, median } }}
 *   median/p25/p75 — nomzodlar kutgan oylik (so'm), n < MIN_N bo'lsa null
 */
async function stats(agencyId, { role, location = '' } = {}) {
  if (!isValidRole(role) || role === 'boshqa') return null;
  const base = { restaurantId: agencyId, role, isTest: { $ne: true } };
  const [rows, active, vacs] = await Promise.all([
    Candidate.find(Object.assign({ salaryExpectation: { $nin: ['', null] } }, base), 'salaryExpectation').limit(3000).lean(),
    Candidate.find(Object.assign({ jobStatus: { $in: ['active', 'considering', 'unknown'] } }, base), 'location').limit(5000).lean(),
    Vacancy.find({ agencyId, role, isTest: { $ne: true }, status: 'open', salaryPeriod: { $in: ['month', '', null] } }, 'salaryFrom salaryTo').limit(500).lean()
  ]);
  const wants = rows.map(r => parseMoney(r.salaryExpectation)).filter(x => x && x >= 1e6 && x <= 5e7).sort((a, b) => a - b);
  const offers = vacs.map(v => v.salaryTo || v.salaryFrom).filter(x => x && x >= 1e6 && x <= 5e7).sort((a, b) => a - b);
  const loc = norm(location);
  const ok = wants.length >= MIN_N;
  return {
    role,
    n: wants.length,
    median: ok ? quantile(wants, 0.5) : null,
    p25: ok ? quantile(wants, 0.25) : null,
    p75: ok ? quantile(wants, 0.75) : null,
    active: active.length,
    nearby: loc ? active.filter(c => norm(c.location) && (norm(c.location).includes(loc) || loc.includes(norm(c.location)))).length : null,
    offers: { n: offers.length, median: offers.length >= MIN_N ? quantile(offers, 0.5) : null }
  };
}

/**
 * Taklif bozorga nisbatan: low (nomzodlar kutganidan 15%+ past), ok, high (20%+ yuqori).
 * @returns {{ level:''|'low'|'ok'|'high', pct:number }}
 */
function advise(offer, st) {
  if (!offer || !st || !st.median) return { level: '', pct: 0 };
  const pct = Math.round((offer - st.median) / st.median * 100);
  return { level: pct <= -15 ? 'low' : pct >= 20 ? 'high' : 'ok', pct };
}

module.exports = { stats, advise, MIN_N };
