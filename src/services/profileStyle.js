// ── NOMZOD PROFILI KARTASI RANGI ─────────────────────────────
// 8 ta bosiq, chuqur rang (Anas, 2026-10-26: "bachkana emas, professional") —
// yorqin gradientlar va emoji naqsh ATAYLAB yo'q. Faqat nomzodning O'Z
// kabinetida ko'rinadi — restoranlarga chiqmaydi. Jinsga qarab avtomatik rang
// BERILMAYDI: boshlang'ich rang nomzodning Telegram profil rangidan
// (getChat -> profile_accent_color_id) eng yaqin bosiq rangga, bo'lmasa to'q ko'k.
// Ranglarning qiymatlari — profil.html'da (.hero.c-*).

const tg = require('./telegram');

const COLORS = ['blue', 'graphite', 'emerald', 'teal', 'burgundy', 'plum', 'rose', 'bronze'];

// Telegram profil rang palitrasi (0..7 bitta rang, 8..15 — shu ranglarning
// ikki rangli varianti): qizil, to'q sariq, binafsha, yashil, firuza, ko'k,
// pushti, kulrang -> eng yaqin bosiq rang.
const TG_MAP = ['burgundy', 'bronze', 'plum', 'emerald', 'teal', 'blue', 'rose', 'graphite'];
function fromTelegram(id) {
  if (id == null || !Number.isInteger(id) || id < 0 || id > 15) return '';
  return TG_MAP[id % 8];
}

/** Faqat ro'yxatdagi rang; '' — tanlovni bekor qilish (Telegram rangiga qaytish) */
function clean({ color } = {}) {
  const out = {};
  if (color !== undefined) {
    if (color !== '' && !COLORS.includes(String(color))) throw Object.assign(new Error('Rang noto\'g\'ri'), { status: 400 });
    out.color = String(color);
  }
  return out;
}

/** Ko'rinadigan rang: tanlangani, bo'lmasa Telegram rangi, bo'lmasa to'q ko'k */
const view = c => {
  const s = (c && c.profileStyle) || {};
  const ok = k => COLORS.includes(k) ? k : '';
  return { color: ok(s.color) || ok(s.tgColor) || 'blue', chosen: !!ok(s.color) };
};

/**
 * Telegram profil rangini bir marta o'qib saqlaydi (o'zi tanlamagan bo'lsa).
 * Xato bo'lsa jim — boshlang'ich to'q ko'k qoladi.
 */
async function syncTelegram(cand) {
  const s = cand.profileStyle || {};
  if (s.color || s.tgCheckedAt || !cand.tgChatId) return;
  let tgColor = '';
  try {
    const chat = await tg.getChat(tg.platformToken(), cand.tgChatId);
    tgColor = fromTelegram(chat && chat.profile_accent_color_id);
  } catch (e) { console.warn('[STYLE] getChat:', e.message); }
  const at = new Date();
  // updateOne: GET /me boshqa maydonlar validatsiyasiga bog'lanib qolmasin
  await cand.constructor.updateOne({ _id: cand._id }, { $set: { 'profileStyle.tgColor': tgColor, 'profileStyle.tgCheckedAt': at } });
  cand.set('profileStyle.tgColor', tgColor);
  cand.set('profileStyle.tgCheckedAt', at);
}

module.exports = { COLORS, fromTelegram, clean, view, syncTelegram };
