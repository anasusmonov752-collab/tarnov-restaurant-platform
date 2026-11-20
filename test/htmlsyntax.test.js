// ── Sahifa ichidagi <script> lar kompilyatsiya bo'ladimi ──
// "Mini App oq ekran" tuzog'i (CLAUDE.md): bitta nom ikki marta const/function,
// satr ichiga tushib qolgan haqiqiy yangi qator, yopilmagan qavs — brauzer
// butun skriptni tashlaydi, sahifa bo'sh qoladi. Server testlari buni ko'rmaydi.
// Bu test har public/*.html dagi ichki skriptni V8 da kompilyatsiya qiladi
// (ishga tushirmaydi). Bir sahifadagi bir nechta skript bitta global doirani
// bo'lishadi — yuqori darajadagi let/const/class nomi ikki blokda takrorlansa ham xato.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.join(__dirname, '..', 'public');
const pages = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));

function scripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1];
    if (type && !/^(text\/javascript|application\/javascript)$/i.test(type)) continue;   // json, module, shablon
    const line = html.slice(0, m.index).split('\n').length;
    out.push({ code: m[2], line });
  }
  return out;
}

// Yuqori darajadagi (qavs ichida emas) let/const/class nomlari — taxminiy, lekin
// shu loyiha uslubida (har sahifa o'z ichki skripti) yetarli
function topNames(code) {
  const names = [];
  let depth = 0, i = 0, str = null;
  while (i < code.length) {
    const ch = code[i];
    if (str) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === str) str = null;
      i++; continue;
    }
    if (ch === '/' && code[i + 1] === '/') { const e = code.indexOf('\n', i); i = e < 0 ? code.length : e; continue; }
    if (ch === '/' && code[i + 1] === '*') { const e = code.indexOf('*/', i + 2); i = e < 0 ? code.length : e + 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { str = ch; i++; continue; }
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (depth === 0 && /[a-z]/.test(ch) && (i === 0 || /[\s;]/.test(code[i - 1]))) {
      const m = /^(?:let|const|class)\s+([A-Za-z_$][\w$]*)/.exec(code.slice(i, i + 80));
      if (m) names.push(m[1]);
    }
    i++;
  }
  return names;
}

for (const f of pages) {
  test(`${f}: ichki skriptlar kompilyatsiya bo'ladi`, () => {
    const html = fs.readFileSync(path.join(DIR, f), 'utf8');
    const list = scripts(html);
    const seen = new Map();
    for (const s of list) {
      try { new vm.Script(s.code, { filename: `${f}:${s.line}` }); }
      catch (e) { assert.fail(`${f} (skript ${s.line}-qatordan): ${e.message}`); }
      if (list.length > 1) {
        for (const n of topNames(s.code)) {
          assert.ok(!seen.has(n), `${f}: "${n}" ikki skriptda e'lon qilingan (${seen.get(n)}- va ${s.line}-qator) — ikkinchisi yiqiladi`);
          seen.set(n, s.line);
        }
      }
    }
  });
}
