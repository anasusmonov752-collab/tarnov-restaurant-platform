// ── QAYTA TAHLIL NATIJASINI QO'SHISH ─────────────────────────
// Qayta tahlil natijasini mavjud yozuvga qo'shadi. Ilgari Object.assign
// hammasini ustidan yozardi — qo'lda tuzatilgan ism, telefon va rol
// (masalan Anas qarori bilan ajratilgan administratorlar) AI javobi bilan
// almashib ketardi (2026-10-20 auditda topildi).
//   ism, telefon, email — bo'sh bo'lsagina
//   rol                 — bo'sh yoki 'boshqa' bo'lsagina
//   qolganlari          — oldin AI tahlil qilgan bo'lsa faqat bo'sh joyga;
//                         birinchi haqiqiy tahlil bo'lsa — yangilanadi
//                         (oldingi qiymatlar AI'siz taxmin edi)
const IDENTITY = ['fullName', 'phone', 'email'];
function mergeParsed(doc, fields) {
  const empty = v => v == null || v === '' || (Array.isArray(v) && !v.length);
  for (const [k, v] of Object.entries(fields || {})) {
    if (empty(v)) continue;
    const cur = doc[k];
    if (IDENTITY.includes(k)) { if (empty(cur)) doc[k] = v; continue; }
    if (k === 'role') { if (empty(cur) || cur === 'boshqa') doc[k] = v; continue; }
    if (!doc.aiParsed || empty(cur)) doc[k] = v;
  }
}

module.exports = { mergeParsed, IDENTITY };
