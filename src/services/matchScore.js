// ── MOSLIK BALI (ariza x vakansiya) ──────────────────────────
// Restoran 30 ta arizani emas, eng moslarini birinchi ko'rsin. Ball 0-100,
// AI'siz, faqat ISHGA OID mezonlar: lavozim, tajriba, maosh, yo'l/tuman,
// smena, qachondan chiqa oladi, shartlarga roziligi (botdagi dastlabki
// tekshiruv — services/prescreen). Jins, yosh, millat va shunga o'xshashlar
// ATAYLAB yo'q: ular ish sifatini o'lchamaydi va kamsitish bo'ladi.
//
// Saqlanmaydi — har ko'rsatishda hisoblanadi (nomzod profili, vakansiya
// yoki javoblar o'zgarsa ball ham o'zgaradi). Har bo'lak sababi bilan:
// mijoz "nega 86%" ni ko'radi.

const { guessRole } = require('../data/roles');

// Og'irliklar (jami 100)
const W = { role: 25, exp: 20, salary: 15, place: 10, shift: 10, start: 10, fit: 10 };

/** "4-5 mln", "4 500 000", "4,5 млн", "800 ming" -> so'm (pastki chegara). Topilmasa null. */
function parseMoney(s) {
  const t = String(s || '').toLowerCase().replace(/(\d)[\s '’](?=\d{3}\b)/g, '$1');
  const m = /(\d+(?:[.,]\d+)?)/.exec(t);
  if (!m) return null;
  let n = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(n) || n <= 0) return null;
  if (/(mln|млн|million|миллион|mil\b)/.test(t)) n *= 1e6;
  else if (/(ming|тыс|\bk\b|thousand)/.test(t)) n *= 1e3;
  else if (n < 100) n *= 1e6;                  // "5" deb yozilgan — million
  else if (n < 100000) n *= 1e3;               // "800" — ming
  return Math.round(n);
}

const norm = s => String(s || '').toLowerCase().replace(/[ʻʼ‘’`']/g, '').replace(/\s*(tumani|район|r-n)\s*/g, ' ').trim();
const years = c => (c.experienceYears || 0) || ((c.experienceMonths || 0) / 12);

/**
 * @param c   Candidate (lean)
 * @param v   Vacancy (lean)
 * @param scr Application.screen (ixtiyoriy)
 * @returns {{ score:number, parts:Array<{k:string, ok:boolean|null, v?:object}> }}
 *   parts — sabablar: ok=true (mos), false (mos emas), null (ma'lum emas)
 */
function score(c = {}, v = {}, scr = {}) {
  const parts = [];
  let s = 0;
  const add = (pts, k, ok, vars) => { s += pts; if (k) parts.push({ k, ok, v: vars || {} }); };

  // Lavozim
  const cRole = c.role && c.role !== 'boshqa' ? c.role : guessRole(c.desiredPosition || '');
  if (v.role && cRole === v.role) add(W.role, 'role', true);
  else if (v.role && cRole) add(0, 'role', false);
  else add(W.role * 0.5, null);

  // Tajriba
  const y = years(c), need = v.minExp || 0;
  if (need) {
    if (y >= need) add(W.exp, 'exp', true, { n: Math.floor(y) || 1 });
    else if (y >= need / 2) add(W.exp * 0.5, 'expLow', false, { n: need });
    else add(0, 'expLow', false, { n: need });
  } else add(y > 0 ? W.exp : W.exp * 0.6, y > 0 ? 'exp' : 'expNone', y > 0 ? true : null, { n: Math.floor(y) || 1 });

  // Maosh (faqat oylik vakansiyada solishtiriladi)
  const offer = (!v.salaryPeriod || v.salaryPeriod === 'month') ? (v.salaryTo || v.salaryFrom || 0) : 0;
  const want = parseMoney(c.salaryExpectation);
  if (offer && want) {
    if (want <= offer) add(W.salary, 'salary', true);
    else if (want <= offer * 1.25) add(W.salary * 0.5, 'salaryHigh', false);
    else add(0, 'salaryHigh', false);
  } else add(W.salary * 0.6, null);

  // Yo'l / tuman: botdagi javob aniqroq, bo'lmasa tuman solishtiriladi
  if (scr.commute === '30') add(W.place, 'near', true);
  else if (scr.commute === '60') add(W.place * 0.6, 'mid', null);
  else if (scr.commute === '90') add(0, 'far', false);
  else if (v.location && c.location && (norm(c.location).includes(norm(v.location)) || norm(v.location).includes(norm(c.location)))) add(W.place, 'sameArea', true);
  else add(W.place * 0.5, null);

  // Smena
  if (!v.shift || v.shift === 'ikkalasi') add(W.shift, null);
  else if (!c.shift) add(W.shift * 0.6, null);
  else if (c.shift === v.shift || c.shift === 'ikkalasi') add(W.shift, 'shift', true);
  else add(W.shift * 0.2, 'shiftNo', false);

  // Qachondan chiqa oladi
  if (scr.start === 'now' || scr.start === 'week') add(W.start, scr.start === 'now' ? 'startNow' : 'startWeek', true);
  else if (scr.start === 'later') add(W.start * 0.5, 'startLater', null);
  else if (scr.start === 'busy') add(W.start * 0.3, 'startBusy', null);
  else add(W.start * 0.5, null);

  // Shartlarga roziligi
  if (scr.fit === 'ok') add(W.fit, 'fitOk', true);
  else if (scr.fit === 'sal') add(W.fit * 0.5, 'fitSal', null);
  else if (scr.fit === 'no') add(0, 'fitNo', false);
  else add(W.fit * 0.5, null);

  return { score: Math.max(0, Math.min(100, Math.round(s))), parts };
}

module.exports = { score, parseMoney, W };
