// ── ILOVANING TASHQI MANZILI ─────────────────────────────────
// Mini App havolalari va webhook shu manzildan quriladi. Ikki joyda
// (telegram.js, shortlists.js) kerak — nusxalab yozsak, bir kun
// bittasi eskirib qoladi.

function publicBase(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  // Ko'p proksili zanjirda sarlavha "https,http" bo'lishi mumkin —
  // birinchisi mijozga eng yaqini. Xom holda olsak URL buziladi.
  const raw = (req && req.headers && req.headers['x-forwarded-proto'])
    || (req && req.protocol) || 'https';
  const proto = String(raw).split(',')[0].trim() || 'https';
  return `${proto}://${req.get('host')}`;
}

module.exports = { publicBase };
