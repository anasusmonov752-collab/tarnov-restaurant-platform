// ── MENTOR ───────────────────────────────────────────────────
// Ofitsiantning bilim profilini hisoblab, unga shaxsiy vazifa beradi.
//
// MUHIM: bu servis AI ISHLATMAYDI. Hammasi mavjud ma'lumotdan qoida
// asosida hisoblanadi — tez, bepul, bashorat qilinadigan. AI faqat
// yozma javob baholash va kontent generatsiyasida ishlatiladi.
//
// Ma'lumot manbalari (hammasi allaqachon bazada bor):
//   testResults[].breakdown[]  — har savol bo'yicha to'g'ri/xato
//   waiterMenuProgress         — o'rganilgan taomlar
//   moduleProgress             — tugatilgan modullar
//   waiterTrainingViews        — ko'rilgan videolar

// ── Savol ↔ menyu bog'lash ────────────────────────────────────
// Savollarning ko'pchiligida menuItemId bo'sh, lekin savol matnida
// taom nomi turadi ("Iskandar qaysi bo'limga kiradi?"). Shu orqali
// savolni menyuga, demak kategoriyaga bog'laymiz.

/** Solishtirish uchun normallashtirish: kichik harf, apostroflarni birxillashtirish. */
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** So'z chegarasida uchraydimi — "Osh" ni "Okroshka" ichidan topmaslik uchun. */
function containsWord(haystack, needle) {
  if (!needle || needle.length < 3) return false;   // juda qisqa nom ishonchsiz
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}'])${esc}($|[^\\p{L}\\p{N}'])`, 'u').test(haystack);
}

/**
 * Savolni menyu taomiga bog'laydi. Eng UZUN mos nom yutadi —
 * "Ko'za sho'rva" bor joyda "Sho'rva" ni tanlab qo'ymaslik uchun.
 * @returns {object|null} menyu elementi
 */
function matchMenuItem(questionText, menu) {
  const t = norm(questionText);
  let best = null;
  for (const m of menu) {
    const n = norm(m.name);
    if (containsWord(t, n) && (!best || n.length > norm(best.name).length)) best = m;
  }
  return best;
}

/**
 * Savollarga menuItemId ni to'ldiradi (faqat bo'sh bo'lganlarga).
 * Bazani o'zgartirmaydi — yangilanishi kerak bo'lgan juftliklarni qaytaradi.
 * @returns {Array<{questionId, menuItemId}>}
 */
function backfillLinks(questions, menu) {
  const out = [];
  for (const q of questions) {
    if (q.menuItemId) continue;
    const m = matchMenuItem(q.question, menu);
    if (m) out.push({ questionId: q.id, menuItemId: m.id });
  }
  return out;
}

// ── Bilim profili ─────────────────────────────────────────────

/** Yozma yoki variantli savolda olingan ball (0-1 oralig'ida). */
function pointsOf(b) {
  if (b.type === 'written') {
    const s = b.manualScore ?? b.aiScore;
    return s == null ? null : s / 100;
  }
  return b.isCorrect ? 1 : 0;
}

const LEVELS = [
  { key: 'boshlangich', label: 'Boshlang\'ich', min: 0  },
  { key: 'orta',        label: 'O\'rta',        min: 60 },
  { key: 'kuchli',      label: 'Kuchli',        min: 85 }
];

function levelOf(avg) {
  if (avg == null) return LEVELS[0];
  return [...LEVELS].reverse().find(l => avg >= l.min) || LEVELS[0];
}

/**
 * Ofitsiantning bilim profilini quradi.
 * @param {object} r        — Restaurant hujjati
 * @param {string} waiterId
 * @param {object} [opts]   — { lastN: nechta oxirgi testni hisobga olish }
 */
function buildProfile(r, waiterId, opts = {}) {
  const lastN = opts.lastN || 5;

  const results = (r.testResults || [])
    .filter(t => t.waiterId === waiterId)
    .sort((a, b) => new Date(b.submittedAt || b.date) - new Date(a.submittedAt || a.date));

  const recent = results.slice(0, lastN);
  const avg = recent.length
    ? Math.round(recent.reduce((s, t) => s + (t.score || 0), 0) / recent.length)
    : null;

  // Trend: oxirgi test oldingilarning o'rtachasidan qanchaga farq qiladi
  let trend = null;
  if (results.length >= 2) {
    const prev = results.slice(1, lastN + 1);
    const prevAvg = prev.reduce((s, t) => s + (t.score || 0), 0) / prev.length;
    trend = Math.round((results[0].score || 0) - prevAvg);
  }

  // Qiyinlik kesimi va takroriy xatolar
  const byDiff = { easy: [0, 0], medium: [0, 0], hard: [0, 0] };
  const mistakes = new Map();   // questionId -> { wrong, total, question }
  const catStats = new Map();   // category  -> [earned, count]

  const qById = new Map((r.questions || []).map(q => [q.id, q]));
  const menuById = new Map((r.menu || []).map(m => [m.id, m]));

  for (const t of recent) {
    for (const b of (t.breakdown || [])) {
      const p = pointsOf(b);
      if (p == null) continue;                       // hali baholanmagan yozma javob

      const d = byDiff[b.difficulty];
      if (d) { d[0] += p; d[1] += 1; }

      const rec = mistakes.get(b.questionId) || { wrong: 0, total: 0, question: b.question, difficulty: b.difficulty };
      rec.total += 1;
      if (p < 0.6) rec.wrong += 1;                   // 60% dan past = xato hisoblanadi
      mistakes.set(b.questionId, rec);

      // Kategoriya: savol -> menyu taomi -> kategoriya
      const q = qById.get(b.questionId);
      const mi = q?.menuItemId ? menuById.get(q.menuItemId) : null;
      const cat = mi?.category;
      if (cat) {
        const c = catStats.get(cat) || [0, 0];
        c[0] += p; c[1] += 1;
        catStats.set(cat, c);
      }
    }
  }

  const pct = ([earned, total]) => total ? Math.round((earned / total) * 100) : null;

  const weakCategories = [...catStats.entries()]
    .map(([category, v]) => ({ category, score: pct(v), asked: v[1] }))
    .filter(c => c.asked >= 2 && c.score < 70)       // 1 ta savoldan xulosa chiqarmaymiz
    .sort((a, b) => a.score - b.score);

  // Savol bazasi vaqt o'tishi bilan qayta quriladi — eski natijalardagi
  // questionId lar endi mavjud bo'lmasligi mumkin. O'chirilgan savolni
  // sanash ham, mashqqa berish ham noto'g'ri: "5 ta savolda xato qilyapsiz"
  // deb yozib, mashqda 1 tasini ko'rsatishga olib keladi.
  const repeatedMistakes = [...mistakes.entries()]
    .filter(([qid, v]) => v.wrong >= 2 && qById.has(qid))   // kamida 2 marta xato VA savol hali mavjud
    .map(([questionId, v]) => ({ questionId, ...v }))
    .sort((a, b) => b.wrong - a.wrong);

  // Menyu qamrovi
  const prog = (r.waiterMenuProgress || []).find(p => p.waiterId === waiterId);
  const known = (prog?.knownDishIds || []).length;
  const menuTotal = (r.menu || []).length;

  // Modullar
  const mods = (r.moduleProgress || []).filter(p => p.waiterId === waiterId);
  const modulesDone = mods.filter(p => p.completed).length;

  return {
    tests: { count: results.length, avg, trend, lastScore: results[0]?.score ?? null },
    level: levelOf(avg),
    byDifficulty: {
      easy:   { score: pct(byDiff.easy),   asked: byDiff.easy[1]   },
      medium: { score: pct(byDiff.medium), asked: byDiff.medium[1] },
      hard:   { score: pct(byDiff.hard),   asked: byDiff.hard[1]   }
    },
    weakCategories,
    repeatedMistakes,
    menu: { known, total: menuTotal, pct: menuTotal ? Math.round(known / menuTotal * 100) : 0 },
    modules: { done: modulesDone, total: (r.modules || []).length }
  };
}

// ── Kunlik vazifalar ──────────────────────────────────────────
// Profildagi eng zaif nuqtalardan 3 ta aniq vazifa tuziladi.
// Har vazifa "nima qilish kerak" va "qayerga bosish kerak" ni aytadi.
//
// TARTIB MUHIM: eng aniq signal tepada turadi. Umumiy maslahat
// (menyu qamrovi kabi) pastda — aks holda u har kuni birinchi
// bo'lib chiqaveradi va ofitsiant vazifalarga e'tibor bermay qo'yadi.

const MAX_TASKS = 3;

function dailyTasks(profile, r, waiterId) {
  const tasks = [];

  // 0) Natija keskin tushgan — bu eng shoshilinch signal
  if (profile.tests.trend !== null && profile.tests.trend <= -15 && profile.tests.count >= 2) {
    tasks.push({
      id: 'decline',
      icon: '📉',
      title: `Natijangiz ${Math.abs(profile.tests.trend)} ballga tushdi`,
      detail: `Oxirgi test: ${profile.tests.lastScore}%. Avvalgilardan past — nimadir e'tibordan chetda qolyapti.`,
      action: { screen: 'history' },
      cta: 'Xatolarni ko\'rish'
    });
  }

  // 1) Takroriy xatolar — eng aniq va eng foydali signal
  if (profile.repeatedMistakes.length) {
    const top = profile.repeatedMistakes.slice(0, 5);
    tasks.push({
      id: 'retry',
      icon: '🎯',
      title: `${top.length} ta savolda qayta-qayta xato qilyapsiz`,
      detail: top[0].question.slice(0, 70) + (top[0].question.length > 70 ? '…' : ''),
      action: { screen: 'practice', questionIds: top.map(t => t.questionId) },
      cta: 'Mashq qilish'
    });
  }

  // 2) Zaif kategoriya — o'sha bo'limdagi taomlarni o'rganish
  if (profile.weakCategories.length) {
    const w = profile.weakCategories[0];
    const count = (r.menu || []).filter(m => m.category === w.category).length;
    tasks.push({
      id: 'category',
      icon: '📖',
      title: `"${w.category}" bo'limi sizga qiyin kelyapti`,
      detail: `Bu bo'limda ${w.score}% ball to'pladingiz. ${count} ta taomni ko'rib chiqing.`,
      action: { screen: 'menu', category: w.category },
      cta: 'Menyuni ochish'
    });
  }

  // 3) Qiyin savollar zaif bo'lsa — bu bonusga to'g'ridan-to'g'ri ta'sir qiladi
  const hard = profile.byDifficulty.hard;
  if (hard.asked >= 3 && hard.score !== null && hard.score < 50) {
    tasks.push({
      id: 'hard',
      icon: '⚡',
      title: `Qiyin savollarda ${hard.score}% ball`,
      detail: 'Aynan shu daraja bonusni belgilaydi. Standartlar bo\'limini ko\'rib chiqing.',
      action: { screen: 'training' },
      cta: 'Standartlarni ko\'rish'
    });
  }

  // 4) Tugatilmagan modul
  if (profile.modules.total > profile.modules.done) {
    const done = new Set((r.moduleProgress || [])
      .filter(p => p.waiterId === waiterId && p.completed).map(p => p.moduleId));
    const next = (r.modules || []).find(m => !done.has(m.id));
    if (next) {
      tasks.push({
        id: 'module',
        icon: '🎓',
        title: `"${next.title}" moduli tugallanmagan`,
        detail: `${(next.lessons || []).length} ta dars. Bugun boshlang.`,
        action: { screen: 'module', moduleId: next.id },
        cta: 'Darsni ochish'
      });
    }
  }

  // 5) Menyu qamrovi — eng umumiy maslahat, shuning uchun oxirida.
  //    Hali boshlamagan bo'lsa "0%" deb yozmaymiz — bu ayblovdek eshitiladi.
  if (profile.menu.total && profile.menu.pct < 70) {
    const started = profile.menu.known > 0;
    const left = profile.menu.total - profile.menu.known;
    tasks.push({
      id: 'menu',
      icon: '🍽',
      title: started
        ? `Menyuning ${profile.menu.pct}% ini o'rgandingiz`
        : 'Menyuni yodlashni boshlang',
      detail: started
        ? `Yana ${left} ta taom qoldi. Bugun 5 tasini yodlang.`
        : `${profile.menu.total} ta taom bor. Har kuni 5 tadan boshlasangiz, bir oyda tugatasiz.`,
      action: { screen: 'menu' },
      cta: started ? 'Davom ettirish' : 'Boshlash'
    });
  }

  // Hech narsa topilmadi — hammasi joyida
  if (!tasks.length) {
    tasks.push({
      id: 'ok',
      icon: '🏆',
      title: 'Zaif nuqta topilmadi',
      detail: profile.tests.count
        ? 'Natijalaringiz barqaror. Menyudagi yangi taomlarni ko\'rib turing.'
        : 'Hali test topshirmadingiz — birinchi testdan keyin shaxsiy vazifa olasiz.',
      action: { screen: 'menu' },
      cta: 'Menyuni ochish'
    });
  }

  return tasks.slice(0, MAX_TASKS);
}

