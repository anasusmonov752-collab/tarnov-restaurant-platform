// ── KPI HISOBI ───────────────────────────────────────────────
// Ilgari bu logika restaurant.js va waiter.js da IKKI marta yozilgan edi
// va daraja FAQAT menyu testi o'rtachasidan chiqardi. Endi yagona joyda,
// KOMPOZIT ball asosida: test + menyu o'rganilgani + modul tugatilgani.
//
// NEGA KOMPOZIT: maosh bonus/jarimasi faqat menyu testiga bog'lansa,
// ishni yaxshi qilib, lekin menyuni yod bilmagan xodim jarima yeydi.
// Kompozit ball haqiqiy tayyorlik darajasini aks ettiradi.
//
// GATE: davr ichida hech bo'lmasa BITTA test topshirilgan bo'lishi shart.
// Aks holda 'nodata' — bonus/jarima yo'q (eski xulq saqlanadi). Test bor
// bo'lsa, daraja endi test + menyu + modul aralashmasidan chiqadi.

const { getPeriodKey, getPeriodLabel, getLastPeriodKeys } = require('../utils/kpi');

const KPI_DEFAULTS = {
  periodDays: 10,
  masterMin: 90, masterBonus: 15,
  proMin: 75,    proBonus: 0,
  goodMin: 60,   goodBonus: 0,
  warningMin: 45, warningPenalty: -10,
  penaltyMin: 30, penaltyFine: -20,

  // ── Kompozit ball vaznlari (yig'indisi 100 bo'lishi shart emas — normallashtiriladi) ──
  // Vaznni 0 qilib qo'yilsa, o'sha komponent hisobga olinmaydi (eski faqat-test xulqiga qaytish uchun menuWeight=0, moduleWeight=0).
  testWeight:   60,   // menyu/servis testi o'rtachasi
  menuWeight:   25,   // menyu o'rganilgan % ("Bildim")
  moduleWeight: 15,   // o'quv modullari tugatilgan %
  floorWeight:  20,   // amaliy (floor) baho — menejer kuzatuvi. Baho bo'lmasa hisobga olinmaydi (dormant).
};

const LEVELS = {
  master:  { label: 'MASTER',        color: '#F39C12', emoji: '🏆' },
  pro:     { label: 'PRO',           color: '#3498DB', emoji: '⭐' },
  good:    { label: 'YAXSHI',        color: '#2ECC71', emoji: '✅' },
  warning: { label: 'OGOHLANTIRISH', color: '#E67E22', emoji: '⚠️' },
  penalty: { label: 'JAZO',          color: '#E74C3C', emoji: '🔴' },
  fail:    { label: 'NOMUVOFIQ',     color: '#9B59B6', emoji: '❌' },
  nodata:  { label: 'Test topshirilmagan', color: '#666666', emoji: '—' },
};

function levelFromScore(score, s) {
  if      (score >= s.masterMin)  return { level: 'master',  penalty: s.masterBonus    };
  else if (score >= s.proMin)     return { level: 'pro',     penalty: s.proBonus       };
  else if (score >= s.goodMin)    return { level: 'good',    penalty: s.goodBonus      };
  else if (score >= s.warningMin) return { level: 'warning', penalty: s.warningPenalty };
  else if (score >= s.penaltyMin) return { level: 'penalty', penalty: s.penaltyFine    };
  else                            return { level: 'fail',    penalty: s.penaltyFine    };
}

/**
 * Bitta ofitsiantning bir davrdagi KPI'sini hisoblaydi.
 *
 * @param {object}  inputs
 * @param {Array}   inputs.results    — shu ofitsiantning BARCHA test natijalari (davr ichida filtrlash shu yerda bo'ladi)
 * @param {?number} inputs.menuPct    — menyu o'rganilgan % (0-100). null = menyu yo'q, komponent hisobga olinmaydi
 * @param {?number} inputs.modulePct  — modul tugatilgan % (0-100). null = modul yo'q, komponent hisobga olinmaydi
 * @param {object}  cfg               — kpiSettings (KPI_DEFAULTS bilan birlashtiriladi)
 * @param {Date}    refDate           — qaysi davrga qarash (0 = joriy)
 */
