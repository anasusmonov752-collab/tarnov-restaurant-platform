// ── NOMZOD PROFILI USLUBI (Telegram Premium'dagi kabi bezash) ──
// Rang (8 oddiy + 8 gradient) va fon naqshi (kartaga sochilgan emoji).
// Faqat nomzodning O'Z kabinetida ko'rinadi — restoranlarga chiqmaydi.
// Jinsga qarab avtomatik rang BERILMAYDI (Anas bilan 2026-10-26): boshlang'ich
// rang nomzodning Telegram profil rangidan (getChat -> profile_accent_color_id),
// bo'lmasa ko'k; keyin o'zi almashtiradi.
// Ranglarning o'zi (gradient qiymatlari) — profil.html'da (STYLE_COLORS).

const tg = require('./telegram');

const HUES = ['blue', 'green', 'orange', 'red', 'violet', 'cyan', 'pink', 'gray'];
const COLORS = HUES.concat(HUES.map(h => h + '2'));        // '2' — ikki rangli gradient
const PATTERNS = ['', 'plate', 'coffee', 'cake', 'pizza', 'star', 'fire', 'heart', 'sparkle'];

// Telegram profil rang palitrasi (0..7 — bitta rang, 8..15 — ikki rangli):
// qizil, to'q sariq, binafsha, yashil, firuza, ko'k, pushti, kulrang.
const TG_ORDER = ['red', 'orange', 'violet', 'green', 'cyan', 'blue', 'pink', 'gray'];
function fromTelegram(id) {
  if (id == null || !Number.isInteger(id) || id < 0 || id > 15) return '';
  const hue = TG_ORDER[id % 8];
  return id >= 8 ? hue + '2' : hue;
}

function clean({ color, pattern } = {}) {
  const out = {};
  if (color !== undefined) {
    if (color !== '' && !COLORS.includes(String(color))) throw Object.assign(new Error('Rang noto\'g\'ri'), { status: 400 });
    out.color = String(color);
  }
  if (pattern !== undefined) {
    if (!PATTERNS.includes(String(pattern))) throw Object.assign(new Error('Naqsh noto\'g\'ri'), { status: 400 });
    out.pattern = String(pattern);
  }
  return out;
}

/** Ko'rinadigan uslub: tanlangani, bo'lmasa Telegram rangi, bo'lmasa ko'k */
const view = c => {
  const s = (c && c.profileStyle) || {};
  return { color: s.color || s.tgColor || 'blue', pattern: s.pattern || '', chosen: !!s.color };
};

/**
 * Telegram profil rangini bir marta o'qib saqlaydi (o'zi tanlamagan bo'lsa).
 * Xato bo'lsa jim — boshlang'ich ko'k qoladi.
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

module.exports = { COLORS, PATTERNS, HUES, fromTelegram, clean, view, syncTelegram };
