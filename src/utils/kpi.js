const MONTHS_UZ = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

function getPeriodKey(date, days = 10) {
  const d   = new Date(date);
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = d.getDate();

  if (days === 7) {
    const jan1 = new Date(y, 0, 1);
    const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${y}-W${String(week).padStart(2,'0')}`;
  }
  if (days === 10) {
    const p = day <= 10 ? '1' : day <= 20 ? '2' : '3';
    return `${y}-${m}-P${p}`;
  }
  if (days === 14) {
    const p = day <= 14 ? '1' : '2';
    return `${y}-${m}-H${p}`;
  }
  if (days === 15) {
    const p = day <= 15 ? '1' : '2';
    return `${y}-${m}-Q${p}`;
  }
  return `${y}-${m}`;
}

function getPeriodLabel(date, days = 10) {
  const d      = new Date(date);
  const y      = d.getFullYear();
  const m      = MONTHS_UZ[d.getMonth()];
  const day    = d.getDate();
  const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();

  if (days === 7) {
    const dow   = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const start = new Date(d); start.setDate(day - dow);
    const end   = new Date(start); end.setDate(start.getDate() + 6);
    return `${start.getDate()} ${MONTHS_UZ[start.getMonth()]} – ${end.getDate()} ${MONTHS_UZ[end.getMonth()]} ${y}`;
  }
  if (days === 10) {
    if (day <= 10) return `1–10 ${m} ${y}`;
    if (day <= 20) return `11–20 ${m} ${y}`;
    return `21–${lastDay} ${m} ${y}`;
  }
  if (days === 14) {
    return day <= 14 ? `1–14 ${m} ${y}` : `15–${lastDay} ${m} ${y}`;
  }
  if (days === 15) {
    return day <= 15 ? `1–15 ${m} ${y}` : `16–${lastDay} ${m} ${y}`;
  }
  return `${m} ${y}`;
}

function getLastPeriodKeys(n, days = 10, from = new Date()) {
  const keys = [];
  let d = new Date(from || new Date());
  while (keys.length < n) {
    const key = getPeriodKey(d, days);
    if (!keys.includes(key)) keys.push(key);
    // kun-bakun orqaga yuriladi — davr uzunligi o'zgaruvchan bo'lganda (masalan 21-31)
    // days qadam bilan sakrashda davr tashlab ketilishi mumkin edi
    d.setDate(d.getDate() - 1);
  }
  return keys;
}

// offset ta davr orqadagi sanani qaytaradi (0 = joriy davr)
function getPeriodRefDate(offset, days = 10) {
  const d = new Date();
  let currentKey = getPeriodKey(d, days), seen = 0;
  while (seen < offset) {
    d.setDate(d.getDate() - 1);
    const k = getPeriodKey(d, days);
    if (k !== currentKey) { seen++; currentKey = k; }
  }
  return d;
}

module.exports = { getPeriodKey, getPeriodLabel, getLastPeriodKeys, getPeriodRefDate };