function calcKPI({ results = [], menuPct = null, modulePct = null, floorPct = null } = {}, cfg = {}, refDate = new Date()) {
  const s           = { ...KPI_DEFAULTS, ...cfg };
  const days        = s.periodDays || 10;
  const todayKey    = getPeriodKey(refDate, days);
  const periodLabel = getPeriodLabel(refDate, days);
  const current     = results.filter(r => getPeriodKey(r.submittedAt || r.date, days) === todayKey);

  // GATE — davrda test yo'q bo'lsa, baholamaymiz
  if (!current.length) {
    const prev = [...results].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
    return {
      ...LEVELS.nodata, level: 'nodata',
      avg: null, testAvg: null,
      menuPct: menuPct, modulePct: modulePct, floorPct: floorPct,
      weights: pickWeights(s, menuPct, modulePct, floorPct),
      testCount: 0, penalty: 0, consecutiveLow: 0, periodLabel,
      lastScore: prev?.score ?? null,
    };
  }

  const testAvg = Math.round(current.reduce((sum, r) => sum + r.score, 0) / current.length);

  // ── Kompozit ball ──
  // Komponent mavjud bo'lmasa (menyu/modul/floor umuman yo'q) vazni tushib qoladi,
  // qolganlari qayta normallashtiriladi — bo'sh restoran xodimini jazolamaslik uchun.
  const parts = [{ val: testAvg, w: num(s.testWeight, 0) }];
  if (menuPct   != null) parts.push({ val: clampPct(menuPct),   w: num(s.menuWeight, 0)   });
  if (modulePct != null) parts.push({ val: clampPct(modulePct), w: num(s.moduleWeight, 0) });
  if (floorPct  != null) parts.push({ val: clampPct(floorPct),  w: num(s.floorWeight, 0)  });
  const used = parts.filter(p => p.w > 0);
  const wsum = used.reduce((a, p) => a + p.w, 0);
  // Hamma vazn 0 bo'lsa — sof test baliga qaytamiz
  const composite = wsum > 0
    ? Math.round(used.reduce((a, p) => a + p.val * p.w, 0) / wsum)
    : testAvg;

  const { level, penalty } = levelFromScore(composite, s);

  // consecutiveLow — o'tgan davrlarda test tendensiyasi (menyu/modul kümülativ
  // bo'lgani uchun tarixiy kompozit tiklab bo'lmaydi; bu faqat test trendi).
  const lastKeys = getLastPeriodKeys(6, days, refDate);
  const byPeriod = {};
  results.forEach(r => { const k = getPeriodKey(r.submittedAt || r.date, days); if (!byPeriod[k] || r.score > byPeriod[k]) byPeriod[k] = r.score; });
  let consecutiveLow = 0;
  for (const k of lastKeys) {
    if (byPeriod[k] !== undefined && byPeriod[k] < s.goodMin) consecutiveLow++;
    else if (byPeriod[k] !== undefined) break;
  }

  return {
    ...LEVELS[level], level,
    avg: composite,                 // KPI balli (darajani belgilaydi)
    testAvg,                        // faqat test o'rtachasi (taqsimot uchun)
    menuPct: menuPct,
    modulePct: modulePct,
    floorPct: floorPct,
    weights: pickWeights(s, menuPct, modulePct, floorPct),
    testCount: current.length,
    penalty, consecutiveLow, periodLabel,
  };
}

// Amalda ishlatilgan vaznlar (mavjud komponentlar bo'yicha) — UI taqsimotni ko'rsatishi uchun
function pickWeights(s, menuPct, modulePct, floorPct) {
  const w = { test: num(s.testWeight, 0) };
  if (menuPct   != null) w.menu   = num(s.menuWeight, 0);
  if (modulePct != null) w.module = num(s.moduleWeight, 0);
  if (floorPct  != null) w.floor  = num(s.floorWeight, 0);
  return w;
}

function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function clampPct(v) { return Math.max(0, Math.min(100, Math.round(Number(v) || 0))); }

module.exports = { KPI_DEFAULTS, calcKPI, levelFromScore, LEVELS };
