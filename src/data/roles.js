// ── XODIM ROLLARI ────────────────────────────────────────────
// Ilgari har xodim "ofitsiant" edi. Endi restoranda turli lavozimlar bor
// va har biriga alohida o'quv fokusi kerak (barmen ichimlik biladi, oshpaz
// oshxona standartlarini, menejer boshqaruvni). Rol shu yerda BIR MARTA
// belgilanadi — server ham, ikkala frontend ham shu ro'yxatga tayanadi.
//
// key — bazada saqlanadigan qiymat (o'zgartirilmasin, eski yozuvlar buziladi).
// 'ofitsiant' — default, eski xodimlar avtomatik shunga tushadi.

const ROLES = [
  { key: 'ofitsiant', label: 'Ofitsiant', emoji: '🍽' },
  { key: 'barmen',    label: 'Barmen',    emoji: '🍸' },
  { key: 'xostess',   label: 'Xostess',   emoji: '💁' },
  { key: 'oshpaz',    label: 'Oshpaz',    emoji: '👨‍🍳' },
  { key: 'kassir',    label: 'Kassir',    emoji: '🧾' },
  { key: 'menejer',   label: 'Menejer',   emoji: '📋' },
  { key: 'operator',  label: 'Call operator', emoji: '📞' },
];

const ROLE_KEYS = ROLES.map(r => r.key);
const DEFAULT_ROLE = 'ofitsiant';

function isValidRole(k) { return ROLE_KEYS.includes(k); }

// ── Erkin matndan lavozimni tanish — YAGONA joy ──
// Rezyume ("Хостес", "менеджер ресторана"), vakansiya sarlavhasi ("Xostes"),
// mijoz so'rovi ("administrator kerak") — hammasi shu funksiyadan o'tadi.
// Ilgari ikkita jadval bor edi (candidateSearch.ROLE_ALIAS va
// vacancy.ROLE_STEMS) va rezyume tahlilchisi umuman tanimasdi: AI "xostes"
// qaytarsa kalitga aynan mos kelmagani uchun 'boshqa' qo'yardi — bazada
// 162 ta nomzod shunday qolib, qidiruvda ko'rinmasdi.
//
// O'zak bo'yicha (xatoli yozuv ham tanilsin). Matnda bir nechta lavozim
// bo'lsa ("менеджер ресторана, старший официант") — BIRINCHI aytilgani:
// odam odatda asosiy lavozimini oldin yozadi.
//
// "Administrator" restoranda — zal menejeri; bot qidiruvi ham uni menejer
// deb tushunadi (Anas qarori kutilmoqda — o'zgarsa shu yerda).
const ROLE_STEMS = [
  ['ofitsiant', /ofits|офиц|оффиц|waiter|waitress/i],
  ['barmen',    /barm|бармен|bartend|barista|бариста/i],
  ['xostess',   /xost|host|хост/i],
  ['oshpaz',    /oshpaz|ошпаз|povar|повар|cook|chef|shef/i],
  ['kassir',    /kass|касс|cashier/i],
  ['menejer',   /menej|менедж|manager|управляющ|direktor|директор|супервайз|supervayz|administr|админ/i],
  // Faqat call-markaz: "Старший оператор установки по очистке газа" —
  // zavod operatori, bizning "operator" emas. Yolg'iz "operator" so'zi
  // (bot so'rovi: "operator kerak") ham tanilsin.
  ['operator',  /call|колл|кол-?центр|контакт-?центр|^\s*(operator|оператор)\s*$/i]
];
// Savdo/SMM/mijozlar menejeri restoran menejeri emas — restoran konteksti
// bo'lmasa "menejer" hisoblanmaydi (mijoz menejer qidirsa ular chiqmasin)
const NOT_REST_MANAGER = /продаж|sales|по работе с клиент|клиентск|smm|смм|маркет|marketing/i;
const REST_CONTEXT = /ресторан|restoran|кафе|kafe|зал\b|zal\b|управляющ|директор|direktor|супервайз|supervayz|администр|administr|отел|hotel/i;

function guessRole(text) {
  const t = String(text || '');
  const salesOnly = NOT_REST_MANAGER.test(t) && !REST_CONTEXT.test(t);
  let best = null, at = Infinity;
  for (const [key, re] of ROLE_STEMS) {
    if (key === 'menejer' && salesOnly) continue;
    const m = re.exec(t);
    if (m && m.index < at && isValidRole(key)) { best = key; at = m.index; }
  }
  return best || '';
}
function roleLabel(k)   { return (ROLES.find(r => r.key === k) || {}).label || k || 'Ofitsiant'; }

// Faqat mavjud rol kalitlaridan iborat toza massiv qaytaradi (kirish validatsiyasi uchun)
function sanitizeRoles(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter(isValidRole))];
}

module.exports = { ROLES, ROLE_KEYS, DEFAULT_ROLE, isValidRole, roleLabel, sanitizeRoles, guessRole };
