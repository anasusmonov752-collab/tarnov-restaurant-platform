// ── AI KONTENT GENERATORI ────────────────────────────────────
// Menyudan avtomatik test savollari yaratadi.
//
// NIMA UCHUN KERAK: yangi restoran ro'yxatdan o'tganda platforma bo'sh
// bo'ladi — admin qo'lda 20+ savol yozmaguncha test umuman ishlamaydi.
// Amalda hech kim bunga vaqt ajratmaydi va platforma tashlab ketiladi.
//
// MUHIM: yaratilgan savollar TO'G'RIDAN-TO'G'RI bazaga tushmaydi.
// AI noto'g'ri fakt yozishi mumkin (narx, allergen, tarkib), shuning uchun
// admin har savolni ko'rib, tasdiqlagani saqlanadi.

const ai = require('./ai');
const mentor = require('./mentor');

// Bitta so'rovda nechta savol — ko'p bo'lsa model sifatni pasaytiradi
// va javob token limitiga urilib, JSON yarim uzilib qoladi.
const MAX_PER_CALL = 12;
// Bitta so'rovga sig'adigan menyu elementi (token sarfini ushlab turadi)
const MAX_MENU_ITEMS = 30;

const SYSTEM_PROMPT = `Siz restoran xodimlarini o'qitish platformasi uchun test savollari tuzuvchisiz.
Sizga restoran MENYUSI beriladi. Faqat shu menyudagi ma'lumotga tayanib savol tuzasiz.

QAT'IY QOIDALAR:
- Faqat menyuda BERILGAN ma'lumotdan foydalaning. Narx, tarkib, allergen — hech qachon o'zingizdan to'qimang.
- Menyuda yo'q narsa haqida savol tuzmang.
- Savollar o'zbek tilida, aniq va qisqa bo'lsin.
- Har savol AMALIY bo'lsin — ofitsiant mehmon bilan ishlashda haqiqatan kerak bo'ladigan bilim.
- Berilgan MAVJUD SAVOLLAR ro'yxatidagilarni takrorlamang.

QIYINLIK DARAJALARI:
- easy   — bitta faktni bilish (qaysi bo'lim, narx, asosiy tarkib)
- medium — ikki ma'lumotni bog'lash (allergen + tavsiya, tarkib + parhez)
- hard   — mehmon bilan real vaziyat, mulohaza talab qiladi

SAVOL TURLARI:
- "choice"  — 4 ta variant, aynan bittasi to'g'ri. Chalg'ituvchi variantlar
  ishonarli bo'lsin (o'sha menyudagi boshqa taomlar/qiymatlar), lekin aniq xato.
- "written" — ofitsiant o'z so'zi bilan yozadi. Faqat "hard" va "medium" uchun,
  mulohaza talab qiladigan vaziyatlarda.

JAVOB — faqat JSON, boshqa hech narsa:
{"questions":[
 {"type":"choice","difficulty":"easy","dish":"Taom nomi","question":"...","options":["A","B","C","D"],"correctAnswer":0,"explanation":"Nega aynan shu javob to'g'ri"},
 {"type":"written","difficulty":"hard","dish":"Taom nomi","question":"...","rubric":"To'liq javobda nima bo'lishi kerak","keyPoints":["nuqta 1","nuqta 2","nuqta 3"]}
]}

"correctAnswer" — to'g'ri variantning INDEKSI (0 dan boshlanadi).
"dish" — savol qaysi taomga tegishli (menyudagi aniq nom). Umumiy savol bo'lsa bo'sh qoldiring.`;

/** Menyu elementini AI uchun matnga aylantiradi (faqat mavjud maydonlar). */
function menuItemText(m) {
  const parts = [`• ${m.name} (${m.category})`];
  if (m.price)                 parts.push(`narx: ${m.price} so'm`);
  if (m.description)           parts.push(`tavsif: ${m.description}`);
  if (m.ingredients?.length)   parts.push(`tarkib: ${m.ingredients.join(', ')}`);
  if (m.allergens?.length)     parts.push(`allergenlar: ${m.allergens.join(', ')}`);
  if (m.servingSuggestion)     parts.push(`tavsiya: ${m.servingSuggestion}`);
  return parts.join(' | ');
}

// ── Validatsiya ───────────────────────────────────────────────
// AI javobiga ISHONMAYMIZ. Har savol tekshiriladi, buzuqlari tashlanadi.

const DIFFS = ['easy', 'medium', 'hard'];

