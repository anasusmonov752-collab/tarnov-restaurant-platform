// ── KREDIT HISOBI ────────────────────────────────────────────
// Kredit TANLAGANDA emas, KONTAKT OCHILGANDA yechiladi. Ya'ni mijoz
// bepul tanlaydi, siz nomzod bilan gaplashasiz, nomzod rozi bo'lsagina
// kontakt ochiladi va kredit ketadi. Kafolat shu oqimning ichida —
// mijoz hech qachon tekshirilmagan kontakt uchun to'lamaydi.
//
// Har harakat jurnalga yoziladi (CreditLedger) — pul masalasida
// "nega yechildi?" degan savolga aniq javob bo'lishi kerak.

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Client = require('../models/Client');
const CreditLedger = require('../models/CreditLedger');

// Balans va jurnal yozuvi BITTA tranzaksiyada: ilgari ular ikki alohida
// yozuv edi — server orasida o'chsa balans o'zgarib, jurnalda izi
// qolmasdi (2026-10-20 auditda topildi). Atlas replika to'plami —
// tranzaksiya ishlaydi; mahalliy yakka MongoDB'da ishlamasa eski yo'l.
let txnUnsupported = false;
const noTxn = e => e && (e.code === 20 || /replica set|Transaction numbers/i.test(e.message || ''));

/**
 * Kredit qo'shadi yoki yechadi va jurnalga yozadi.
 * Balansni $inc bilan o'zgartiramiz — ikki so'rov bir vaqtda kelsa ham
 * qiymat yo'qolmaydi (o'qib-yozish poygasi bo'lmaydi).
 *
 * @returns {Promise<{balance:number, entryId:string}>}
 */
async function move(args) {
  if (!Number.isFinite(args.delta) || args.delta === 0) throw new Error('delta noto\'g\'ri');
  if (!txnUnsupported) {
    try {
      return await mongoose.connection.transaction(session => moveIn(args, session));
    } catch (e) {
      if (!noTxn(e)) throw e;
      txnUnsupported = true;
      console.warn('[CREDITS] MongoDB tranzaksiyani qo\'llamaydi — jurnal alohida yoziladi');
    }
  }
  return moveIn(args, null);
}

async function moveIn({ agencyId, clientId, delta, reason, shortlistId = '', candidateId = '', note = '' }, session) {
  // Yechayotgan bo'lsak — yetarli kredit borligini SHU so'rovning o'zida
  // tekshiramiz, aks holda ikki parallel so'rov balansni minusga tushiradi.
  const filter = { agencyId, id: clientId };
  if (delta < 0) filter.credits = { $gte: -delta };

  const updated = await Client.findOneAndUpdate(
    filter,
    { $inc: { credits: delta } },
    { new: true, session }
  );

  if (!updated) {
    const exists = await Client.findOne({ agencyId, id: clientId }).session(session);
    throw new Error(exists ? 'Kredit yetarli emas' : 'Mijoz topilmadi');
  }

  // Bir element uchun ikkinchi 'reveal' yozuvi — jurnalda unikal indeks
  // (CreditLedger) rad etadi va tranzaksiya balansni ham qaytaradi
  const [entry] = await CreditLedger.create([{
    id: uuidv4(), agencyId, clientId,
    delta, reason, shortlistId, candidateId,
    balanceAfter: updated.credits, note
  }], { session });

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