// ── Adaptiv test ──────────────────────────────────────────────
// Bilim darajasiga qarab qiyinlik nisbati o'zgaradi: kuchsizga ko'proq
// oson savol (ruhini ko'tarish + poydevorni mustahkamlash), kuchliga
// ko'proq qiyin savol (o'sish uchun).

const MIX = {
  boshlangich: { easy: 14, medium: 4, hard: 2  },
  orta:        { easy: 10, medium: 5, hard: 5  },
  kuchli:      { easy: 5,  medium: 7, hard: 8  }
};

function mixFor(levelKey) { return MIX[levelKey] || MIX.orta; }

/**
 * Testga savol tanlaydi.
 * Oldin xato qilingan savollar ustuvor (spaced repetition) — shunda test
 * "imtihon" emas, "o'rgatuvchi" bo'ladi.
 *
 * @param {Array}  questions — restoran savollari
 * @param {object} profile   — buildProfile natijasi
 * @param {Function} shuffle
 */
function pickQuestions(questions, profile, shuffle) {
  const mix = mixFor(profile.level.key);
  const wrongIds = new Set(profile.repeatedMistakes.map(m => m.questionId));

  const picked = [];
  for (const diff of ['easy', 'medium', 'hard']) {
    const pool = questions.filter(q => q.difficulty === diff);
    // Xato qilinganlar oldinga, qolganlari aralashtiriladi
    const priority = shuffle(pool.filter(q => wrongIds.has(q.id)));
    const rest     = shuffle(pool.filter(q => !wrongIds.has(q.id)));
    picked.push(...[...priority, ...rest].slice(0, mix[diff]));
  }
  return shuffle(picked);
}

/** Tanlangan miks uchun yetarli savol bormi — start oldidan tekshirish. */
function checkPool(questions, levelKey) {
  const mix = mixFor(levelKey);
  const have = {
    easy:   questions.filter(q => q.difficulty === 'easy').length,
    medium: questions.filter(q => q.difficulty === 'medium').length,
    hard:   questions.filter(q => q.difficulty === 'hard').length
  };
  const missing = Object.entries(mix).filter(([d, n]) => have[d] < n);
  return { ok: !missing.length, mix, have, missing: Object.fromEntries(missing) };
}

module.exports = {
  buildProfile, dailyTasks, pickQuestions, checkPool, mixFor,
  matchMenuItem, backfillLinks, norm, containsWord, LEVELS, MIX
};
