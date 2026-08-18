// ── MURABBIY TOPSHIRIQLARI ───────────────────────────────────
// Mentor topshiriq beradi → muddat qo'yadi → muddat kelganda O'ZI tekshiradi
// → bajarilmagan bo'lsa hisob so'raydi.
//
// Bu modul AI ISHLATMAYDI. Tekshirish uchun kerak bo'lgan hamma dalil
// allaqachon bazada: o'rganilgan taomlar, test ballari.
//
// ENG MUHIM QOIDA — BASELINE. Topshiriq berilgan paytdagi holat yozib
// qo'yiladi. Busiz "yana 8 ta taom o'rganing" degan topshiriqni allaqachon
// 100 ta taom biladigan ofitsiant qimirlamasdan "bajargan" bo'lib chiqardi.

const MentorAssignment = require('../models/MentorAssignment');

// Muddat: oddiy topshiriq ertaga kun oxirigacha, test balli esa keyingi
// test kunigacha yetishi kerak.
const DUE_DAYS = { menuCount: 1, categoryDishes: 1, manual: 1, testScore: 7 };

// Bajarilmagan topshiriq qancha vaqt mentorning esida turadi
const ASK_DAYS  = 3;    // shuncha kun gapiradi
const TONE_DAYS = 14;   // shuncha kun qattiqroq turadi

