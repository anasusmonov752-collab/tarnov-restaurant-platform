// ── O'zbekcha sana (brauzerda 'uz' formati bo'lmasa) ─────────
// Ko'p brauzerlar (Windows Chrome, Telegram'ning Android WebView'i)
// toLocaleDateString('uz-UZ', ...) uchun "M10 22, Thu" qaytaradi —
// ularda o'zbek oy/kun nomlari yo'q. Sahifalar kodini o'zgartirmaslik
// uchun shu yerda 'uz' locale'i bilan chaqirilgan uchta metodni
// to'g'rilaymiz; boshqa tillar (ru-RU va h.k.) o'zgarishsiz.
// Sahifa skriptlaridan OLDIN, <head> da, defer'siz ulanadi.
(function () {
  const OY_L = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
  const OY_S = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
  const KUN_L = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
  const KUN_S = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];

  function broken() {
    try {
      const s = new Date(2026, 9, 22).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', weekday: 'long' });
      return !/oktabr/i.test(s) || !/payshanba/i.test(s);
    } catch (e) { return true; }
  }
  if (!broken()) return;

  const pad = n => String(n).padStart(2, '0');
  function datePart(d, o) {
    const dd = o.day === '2-digit' ? pad(d.getDate()) : String(d.getDate());
    let s;
    if (o.month === 'long' || o.month === 'short') {
      const m = (o.month === 'long' ? OY_L : OY_S)[d.getMonth()];
      s = o.day ? `${dd}-${m}` : m;
      if (o.year) s += ` ${d.getFullYear()}${o.month === 'long' ? '-yil' : ''}`;
    } else {
      const parts = [];
      if (o.day || !o.month) parts.push(pad(d.getDate()));
      if (o.month || (!o.day && !o.year)) parts.push(pad(d.getMonth() + 1));
      if (o.year || (!o.day && !o.month)) parts.push(o.year === '2-digit' ? String(d.getFullYear()).slice(-2) : d.getFullYear());
      s = parts.join('.');
    }
    if (o.weekday) s = `${(o.weekday === 'long' ? KUN_L : KUN_S)[d.getDay()]}, ${s}`;
    return s;
  }
  const timePart = (d, o) => o.second ? `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const has = (o, ks) => ks.some(k => o[k] !== undefined);

  function fmt(d, o, kind) {
    o = o || {};
    const D = has(o, ['year', 'month', 'day', 'weekday']), T = has(o, ['hour', 'minute', 'second']);
    if (kind === 'time') return timePart(d, o);
    if (kind === 'date') return datePart(d, D ? o : { day: '2-digit', month: '2-digit', year: 'numeric' });
    // toLocaleString: hech narsa so'ralmasa — sana va vaqt
    if (!D && !T) return `${datePart(d, { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${timePart(d, {})}`;
    return [D ? datePart(d, o) : '', T ? timePart(d, o) : ''].filter(Boolean).join(', ');
  }

  const isUz = l => (typeof l === 'string' && /^uz/i.test(l)) || (Array.isArray(l) && /^uz/i.test(l[0] || ''));
  const P = Date.prototype, orig = { d: P.toLocaleDateString, s: P.toLocaleString, t: P.toLocaleTimeString };
  P.toLocaleDateString = function (l, o) { return isUz(l) && !isNaN(this) ? fmt(this, o, 'date') : orig.d.call(this, l, o); };
  P.toLocaleString = function (l, o) { return isUz(l) && !isNaN(this) ? fmt(this, o, 'both') : orig.s.call(this, l, o); };
  P.toLocaleTimeString = function (l, o) { return isUz(l) && !isNaN(this) ? fmt(this, o, 'time') : orig.t.call(this, l, o); };
})();
