// ── TARIFLAR — YAGONA JADVAL ─────────────────────────────────
// Anas bilan kelishilgan (2026-10-23): narx so'mda, "birinchi 20 restoran
// uchun" ishga tushirish narxi. Tarif = muddat + kontakt (kredit) limiti:
// kreditni reveal() yechadi (1 kredit = 1 ochilgan kontakt), muddat
// tugaganda ishlatilmagan kreditlar yonadi (services/billing.expire).
// Yangi tarif sotib olinganda qolgan kreditlar YANGISIGA qo'shiladi.
//
// Kafolat (oferta matni shundan): Base/Pro — kamida N ta tekshirilgan, ishga
// rozi nomzod, bo'lmasa muddat bepul uzaytiriladi; Max — oy ichida kamida
// 1 xodim ishga chiqadi, bo'lmasa keyingi oy bepul; 30 kunda ketsa almashtirish.
// Shart: maosh bozor darajasida, mijoz 48 soatda javob beradi; oshpaz va
// menejer kafolatga kirmaydi.

const PLANS = {
  base: { key: 'base', price: 499000,  days: 14, contacts: 10,  guarantee: { candidates: 5 } },
  pro:  { key: 'pro',  price: 999000,  days: 30, contacts: 30,  guarantee: { candidates: 15 }, popular: true },
  max:  { key: 'max',  price: 2999000, days: 30, contacts: 100, guarantee: { hire: 1, replace: true },
          unlimited: true, personalHr: true }
};
const PLAN_KEYS = Object.keys(PLANS);

// Bepul sinov — har mijozga bir marta
const TRIAL = { key: 'trial', contacts: 3, days: 7 };

// Muddat tugashidan necha kun oldin eslatiladi
const REMIND_DAYS = 3;

const isPlan = k => PLAN_KEYS.includes(k);

module.exports = { PLANS, PLAN_KEYS, TRIAL, REMIND_DAYS, isPlan };