/** Bugundan N kun keyingi kun oxiri (UTC — loyihaning qolgan sanalari ham UTC). */
function dueIn(days) {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// ── O'LCHASH ──────────────────────────────────────────────────

/** Ofitsiant hozir nechta taom biladi. */
function knownDishes(r, waiterId) {
  const prog = (r.waiterMenuProgress || []).find(p => p.waiterId === waiterId);
  return prog?.knownDishIds || [];
}

/**
 * Topshiriq bo'yicha HOZIRGI ko'rsatkich.
 * @returns {number}
 */
function measure(a, r, waiterId) {
  switch (a.check.type) {
    case 'menuCount':
      return knownDishes(r, waiterId).length;

    case 'categoryDishes': {
      const known = new Set(knownDishes(r, waiterId));
      return (r.menu || []).filter(m => m.category === a.check.category && known.has(m.id)).length;
    }

    case 'testScore': {
      // Faqat topshiriq BERILGANDAN KEYINGI testlar hisoblanadi — aks holda
      // eski yaxshi natija yangi topshiriqni yopib qo'yardi.
      const after = (r.testResults || []).filter(t =>
        t.waiterId === waiterId && new Date(t.submittedAt || t.date) > new Date(a.createdAt));
      return after.length ? Math.max(...after.map(t => t.score || 0)) : 0;
    }

    default:
      return 0;   // manual — faqat ofitsiant tasdig'i bilan yopiladi
  }
}

/** Topshiriq boshlangandan beri qancha yurildi (test balli uchun — ballning o'zi). */
function progressOf(a, r, waiterId) {
  const cur = measure(a, r, waiterId);
  return a.check.type === 'testScore' ? cur : cur - (a.check.baseline || 0);
}

function isDone(a, r, waiterId) {
  if (a.check.type === 'manual') return false;   // faqat qo'lda tasdiqlanadi
  return progressOf(a, r, waiterId) >= a.check.target;
}

// ── YARATISH ──────────────────────────────────────────────────

/**
 * Topshiriq yaratadi. Baseline SHU YERDA o'lchanadi — chaqiruvchi emas,
 * modul o'zi hisoblaydi, shunda uni unutib qo'yish mumkin emas.
 */
async function create({ restaurantId, waiterId, title, detail, check }, r) {
  const draft = { check: { ...check, baseline: 0 }, createdAt: new Date() };
  if (check.type === 'menuCount' || check.type === 'categoryDishes') {
    draft.check.baseline = measure(draft, r, waiterId);
  }

  return MentorAssignment.create({
    restaurantId, waiterId, title, detail,
    check: draft.check,
    dueAt: dueIn(DUE_DAYS[check.type] ?? 1)
  });
}

/**
 * Test natijasidan tekshirib bo'ladigan topshiriq tanlaydi.
 *
 * MUHIM: bu talab mentor hukmiga ham beriladi, shunda AI aynan SHU narsani
 * o'z so'zi bilan aytadi. Aks holda mentor bir narsa deb, tizim boshqa
 * narsani tekshirib yurardi.
 *
 * @returns {object|null} { title, detail, check }
 */
function proposeFromTest(result, profile, r) {
  // 1. Zaif bo'lim — eng aniq signal
  const weak = profile.weakCategories?.[0];
  if (weak) {
    // waiterId profilda yo'q — u testResult ichida turadi
    const known = new Set(knownDishes(r, result.waiterId));
    const left = (r.menu || []).filter(m => m.category === weak.category && !known.has(m.id)).length;
    const target = Math.min(5, left);
    if (target > 0) {
      return {
        title: `"${weak.category}" bo'limidan ${target} ta taomni o'rganish`,
        detail: `Bu bo'limda ${weak.score}% ball to'pladingiz — eng zaif joyingiz.`,
        due: 'ertaga kun oxirigacha',
        check: { type: 'categoryDishes', target, category: weak.category }
      };
    }
  }

  // 2. Menyu qamrovi
  const left = (profile.menu?.total || 0) - (profile.menu?.known || 0);
  if (left > 0 && profile.menu.pct < 90) {
    const target = Math.min(5, left);
    return {
      title: `Menyudan ${target} ta yangi taomni yodlash`,
      detail: `Menyuning ${profile.menu.pct}% ini bilasiz — yana ${left} ta taom qoldi.`,
      due: 'ertaga kun oxirigacha',
      check: { type: 'menuCount', target }
    };
  }

  // 3. Menyu tugagan — endi daraja ushlab turiladi
  const bar = Math.max(80, Math.min(100, (result.score || 0) + 5));
  return {
    title: `Keyingi testda kamida ${bar}% olish`,
    detail: 'Menyuni bilasiz. Endi gap barqarorlikda.',
    due: 'keyingi testgacha',
    check: { type: 'testScore', target: bar }
  };
}

// ── TEKSHIRISH ────────────────────────────────────────────────

/**
 * Faol topshiriqlarni ko'rib chiqadi: bajarilganini yopadi, muddati
 * o'tganini "missed" qiladi.
 *
 * @returns {{active: Array, justDone: Array, toAsk: Array, overdueCount: number}}
 *   toAsk — bajarilmagan va mentor hali hisob so'ramagan topshiriqlar
 */
async function review(restaurantId, waiterId, r) {
  const list = await MentorAssignment.find({ restaurantId, waiterId, status: 'active' });
  const now = new Date();
  const out = { active: [], justDone: [], toAsk: [] };

  for (const a of list) {
    const progress = progressOf(a, r, waiterId);

    if (isDone(a, r, waiterId)) {
      a.status = 'done'; a.resolvedAt = now; a.progressAt = progress;
      await a.save();
      out.justDone.push(a);
      continue;
    }

    if (a.dueAt <= now) {
      a.status = 'missed'; a.resolvedAt = now; a.progressAt = progress;
      a.askedAt = now;                 // mentor bu haqda BIR MARTA so'raydi
      await a.save();
      out.toAsk.push(a);
      continue;
    }

    // Hali muddati kelmagan — progressni bazaga yozmaymiz, faqat ko'rsatamiz.
    // Har bosh ekran ochilishida yozuv qilish bekorga yuk.
    out.active.push({ doc: a, progress });
  }

  // Yaqinda bajarilmay qolganlar mentorning qattiqligini belgilaydi
  const overdueCount = await MentorAssignment.countDocuments({
    restaurantId, waiterId, status: 'missed',
    resolvedAt: { $gte: new Date(Date.now() - TONE_DAYS * 24 * 3600 * 1000) }
  });

  return { ...out, overdueCount };
}

/**
 * O'ZGARTIRMASDAN o'qish — suhbat uchun.
 *
 * Chatda review() chaqirsak, topshiriq "so'raldi" deb belgilanib qolardi va
 * bosh ekran uni boshqa ko'rsatmasdi. Holatni faqat bosh ekran o'zgartiradi.
 */
async function snapshot(restaurantId, waiterId, r) {
  // Ikki xil oyna, ataylab:
  //   ASK_DAYS   — mentor bu haqda gapiradi. Qisqa: bir topshiriqni ikki hafta
  //                eslatib yurish murabbiylik emas, janjal.
  //   TONE_DAYS  — qattiqlik darajasiga ta'sir qiladi. Uzunroq: ishonch
  //                bir kunda qaytmaydi, lekin mentor eski gapni qavramaydi.
  const askSince  = new Date(Date.now() - ASK_DAYS  * 24 * 3600 * 1000);
  const toneSince = new Date(Date.now() - TONE_DAYS * 24 * 3600 * 1000);

  const [active, toAsk, overdueCount] = await Promise.all([
    MentorAssignment.find({ restaurantId, waiterId, status: 'active' }),
    MentorAssignment.find({ restaurantId, waiterId, status: 'missed', resolvedAt: { $gte: askSince } }),
    MentorAssignment.countDocuments({ restaurantId, waiterId, status: 'missed', resolvedAt: { $gte: toneSince } })
  ]);

  return {
    active: active.map(doc => ({ doc, progress: progressOf(doc, r, waiterId) })),
    toAsk,
    overdueCount
  };
}

/** Ofitsiant qo'lda tasdiqlaydigan topshiriqni yopadi. */
async function confirmManual(id, restaurantId, waiterId) {
  return MentorAssignment.findOneAndUpdate(
    { _id: id, restaurantId, waiterId, status: 'active', 'check.type': 'manual' },
    { $set: { status: 'done', resolvedAt: new Date() } },
    { new: true }
  );
}

/** Shu ofitsiantda ayni turdagi faol topshiriq bormi — takrorlab bermaslik uchun. */
async function hasActive(restaurantId, waiterId, type) {
  const q = { restaurantId, waiterId, status: 'active' };
  if (type) q['check.type'] = type;
  return (await MentorAssignment.countDocuments(q)) > 0;
}

/** Mentor kontekstiga tushadigan matn — u o'z topshiriqlarini eslashi uchun. */
function contextBlock({ active, toAsk, overdueCount }) {
  const lines = [];

  if (toAsk?.length) {
    lines.push('BAJARILMAGAN TOPSHIRIQLAR (muddati o\'tdi — hisob so\'rang):');
    toAsk.forEach(a => lines.push(`• "${a.title}" — ${a.progressAt}/${a.check.target} bajarildi`));
  }
  if (active?.length) {
    lines.push('Faol topshiriqlar:');
    active.forEach(x => lines.push(`• "${x.doc.title}" — hozircha ${x.progress}/${x.doc.check.target}`));
  }
  if (overdueCount) lines.push(`Oxirgi ${TONE_DAYS} kunda ${overdueCount} ta topshiriqni bajarmagan.`);

  return lines.join('\n');
}

module.exports = {
  create, proposeFromTest, review, snapshot, confirmManual, hasActive,
  measure, progressOf, isDone, contextBlock, dueIn, DUE_DAYS, ASK_DAYS, TONE_DAYS
};
