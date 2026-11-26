// ── QO'NG'IROQ RO'YXATI — QOIDA BITTA JOYDA ──────────────────
// 2026-11-23: 50 nomzod qo'ng'iroq kutardi, 46 tasi 24 soatdan oshgan. Tor joy —
// inson halqasi: arizalar bir sahifada, anketa nomzodlari boshqasida, "javob
// bermadi" hech qayerda yozilmasdi (keyin kimga qayta qo'ng'iroq qilish kerakligi
// esda qolardi). Endi bitta ro'yxat (panel /qongiroq.html):
//
// Kim tushadi (bir odam — bitta qator, bir nechta arizasi bo'lsa ham):
//   • arizasi bor, qaror yo'q, "Bog'landim" yo'q, vakansiya ochiq/pauzada
//     (Arizalar sahifasining "Javob kutmoqda" qoidasi), sinov emas;
//   • anketani o'zi to'ldirgan, hali hech kim bog'lanmagan (contactLog.WAITING).
// Natija (record):
//   talked      — aloqa yoziladi (arizalar contactedAt, nomzod firstContactAt) — chiqadi
//   noanswer    — ertaga 10:00 (Toshkent) qayta chiqadi; 3-marta — unreachable
//   unfit       — kutayotgan arizalari rad etiladi (nomzodga yumshoq xabar), arizasiz
//                 anketa nomzodi bosqichi 'rejected' (mijoz qidiruvida chiqmaydi)
// Ulanmagan (unreachable) nomzod yangi ariza bersa — yana ro'yxatga tushadi.
// "Bugun" sahifasi va yon menyu sanog'i ham SHU yerdan (counts) — ikki ta'rif bo'lmasin.

const Application = require('../models/Application');
const Candidate = require('../models/Candidate');
const Vacancy = require('../models/Vacancy');
const Client = require('../models/Client');
const contactLog = require('./contactLog');

const H = 36e5, DAY = 24 * H;
const MAX_TRIES = 3;
const RESULTS = ['talked', 'noanswer', 'unfit'];
const FIELDS = 'id fullName phone role desiredPosition experienceYears age location source hasPhoto updatedAt ' +
  'tgUsername tgState createdAt status firstContactAt callTries callLast callLastAt callNextAt isTest ' +
  'salaryExpectation phoneVerifiedAt';

/** Ertaga 10:00 Toshkent vaqti (UTC+5, yozgi vaqt yo'q) */
function nextMorning(now = new Date()) {
  const shift = 5 * H;
  const dayStart = Math.floor((now.getTime() + shift) / DAY) * DAY - shift;
  return new Date(dayStart + DAY + 10 * H);
}

/**
 * @returns {{ due:object[], later:object[], unreachable:object[], counts:object }}
 * Har qator: { cand, apps:[{id, vacancyId, vacancy, client, createdAt, message}], anketa:bool,
 *              since, waitingMs, late, retry }
 */
async function build(agencyId, now = new Date()) {
  const vacs = await Vacancy.find({ agencyId, status: { $in: ['open', 'paused'] } }, 'id title clientId venue').lean();
  const vBy = Object.fromEntries(vacs.map(v => [v.id, v]));
  const [apps, anks] = await Promise.all([
    Application.find({ agencyId, state: { $in: ['new', 'seen'] }, contactedAt: null, isTest: { $ne: true },
      vacancyId: { $in: vacs.map(v => v.id) } }, 'id vacancyId candidateId clientId createdAt message').lean(),
    Candidate.find(Object.assign({ restaurantId: agencyId, source: 'anketa', isTest: { $ne: true } }, contactLog.WAITING), FIELDS).lean()
  ]);
  // Arizasi bo'yicha allaqachon bog'lanilgan (Arizalar sahifasida "Bog'landim", qaror) anketa
  // nomzodi — kutmayapti (2026-11-26 gacha "Bog'landim" nomzodning firstContactAt'ini yozmasdi)
  const touched = new Set(anks.length ? await Application.distinct('candidateId', { agencyId,
    candidateId: { $in: anks.map(c => c.id) },
    $or: [{ contactedAt: { $ne: null } }, { state: 'shortlisted' }, { state: 'rejected', reason: { $nin: ['withdrawn', 'vac_closed'] } }] }) : []);
  const cBy = Object.fromEntries(anks.map(c => [c.id, c]));
  const missing = [...new Set(apps.map(a => a.candidateId))].filter(id => !cBy[id]);
  if (missing.length) {
    const more = await Candidate.find({ restaurantId: agencyId, id: { $in: missing }, isTest: { $ne: true } }, FIELDS).lean();
    more.forEach(c => { cBy[c.id] = c; });
  }
  const clients = await Client.find({ agencyId, id: { $in: [...new Set(vacs.map(v => v.clientId))] } }, 'id name status isTest').lean();
  const kBy = Object.fromEntries(clients.map(k => [k.id, k]));

  const rows = {};
  const row = c => rows[c.id] || (rows[c.id] = { cand: c, apps: [], anketa: false, since: null });
  for (const c of anks) { if (touched.has(c.id)) continue; const r = row(c); r.anketa = true; r.since = c.createdAt; }
  for (const a of apps) {
    const c = cBy[a.candidateId];
    const v = vBy[a.vacancyId];
    const k = v && kBy[v.clientId];
    if (!c || (k && k.isTest)) continue;          // sinov nomzodi / sinov mijozining vakansiyasi
    const r = row(c);
    r.apps.push({ id: a.id, vacancyId: a.vacancyId, createdAt: a.createdAt, message: a.message || '',
      vacancy: { title: (v && v.title) || '', venue: (v && v.venue) || '' },
      client: { name: (k && k.name) || '', status: (k && k.status) || '' } });
    if (!r.since || new Date(a.createdAt) < new Date(r.since)) r.since = a.createdAt;
  }

  const t = now.getTime();
  const out = { due: [], later: [], unreachable: [] };
  for (const r of Object.values(rows)) {
    const c = r.cand;
    r.waitingMs = t - new Date(r.since).getTime();
    r.late = r.waitingMs > DAY;
    r.retry = (c.callTries || 0) > 0 && c.callLast === 'noanswer';
    const newest = Math.max(r.anketa ? new Date(c.createdAt).getTime() : 0, ...r.apps.map(a => new Date(a.createdAt).getTime()));
    if (c.callLast === 'unreachable' && c.callLastAt && new Date(c.callLastAt).getTime() >= newest) out.unreachable.push(r);
    else if (c.callNextAt && new Date(c.callNextAt).getTime() > t) out.later.push(r);
    else out.due.push(r);
  }
  // Tartib: bugun kelganlar (24 soat va'dasi hali bajarilishi mumkin) -> qayta qo'ng'iroq
  // vaqti kelganlar -> kechikkanlar. Har guruh ichida yangilari oldin (ish qidirayotgan bo'lishi ehtimoli katta).
  const rank = r => (!r.late ? 0 : r.retry ? 1 : 2);
  out.due.sort((a, b) => rank(a) - rank(b) || a.waitingMs - b.waitingMs);
  out.later.sort((a, b) => new Date(a.cand.callNextAt) - new Date(b.cand.callNextAt));
  out.unreachable.sort((a, b) => new Date(b.cand.callLastAt) - new Date(a.cand.callLastAt));
  out.counts = {
    due: out.due.length,
    late: out.due.filter(r => r.late).length,
    apps: out.due.filter(r => r.apps.length).length,
    anketa: out.due.filter(r => !r.apps.length).length,
    later: out.later.length,
    unreachable: out.unreachable.length
  };
  return out;
}

