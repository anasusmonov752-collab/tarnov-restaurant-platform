// ── AI KVOTA MENEJERI ────────────────────────────────────────
// Gemini bepul tarifida ikkita mustaqil devor bor:
//
//   1. RPD — so'rov/kun.     Flash ~500, Flash-Lite ~1500
//   2. RPM — so'rov/daqiqa.  Flash ~10,  Flash-Lite ~15
//
// RPD MongoDB'da hisoblanadi (server qayta ishga tushsa ham saqlanadi),
// RPM esa xotirada navbat orqali ushlab turiladi.
//
// DIQQAT: RPM navbati bitta protsess xotirasida. Render'da bir nechta
// instansiya ishlasa, har biri o'z navbatini yuritadi va umumiy RPM oshib
// ketadi. Hozir bitta instansiya — muammo yo'q; masshtablashda Redis kerak.

const AiUsage = require('../models/AiUsage');

// Limitlar env orqali sozlanadi — Google raqamlarni o'zgartirsa kodga tegmaymiz.
// Aniq raqamlarni AI Studio panelidan tekshiring: aistudio.google.com/rate-limit
// Bu yerdagilar — ehtiyotkor taxmin. Google 429 qaytarsa, pasaytiring.
const LIMITS = {
  'gemini-3.5-flash':      { rpd: +(process.env.GEMINI_FLASH_RPD || 250),  rpm: +(process.env.GEMINI_FLASH_RPM || 10) },
  'gemini-3.5-flash-lite': { rpd: +(process.env.GEMINI_LITE_RPD  || 1000), rpm: +(process.env.GEMINI_LITE_RPM  || 15) },
  // Anthropic pullik — kunlik cheklov qo'ymaymiz, faqat RPM ehtiyotkorligi
  'claude-haiku-4-5-20251001': { rpd: Infinity, rpm: 50 }
};

// Ro'yxatda yo'q model uchun cheklovsiz o'tkazamiz (Google o'zi 429 beradi).
function limitsFor(model) { return LIMITS[model] || null; }

// Google kvotalari Tinch okeani yarim tunida yangilanadi.
// Boshqa zona kerak bo'lsa QUOTA_RESET_TZ bilan almashtiriladi.
const RESET_TZ = process.env.QUOTA_RESET_TZ || 'America/Los_Angeles';

/** Kvota sanasi — reset zonasidagi 'YYYY-MM-DD'. */
function quotaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RESET_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

// ── RPM navbati ───────────────────────────────────────────────
// Model bo'yicha alohida navbat: chaqiruvlar minimal interval bilan ketma-ket o'tadi.
const queues = new Map();

function rpmQueue(model) {
  if (!queues.has(model)) {
    queues.set(model, { chain: Promise.resolve(), lastRun: 0 });
  }
  return queues.get(model);
}

/**
 * Chaqiruvni RPM limitiga bo'ysundirib navbatga qo'yadi.
 * Ketma-ket chaqiruvlar orasida kamida (60000 / rpm) ms bo'ladi.
 */
function throttle(model, fn) {
  const limit = LIMITS[model];
  const minGap = limit ? Math.ceil(60000 / limit.rpm) : 0;
  const q = rpmQueue(model);

  // Navbat zanjiriga ulaymiz — oldingi chaqiruv tugamaguncha keyingisi boshlanmaydi.
  const result = q.chain.then(async () => {
    const wait = Math.max(0, q.lastRun + minGap - Date.now());
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    q.lastRun = Date.now();
    return fn();
  });

  // Zanjir xato tufayli uzilmasligi kerak — keyingi chaqiruvlar baribir o'tsin.
  q.chain = result.then(() => {}, () => {});
  return result;
}

// ── RPD hisobi ────────────────────────────────────────────────

// Kvota o'qishi AI chaqiruvini ushlab turmasligi kerak. Baza ulanmagan bo'lsa
// mongoose 10 soniya buferlaydi — har AI so'roviga 10s qo'shilardi.
const QUOTA_READ_TIMEOUT_MS = +(process.env.QUOTA_READ_TIMEOUT_MS || 1500);

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label + ' ' + ms + 'ms ichida javob bermadi')), ms); })
  ]);
}

/** Bugun shu model bo'yicha nechta so'rov ishlatilgan. */
async function used(model) {
  const doc = await withTimeout(
    AiUsage.findOne({ date: quotaDate(), model }, 'count').lean().exec(),
    QUOTA_READ_TIMEOUT_MS,
    'kvota so\'rovi'
  );
  return doc?.count || 0;
}

/** Kunlik kvota holati — admin paneli va oldindan tekshirish uchun. */
async function status(model) {
  const limit = LIMITS[model]?.rpd ?? Infinity;
  const spent = await used(model);
  return {
    model,
    used: spent,
    limit: limit === Infinity ? null : limit,
    remaining: limit === Infinity ? null : Math.max(0, limit - spent),
    exhausted: spent >= limit
  };
}

/** Barcha modellar bo'yicha holat. */
async function statusAll() {
  return Promise.all(Object.keys(LIMITS).map(status));
}

/** Sarfni atomik yozadi (so'rov muvaffaqiyatli ketganidan keyin chaqiriladi). */
async function record(model, restaurantId) {
  const inc = { count: 1 };
  if (restaurantId) inc[`byRestaurant.${restaurantId}`] = 1;
  await AiUsage.updateOne(
    { date: quotaDate(), model },
    { $inc: inc, $set: { updatedAt: new Date() } },
    { upsert: true }
  );
}

/**
 * Kvota va RPM'ni hisobga olib AI chaqiruvini bajaradi.
 *
 * @param {string}   model         — LIMITS dagi model nomi
 * @param {Function} fn            — asl AI chaqiruvi
 * @param {string}  [restaurantId] — sarfni restoran kesimida yozish uchun
 * @throws {Error}  code='QUOTA_EXHAUSTED' — kunlik limit tugagan
 */
async function run(model, fn, restaurantId) {
  const limit = LIMITS[model]?.rpd ?? Infinity;

  if (limit !== Infinity) {
    let spent = null;
    try {
      spent = await used(model);
    } catch (err) {
      // Baza javob bermadi. AI'ni bloklamaymiz — o'z hisobimizni yo'qotamiz,
      // lekin haqiqiy limitni baribir Google o'zi qo'llaydi (429 qaytaradi).
      console.warn('[aiQuota] kvotani o\'qib bo\'lmadi, so\'rov o\'tkazildi:', err.message);
    }
    if (spent !== null && spent >= limit) {
      throw Object.assign(
        new Error(`Kunlik AI kvotasi tugadi (${model}: ${spent}/${limit})`),
        { code: 'QUOTA_EXHAUSTED', model, used: spent, limit }
      );
    }
  }

  const result = await throttle(model, fn);
  // Sarfni faqat muvaffaqiyatdan keyin yozamiz — xato bo'lgan so'rov kvotani yemaydi.
  // (Xato 429 bo'lsa Google baribir hisoblagan bo'lishi mumkin — kichik farq, xavfsiz tomonga.)
  // KUTMAYMIZ: bu shunchaki hisob-kitob, foydalanuvchini ushlab turishi kerak emas.
  record(model, restaurantId).catch(err =>
    console.warn('[aiQuota] sarfni yozib bo\'lmadi:', err.message)
  );
  return result;
}

module.exports = { run, status, statusAll, used, quotaDate, LIMITS };
