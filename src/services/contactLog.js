// ── Nomzod bilan birinchi aloqa va "ko'rildi" ────────────────
// O'zi anketa to'ldirgan nomzod tez soviydi: 1-2 kun javob bo'lmasa
// boshqa joyga ketadi. Panel "Anketadan" bo'limi shuning uchun ikki
// narsani ko'rsatadi: kartani hali hech kim ochmagan (seenAt) va hali
// hech kim bog'lanmagan (firstContactAt). Ikkalasi ham faqat BIRINCHI
// marta yoziladi — keyingi amallar vaqtni surmaydi.
//
// Aloqa hisoblanadi: bosqich o'zgarishi (panel, guruh amali), Telegram
// xabari (panel yoki admin reply), "Qo'ng'iroq" tugmasi.
// Bosqichi 'new' dan boshqa nomzod ko'rilgan va bog'lanilgan hisoblanadi
// (bu maydonlardan oldin ishlangan yozuvlar uchun ham to'g'ri).

const Candidate = require('../models/Candidate');

async function seen(restaurantId, ids) {
  const list = [].concat(ids).filter(Boolean);
  if (!list.length) return;
  await Candidate.updateMany({ restaurantId, id: { $in: list }, seenAt: null }, { $set: { seenAt: new Date() } });
}

async function contacted(restaurantId, ids) {
  const list = [].concat(ids).filter(Boolean);
  if (!list.length) return;
  const now = new Date();
  await Candidate.updateMany({ restaurantId, id: { $in: list }, firstContactAt: null }, { $set: { firstContactAt: now } });
  await seen(restaurantId, list);
}

// Mongo filtrlari — sanoq va ro'yxat bir xil ta'rifni ishlatsin
const UNSEEN = { status: 'new', seenAt: null };
const WAITING = { status: 'new', firstContactAt: null };

module.exports = { seen, contacted, UNSEEN, WAITING };
