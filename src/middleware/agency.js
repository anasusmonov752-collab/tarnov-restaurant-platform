// ── AGENTLIK (TalentHub) GUARD'I ─────────────────────────────
// TalentHub ilgari Tarnov restoranining akkaunti ichida yashardi: Tarnov
// paneliga kirgan har kim TalentHub mijozlari, kreditlari va nomzodlarini
// ko'rardi. TalentHub — Anasning alohida biznesi (2026-10-22 qaror), endi
// o'z akkaunti bor: Restaurant.kind = 'agency'.
//
// Rekruting API'lari (nomzodlar, mijozlar, vakansiyalar, tanlovlar,
// suhbatlar, anketalar, bot sozlamasi) faqat agentlik akkauntiga ochiq.
//
// O'TISH REJIMI: tizimda hali birorta agentlik yo'q bo'lsa — eskicha,
// har qanday restoran akkaunti kiradi. Shunda kod deploy bo'lgandan to
// ma'lumot ko'chirilguncha (super-admin -> "TalentHub'ni ajratish")
// panel ishlayveradi. Birinchi agentlik paydo bo'lishi bilan qoida o'zi
// yoqiladi.

const { auth } = require('./auth');
const Restaurant = require('../models/Restaurant');

const TTL = 60 * 1000;
const kinds = new Map();               // restaurantId -> { kind, at }
let anyCache = { val: false, at: 0 };

async function kindOf(id) {
  const c = kinds.get(id);
  if (c && Date.now() - c.at < TTL) return c.kind;
  const r = await Restaurant.findOne({ id }, 'kind').lean();
  const kind = (r && r.kind) || 'restaurant';
  kinds.set(id, { kind, at: Date.now() });
  return kind;
}

async function anyAgency() {
  if (Date.now() - anyCache.at < TTL) return anyCache.val;
  const val = !!(await Restaurant.exists({ kind: 'agency' }));
  anyCache = { val, at: Date.now() };
  return val;
}

/** Shu akkaunt rekruting bo'limini ko'radimi */
async function canRecruit(restaurantId) {
  if (!restaurantId) return false;
  return (await kindOf(restaurantId)) === 'agency' || !(await anyAgency());
}

// Ko'chirishdan keyin darhol kuchga kirsin (keshni kutmasin)
function invalidate() { kinds.clear(); anyCache = { val: false, at: 0 }; }

const restaurantAuth = auth(['restaurant']);
function agencyAuth(req, res, next) {
  restaurantAuth(req, res, async () => {
    try {
      if (await canRecruit(req.user.restaurantId)) return next();
      res.status(403).json({ error: 'Bu bo\'lim faqat TalentHub agentligi uchun' });
    } catch (e) { next(e); }
  });
}

module.exports = { agencyAuth, canRecruit, kindOf, anyAgency, invalidate };
