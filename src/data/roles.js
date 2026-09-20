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
];

const ROLE_KEYS = ROLES.map(r => r.key);
const DEFAULT_ROLE = 'ofitsiant';

function isValidRole(k) { return ROLE_KEYS.includes(k); }
function roleLabel(k)   { return (ROLES.find(r => r.key === k) || {}).label || k || 'Ofitsiant'; }

// Faqat mavjud rol kalitlaridan iborat toza massiv qaytaradi (kirish validatsiyasi uchun)
function sanitizeRoles(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter(isValidRole))];
}

module.exports = { ROLES, ROLE_KEYS, DEFAULT_ROLE, isValidRole, roleLabel, sanitizeRoles };