async function counts(agencyId, now = new Date()) {
  return (await build(agencyId, now)).counts;
}

/**
 * Qo'ng'iroq natijasi. @returns {{ ok, result, tries?, nextAt?, apps? }}
 * apps — "talked" dan keyin panel "Ish beruvchiga taklif" ni taklif qiladi.
 */
async function record({ agencyId, candId, result, appBase, now = new Date() }) {
  if (!RESULTS.includes(result)) { const e = new Error('Natija noto\'g\'ri'); e.status = 400; throw e; }
  const c = await Candidate.findOne({ restaurantId: agencyId, id: candId }, 'id status callTries').lean();
  if (!c) { const e = new Error('Nomzod topilmadi'); e.status = 404; throw e; }
  const waitQ = { agencyId, candidateId: candId, state: { $in: ['new', 'seen'] }, contactedAt: null };
  const waiting = await Application.find(waitQ, 'id vacancyId').lean();

  if (result === 'noanswer') {
    const up = await Candidate.findOneAndUpdate({ restaurantId: agencyId, id: candId },
      { $inc: { callTries: 1 }, $set: { callLastAt: now } }, { returnDocument: 'after', projection: 'callTries' });
    const tries = up.callTries;
    const gaveUp = tries >= MAX_TRIES;
    await Candidate.updateOne({ restaurantId: agencyId, id: candId }, { $set: gaveUp
      ? { callLast: 'unreachable', callNextAt: null }
      : { callLast: 'noanswer', callNextAt: nextMorning(now) } });
    await contactLog.seen(agencyId, [candId]);
    // Kartani ochganga teng — arizalar "Ko'rilmagan" bo'lib qolmasin (aloqa EMAS)
    await Application.updateMany(Object.assign({ agencySeenAt: null }, waitQ), { $set: { agencySeenAt: now } });
    return { ok: true, result: gaveUp ? 'unreachable' : 'noanswer', tries, nextAt: gaveUp ? null : nextMorning(now) };
  }

  const done = { callLast: result, callLastAt: now, callNextAt: null, callTries: 0 };
  if (result === 'talked') {
    await Application.updateMany(waitQ, { $set: { contactedAt: now } });
    await Application.updateMany({ agencyId, candidateId: candId, agencySeenAt: null, id: { $in: waiting.map(a => a.id) } },
      { $set: { agencySeenAt: now } });
    await contactLog.contacted(agencyId, [candId]);
    await Candidate.updateOne({ restaurantId: agencyId, id: candId }, { $set: done });
    return { ok: true, result, apps: waiting.map(a => ({ id: a.id, vacancyId: a.vacancyId })) };
  }

  // unfit
  const applications = require('./applications');
  let rejected = 0;
  for (const a of waiting) if (await applications.agencyReject({ agencyId, appId: a.id, appBase })) rejected++;
  const set = Object.assign({}, done);
  if (!waiting.length && c.status === 'new') Object.assign(set, { status: 'rejected', statusChangedAt: now });
  await contactLog.contacted(agencyId, [candId]);
  await Candidate.updateOne({ restaurantId: agencyId, id: candId }, { $set: set });
  return { ok: true, result, rejected };
}

module.exports = { build, counts, record, nextMorning, MAX_TRIES, RESULTS };