function normText(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Bitta savolni tekshiradi va tozalab qaytaradi.
 * @returns {object|null} yaroqsiz bo'lsa null
 */
function validateQuestion(q, menu, seen) {
  if (!q || typeof q !== 'object') return null;

  const question = String(q.question || '').trim();
  if (question.length < 8 || question.length > 400) return null;

  // Takrorlanish — mavjudlari va shu partiyadagilar bilan
  const key = normText(question);
  if (!key || seen.has(key)) return null;

  const difficulty = DIFFS.includes(q.difficulty) ? q.difficulty : 'easy';
  const type = q.type === 'written' ? 'written' : 'choice';

  const out = { question, difficulty, type, explanation: String(q.explanation || '').trim().slice(0, 500) };

  if (type === 'written') {
    out.rubric = String(q.rubric || '').trim().slice(0, 600);
    out.keyPoints = Array.isArray(q.keyPoints)
      ? q.keyPoints.map(s => String(s).trim()).filter(Boolean).slice(0, 6)
      : [];
    // Mezonsiz yozma savolni AI baholay olmaydi — bunday savol yaroqsiz
    if (!out.rubric && !out.keyPoints.length) return null;
    out.options = [];
  } else {
    const options = Array.isArray(q.options)
      ? q.options.map(o => String(o).trim()).filter(Boolean)
      : [];
    if (options.length < 2 || options.length > 6) return null;
    // Bir xil variantlar bo'lsa savol buzuq
    if (new Set(options.map(normText)).size !== options.length) return null;

    const ci = Number(q.correctAnswer);
    // AI ba'zan chegaradan tashqari indeks qaytaradi — bunday savol o'tmaydi
    if (!Number.isInteger(ci) || ci < 0 || ci >= options.length) return null;

    out.options = options;
    out.correctAnswer = ci;
  }

  // Taom nomini menyudagi haqiqiy elementga bog'laymiz
  if (q.dish) {
    const hit = menu.find(m => mentor.norm(m.name) === mentor.norm(q.dish))
             || mentor.matchMenuItem(String(q.dish), menu);
    if (hit) { out.menuItemId = hit.id; out.dishName = hit.name; }
  }
  if (!out.menuItemId) {
    // "dish" berilmagan bo'lsa savol matnidan topishga urinamiz
    const hit = mentor.matchMenuItem(question, menu);
    if (hit) { out.menuItemId = hit.id; out.dishName = hit.name; }
  }

  seen.add(key);
  return out;
}

// ── Generatsiya ───────────────────────────────────────────────

/**
 * Menyudan savollar yaratadi. Saqlamaydi — admin ko'rigi uchun qaytaradi.
 *
 * @param {object} o
 * @param {Array}  o.menu              — menyu elementlari
 * @param {Array}  o.existingQuestions — takrorlamaslik uchun
 * @param {number} o.count             — nechta savol kerak
 * @param {string} [o.category]        — faqat shu kategoriyadan
 * @param {boolean}[o.includeWritten]  — yozma savollar ham qo'shilsinmi
 * @param {string} [o.restaurantId]    — kvota hisobi uchun
 * @returns {Promise<{questions:Array, requested:number, dropped:number}>}
 */
async function generateQuestions({ menu, existingQuestions = [], count = 12, category, includeWritten = true, restaurantId }) {
  let pool = category ? menu.filter(m => m.category === category) : menu;
  if (!pool.length) {
    throw Object.assign(new Error(category ? `"${category}" bo'limida taom yo'q` : 'Menyu bo\'sh'), { code: 'NO_MENU' });
  }

  const want = Math.max(1, Math.min(60, count));
  const seen = new Set(existingQuestions.map(q => normText(q.question)));
  const collected = [];
  let dropped = 0;

  // Partiyalarga bo'lib so'raymiz: bitta so'rovda ko'p savol so'ralsa
  // model sifatni pasaytiradi va JSON token limitida uzilib qoladi.
  const batches = Math.ceil(want / MAX_PER_CALL);
  for (let b = 0; b < batches && collected.length < want; b++) {
    const need = Math.min(MAX_PER_CALL, want - collected.length);

    // Har partiyaga menyuning boshqa qismini beramiz — savollar bir joyda to'planmasin
    const slice = pool.length <= MAX_MENU_ITEMS
      ? pool
      : pool.slice((b * MAX_MENU_ITEMS) % pool.length).concat(pool).slice(0, MAX_MENU_ITEMS);

    const writtenCount = includeWritten ? Math.max(1, Math.round(need * 0.3)) : 0;
    const prompt = [
      `MENYU:`,
      slice.map(menuItemText).join('\n'),
      '',
      seen.size ? `MAVJUD SAVOLLAR (bularni TAKRORLAMANG):\n${[...seen].slice(0, 80).map(s => '- ' + s.slice(0, 60)).join('\n')}` : '',
      '',
      `VAZIFA: ${need} ta savol tuzing.`,
      `- ${need - writtenCount} tasi "choice" turida`,
      writtenCount ? `- ${writtenCount} tasi "written" turida (medium yoki hard)` : '',
      `- Qiyinlik: taxminan yarmi easy, choragi medium, choragi hard`
    ].filter(Boolean).join('\n');

    let parsed;
    try {
      parsed = await ai.complete({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        json: true,
        tier: 'smart',
        maxTokens: 400 * need + 500,
        restaurantId
      });
    } catch (err) {
      // Birinchi partiya ham ishlamasa — xato. Keyingilari ishlamasa
      // qo'lda yig'ilganini qaytaramiz (nol emas).
      if (!collected.length) throw err;
      console.warn('[generator] partiya', b + 1, 'ishlamadi:', err.message);
      break;
    }

    const rows = Array.isArray(parsed?.questions) ? parsed.questions : [];
    for (const row of rows) {
      if (collected.length >= want) break;
      const v = validateQuestion(row, menu, seen);
      if (v) collected.push(v); else dropped++;
    }
  }

  return { questions: collected, requested: want, dropped };
}

module.exports = { generateQuestions, validateQuestion, menuItemText, MAX_PER_CALL };
