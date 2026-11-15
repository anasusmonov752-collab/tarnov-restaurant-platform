// ── NOMZOD YO'LI: yozish va yig'ish (qoida YAGONA shu faylda) ─
//
// Savol: odamlar qayerda tushib qolyapti? Botga kirib, anketani ochmay
// chiqib ketyaptimi; ochib, yarmida qolyaptimi; vakansiyani kim, qachon
// ko'rdi va ariza berdimi.
//
// Yozish (track) HECH QACHON asosiy ishni buzmaydi: xato yutiladi, kutilmaydi.
// Shovqinli hodisalar (vakansiya ko'rish, anketani qayta ochish) 30 daqiqa
// ichida bir marta yoziladi — bitta odam sahifani 5 marta ochsa 5 ta "ko'rish"
// bo'lmasin.

const Event = require('../models/Event');

const KINDS = {
  start: 'Botga kirdi',
  lang:  'Tilni almashtirdi',
  role:  'Lavozim tanladi',
  open:  'Anketani ochdi',
  voice: 'Ovoz bilan boshladi',
  done:  'Anketani tugatdi',
  view:  'Vakansiyani ko\'rdi',
  apply: 'Ariza berdi'
};
const QUIET = { view: 30, open: 30 };   // daqiqa — shu oraliqda takror yozilmaydi

async function record(kind, o = {}) {
  if (!KINDS[kind] || !o.agencyId || !o.tgUserId) return;
  const tgUserId = String(o.tgUserId);
  const ref = String(o.ref || '');
  if (QUIET[kind]) {
    const since = new Date(Date.now() - QUIET[kind] * 60000);
    if (await Event.exists({ agencyId: o.agencyId, tgUserId, kind, ref, at: { $gte: since } })) return;
  }
  await Event.create({
    agencyId: o.agencyId, tgUserId, kind, ref,
    channel: String(o.channel || ''), name: String(o.name || '').slice(0, 60),
    rid: String(o.rid || ''), candidateId: String(o.candidateId || ''),
    isTest: !!o.isTest, at: o.at || new Date()
  });
}

/** Yozish — kutilmaydi va xato bermaydi (asosiy oqim to'xtamasin) */
function track(kind, o) {
  return record(kind, o).catch(e => console.error('[track]', kind, e.message));
}

// ══ YIG'ISH ══════════════════════════════════════════════════

const DAY = 864e5;
const periodStart = days => new Date(Date.now() - Math.max(1, days) * DAY);

/**
 * Voronka — KOHORTA bo'yicha: davr ichida botga kirganlar, keyin ular qaysi
 * bosqichga yetgan. (Davrdagi hamma "tugatdi" ni sanash noto'g'ri — u oldingi
 * haftada kirganlarni ham oladi va foiz 100% dan oshadi.)
 */
async function funnel(agencyId, days) {
  const since = periodStart(days);
  const rows = await Event.aggregate([
    { $match: { agencyId, isTest: { $ne: true }, at: { $gte: since } } },
    { $sort: { at: 1 } },
    { $group: { _id: '$tgUserId', kinds: { $addToSet: '$kind' },
                startCh: { $push: { $cond: [{ $eq: ['$kind', 'start'] }, '$channel', '$$REMOVE'] } } } }
  ]);
  const cohort = rows.filter(r => r.kinds.includes('start'));
  const has = (r, ks) => ks.some(k => r.kinds.includes(k));
  const stage = list => ({
    start: list.length,
    open:  list.filter(r => has(r, ['open', 'voice', 'done', 'apply'])).length,
    done:  list.filter(r => has(r, ['done', 'apply'])).length,
    apply: list.filter(r => has(r, ['apply'])).length
  });
  // Manba — birinchi kirishdagi kanal
  const byCh = {};
  for (const r of cohort) {
    const ch = (r.startCh && r.startCh[0]) || 'bot';
    (byCh[ch] = byCh[ch] || []).push(r);
  }
  return {
    total: stage(cohort),
    channels: Object.entries(byCh).map(([channel, list]) => Object.assign({ channel }, stage(list)))
      .sort((a, b) => b.start - a.start)
  };
}

/** Lavozim tugmalari — qaysi lavozimni qidirishyapti */
async function roles(agencyId, days) {
  const rows = await Event.aggregate([
    { $match: { agencyId, kind: 'role', isTest: { $ne: true }, at: { $gte: periodStart(days) } } },
    { $group: { _id: '$ref', users: { $addToSet: '$tgUserId' } } },
    { $project: { n: { $size: '$users' } } }, { $sort: { n: -1 } }
  ]);
  return rows.map(r => ({ role: r._id, n: r.n }));
}

/** Vakansiyalar: nechta odam ko'rdi, nechtasi ariza berdi, oxirgi ko'rganlar */
async function vacancies(agencyId, days) {
  const rows = await Event.aggregate([
    { $match: { agencyId, kind: { $in: ['view', 'apply'] }, ref: { $ne: '' },
                isTest: { $ne: true }, at: { $gte: periodStart(days) } } },
    { $sort: { at: -1 } },
    { $group: {
        _id: '$ref',
        viewers: { $addToSet: { $cond: [{ $eq: ['$kind', 'view'] }, '$tgUserId', '$$REMOVE'] } },
        appliers: { $addToSet: { $cond: [{ $eq: ['$kind', 'apply'] }, '$tgUserId', '$$REMOVE'] } },
        recent: { $push: { $cond: [{ $eq: ['$kind', 'view'] },
          { tgUserId: '$tgUserId', name: '$name', at: '$at', candidateId: '$candidateId' }, '$$REMOVE'] } }
    } }
  ]);
  return rows.map(r => {
    // bitta odam bir necha marta — oxirgisi qoladi
    const seen = new Set(), recent = [];
    for (const x of r.recent) { if (!seen.has(x.tgUserId)) { seen.add(x.tgUserId); recent.push(x); } if (recent.length >= 8) break; }
    return { vacancyId: r._id, views: r.viewers.length, applies: r.appliers.length, recent };
  }).sort((a, b) => b.views - a.views);
}

/** So'nggi harakatlar — panel lentasi */
async function recent(agencyId, limit = 60) {
  return Event.find({ agencyId, isTest: { $ne: true } }).sort({ at: -1 }).limit(limit).lean();
}

/** Bitta odamning butun yo'li */
async function timeline(agencyId, tgUserId) {
  return Event.find({ agencyId, tgUserId: String(tgUserId) }).sort({ at: 1 }).limit(300).lean();
}

module.exports = { KINDS, track, record, funnel, roles, vacancies, recent, timeline, periodStart };
