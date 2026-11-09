// ── NOMZODNING ISHONCHLILIK TARIXI ───────────────────────────
// Boshqa hech kimda yo'q ma'lumot: nomzod suhbatlarga kelganmi va ishga
// olingach qolganmi. Mijoz anonim kartada ko'radi ("3/3 suhbatga kelgan",
// "Oldingi ishda 1+ oy"). Manba — services/interviews (Interview) va
// services/placements (Placement); saqlanmaydi, yig'iladi.
// Faqat ishonch belgisi — ism, restoran nomi chiqmaydi.

const Interview = require('../models/Interview');
const Placement = require('../models/Placement');

const DAY = 864e5;

/** @returns {Promise<Object<string, {came:number, total:number, stayed:boolean}>>} */
async function forCandidates(agencyId, ids, now = new Date()) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return {};
  const [iv, pl] = await Promise.all([
    // Kelgan / kelmagan (oldindan "bormayman" degan — mas'uliyatli, hisobga olinmaydi)
    Interview.aggregate([
      { $match: { agencyId, candidateId: { $in: list }, status: { $in: ['done', 'noshow'] } } },
      { $group: { _id: '$candidateId', total: { $sum: 1 }, came: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } } }
    ]),
    Placement.find({ agencyId, candidateId: { $in: list } }, 'candidateId status hiredAt leftAt').lean()
  ]);
  const out = {};
  for (const r of iv) out[r._id] = { came: r.came, total: r.total, stayed: false };
  for (const p of pl) {
    const end = p.leftAt || now;
    if (p.status === 'done' || end - new Date(p.hiredAt) >= 30 * DAY) {
      out[p.candidateId] = Object.assign(out[p.candidateId] || { came: 0, total: 0 }, { stayed: true });
    }
  }
  return out;
}

module.exports = { forCandidates };
