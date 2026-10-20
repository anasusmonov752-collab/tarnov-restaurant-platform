// ── RASM TOKENI ──────────────────────────────────────────────
// <img src> sarlavha yubora olmaydi, shuning uchun ilgari Telegram
// initData (24 soatlik, BUTUN API uchun kalit) rasm havolasida `?i=`
// bo'lib yurardi — Render loglari va WebView keshiga tushardi (2026-10-20
// audit). Endi havolada faqat shu token: 12 soat, FAQAT rasm
// endpointlariga yaraydi, ichida Telegram user id va muddat.
// Guard'lar har javobga `X-Photo-Token` sarlavhasini qo'yadi; sahifa
// uni api() ichida eslab qoladi.

const crypto = require('crypto');

const TTL_SEC = 12 * 3600;
const secret = () => 'photo:' + (process.env.JWT_SECRET || process.env.TELEGRAM_BOT_TOKEN || 'dev');
const mac = p => crypto.createHmac('sha256', secret()).update(p).digest('base64url').slice(0, 32);

// Muddat soat boshiga yaxlitlanadi: bir soat ichida token (demak rasm
// havolasi) o'zgarmaydi va brauzer rasmni keshdan oladi
function sign(userId, ttlSec = TTL_SEC) {
  const exp = Math.ceil((Date.now() / 1000 + ttlSec) / 3600) * 3600;
  const p = `${String(userId)}.${exp}`;
  return `${p}.${mac(p)}`;
}

/** @returns {string} Telegram user id yoki '' (yaroqsiz/muddati o'tgan) */
function verify(token) {
  const m = /^(\d{1,20})\.(\d{9,11})\.([\w-]{32})$/.exec(String(token || ''));
  if (!m) return '';
  if (+m[2] < Date.now() / 1000) return '';
  const a = Buffer.from(m[3]), b = Buffer.from(mac(`${m[1]}.${m[2]}`));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : '';
}

module.exports = { sign, verify };
