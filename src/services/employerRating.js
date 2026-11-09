// ── ISH BERUVCHI REYTINGI: "MAOSH VA SHARTLAR VA'DA QILINGANIDEK" ──
// O'zbekistonda nomzodning eng katta qo'rquvi — maosh berilmay qolishi yoki
// shartlar aytilganidek bo'lmasligi. Ishga olingan xodimlar 7/30-kunda botda
// javob beradi (services/placements: py/pq/pn). Belgi ("Ishchilar tasdiqlagan")
// faqat: kamida bitta "ha" va bitta ham "yo'q" yo'q. "Yo'q" — agentlikka darhol
// 🚩 (placements). Javoblar faqat yig'ma — kim nima degani ko'rinmaydi.

const Placement = require('../models/Placement');

/** @returns {Promise<Object<string, {yes:number, partial:number, no:number, ok:boolean}>>} */
async function forClients(agencyId, clientIds) {
  const ids = [...new Set((clientIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const rows = await Placement.aggregate([
    { $match: { agencyId, clientId: { $in: ids }, payOk: { $in: ['yes', 'partial', 'no'] } } },
    { $group: { _id: { c: '$clientId', p: '$payOk' }, n: { $sum: 1 } } }
  ]);
  const out = {};
  for (const r of rows) {
    const o = out[r._id.c] = out[r._id.c] || { yes: 0, partial: 0, no: 0, ok: false };
    o[r._id.p] = r.n;
  }
  for (const o of Object.values(out)) o.ok = o.yes >= 1 && o.no === 0;
  return out;
}

module.exports = { forClients };
