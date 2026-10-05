// ── TELEGRAM MINI APP AVTORIZATSIYASI ────────────────────────
// Mini App ochilganda Telegram `initData` beradi — bot tokeni bilan
// imzolangan satr. Server imzoni tekshiradi va foydalanuvchi id'sini
// oladi. Cookie yo'q, parol yo'q.
//
// Algoritm (Telegram hujjati):
//   secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
//   hash       = HMAC_SHA256(key=secret_key,  msg=data_check_string)
// data_check_string — "hash" dan tashqari barcha kalit=qiymat juftlari,
// kalit bo'yicha saralanib \n bilan birlashtiriladi.

const crypto = require('crypto');
const tg = require('./telegram');

// Imzo eskirgan bo'lsa rad etamiz — o'g'irlangan initData cheksiz
// ishlatilmasin.
const MAX_AGE_SEC = 24 * 60 * 60;

/**
 * @param {string} initData  Telegram bergan xom satr
 * @returns {{ok:boolean, user?:object, error?:string}}
 */
function verify(initData) {
  const token = tg.platformToken();
  if (!token) return { ok: false, error: 'Bot sozlanmagan' };
  if (!initData || typeof initData !== 'string') return { ok: false, error: 'initData yo\'q' };

  let params;
  try { params = new URLSearchParams(initData); }
  catch { return { ok: false, error: 'initData buzuq' }; }

  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'imzo yo\'q' };

  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (k !== 'hash') pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  // Doimiy vaqtli solishtirish — imzoni belgima-belgi taxmin qilishning
  // oldini oladi
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'imzo mos kelmadi' };
  }

  const authDate = parseInt(params.get('auth_date'), 10);
  if (!Number.isFinite(authDate)) return { ok: false, error: 'auth_date yo\'q' };
  if (Date.now() / 1000 - authDate > MAX_AGE_SEC) return { ok: false, error: 'imzo eskirgan' };

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { /* bo'sh qoladi */ }
  if (!user || !user.id) return { ok: false, error: 'foydalanuvchi yo\'q' };

  return { ok: true, user };
}

module.exports = { verify, MAX_AGE_SEC };
