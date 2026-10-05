// ── KREDIT HISOBI ────────────────────────────────────────────
// Kredit TANLAGANDA emas, KONTAKT OCHILGANDA yechiladi. Ya'ni mijoz
// bepul tanlaydi, siz nomzod bilan gaplashasiz, nomzod rozi bo'lsagina
// kontakt ochiladi va kredit ketadi. Kafolat shu oqimning ichida —
// mijoz hech qachon tekshirilmagan kontakt uchun to'lamaydi.
//
// Har harakat jurnalga yoziladi (CreditLedger) — pul masalasida
// "nega yechildi?" degan savolga aniq javob bo'lishi kerak.

const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');
const CreditLedger = require('../models/CreditLedger');

/**
 * Kredit qo'shadi yoki yechadi va jurnalga yozadi.
 * Balansni $inc bilan o'zgartiramiz — ikki so'rov bir vaqtda kelsa ham
 * qiymat yo'qolmaydi (o'qib-yozish poygasi bo'lmaydi).
 *
 * @returns {Promise<{balance:number, entryId:string}>}
 */
async function move({ agencyId, clientId, delta, reason, shortlistId = '', candidateId = '', note = '' }) {
  if (!Number.isFinite(delta) || delta === 0) throw new Error('delta noto\'g\'ri');

  // Yechayotgan bo'lsak — yetarli kredit borligini SHU so'rovning o'zida
  // tekshiramiz, aks holda ikki parallel so'rov balansni minusga tushiradi.
  const filter = { agencyId, id: clientId };
  if (delta < 0) filter.credits = { $gte: -delta };

  const updated = await Client.findOneAndUpdate(
    filter,
    { $inc: { credits: delta } },
    { new: true }
  );

  if (!updated) {
    const exists = await Client.findOne({ agencyId, id: clientId });
    throw new Error(exists ? 'Kredit yetarli emas' : 'Mijoz topilmadi');
  }

  const entry = await CreditLedger.create({
    id: uuidv4(), agencyId, clientId,
    delta, reason, shortlistId, candidateId,
    balanceAfter: updated.credits, note
  });

  return { balance: updated.credits, entryId: entry.id };
}

function purchase(args) { return move({ ...args, delta: Math.abs(args.amount), reason: 'purchase' }); }
function bonus(args)    { return move({ ...args, delta: Math.abs(args.amount), reason: 'bonus' }); }
function reveal(args)   { return move({ ...args, delta: -1, reason: 'reveal' }); }
function refund(args)   { return move({ ...args, delta: +1, reason: 'refund' }); }

async function history(agencyId, clientId, limit = 50) {
  return CreditLedger.find({ agencyId, clientId })
    .sort({ createdAt: -1 }).limit(limit).lean();
}

async function balance(agencyId, clientId) {
  const c = await Client.findOne({ agencyId, id: clientId }, 'credits').lean();
  return c ? c.credits : null;
}

module.exports = { move, purchase, bonus, reveal, refund, history, balance };
