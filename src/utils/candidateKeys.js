// ── NOMZODNI TANISH KALITLARI (dublikat tekshiruvi) ──────────
// Ilgari yuklashda telefon MATN sifatida aynan solishtirilardi:
// "+998 90 135 93 94" va "+998901359394" — ikki xil odam bo'lib qolardi.
// AI yiqilsa telefon umuman ajratilmasdi va tekshiruv o'tib ketardi.
// Natija: 50 odam bazada 2-4 martadan (2026-10-19 da o'lchandi).
//
// Uch kalit, ishonchlilik tartibida:
//   textHash — rezyume matnining izi. Bitta PDF qayta yuklansa AI'siz,
//              darhol tanilsin (AI kvotasi ham tejaladi). hh anonim
//              rezyumelari (ism/telefonsiz) faqat shu bilan tutiladi.
//   phoneKey — oxirgi 9 raqam: formatdan qat'i nazar bir xil
//   email    — kichik harfda

const crypto = require('crypto');

function phoneKey(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : '';
}

function emailKey(e) {
  const s = String(e || '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : '';
}

// Bo'sh joy va registr farqi e'tiborsiz. Juda qisqa matn (skan, buzuq PDF)
// kalit bo'lmaydi — ular bir-biriga noto'g'ri mos kelib qolardi.
function textHash(t) {
  const s = String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return s.length >= 200 ? crypto.createHash('sha1').update(s).digest('hex') : '';
}

module.exports = { phoneKey, emailKey, textHash };
