// ── MENTOR SUHBAT XOTIRASI ───────────────────────────────────
// Mentor barcha yozishmalarni eslab qoladi va shunga tayanib javob beradi.
//
// MUAMMO: butun tarixni har so'rovda AI'ga yuborib bo'lmaydi — token
// limitiga uriladi va bepul kvotani tez yeydi. 100 ta xabardan keyin
// har savol 10-15k token turadi.
//
// YECHIM — ikki qatlamli xotira:
//   1. Oxirgi RECENT_WINDOW ta xabar — AYNAN o'z holicha yuboriladi
//   2. Undan eskilari — qisqacha mazmunga (summary) siqiladi va system
//      prompt'ga qo'shiladi. Summary faqat yangi eski xabarlar to'planganda
//      qayta yoziladi, har so'rovda emas.
//
// Natijada suhbat 500 ta xabarga yetganda ham kontekst hajmi barqaror qoladi,
// lekin mentor boshida nima gaplashilganini unutmaydi.

const MentorChat = require('../models/MentorChat');
const ai = require('./ai');

// AI'ga o'z holicha yuboriladigan oxirgi xabarlar soni (juft son — savol/javob juftligi)
const RECENT_WINDOW = 12;
// Shuncha eski xabar to'planganda summary qayta yoziladi
const SUMMARIZE_EVERY = 10;
// Bazada saqlanadigan maksimal xabar (eskilari summary'da qolgani uchun o'chiriladi)
const MAX_STORED = 400;
// Bitta xabar uzunligi chegarasi
const MAX_MESSAGE_LEN = 2000;

const SUMMARY_PROMPT = `Siz suhbat arxivchisisiz. Quyida restoran ofitsianti va uning
murabbiysi o'rtasidagi suhbat berilgan. Uni QISQACHA MAZMUNGA siqing.

Nima saqlanishi kerak:
- Ofitsiant qaysi mavzularda savol bergani va qaysilari unga qiyin kelgani
- Murabbiy bergan asosiy maslahatlar va topshiriqlar
- Ofitsiant o'zi haqida aytgan faktlar (tajribasi, qiyinchiliklari, maqsadlari)
- Bajarilgan yoki bajarilmagan kelishuvlar

Nima tashlanadi: salomlashish, takrorlar, umumiy gaplar.

Javob: O'zbek tilida, 150 so'zdan oshmasin, oddiy matn (ro'yxat emas).
Faqat mazmunni yozing, hech qanday kirish so'zisiz.`;

/** Ofitsiantning suhbat yozuvini oladi (bo'lmasa yaratmaydi). */
async function load(restaurantId, waiterId) {
  return MentorChat.findOne({ restaurantId, waiterId });
}

/** Suhbat tarixi — oyna ochilganda ko'rsatish uchun. */
async function history(restaurantId, waiterId, limit = 100) {
  const doc = await MentorChat.findOne({ restaurantId, waiterId }, 'messages').lean();
  const msgs = doc?.messages || [];
  return msgs.slice(-limit).map(m => ({ role: m.role, content: m.content, at: m.at }));
}

/**
 * AI'ga yuboriladigan kontekstni tayyorlaydi.
 * @returns {{recent: Array, summary: string, total: number}}
 */
function buildContext(doc) {
  const msgs = doc?.messages || [];
  return {
    recent: msgs.slice(-RECENT_WINDOW).map(m => ({ role: m.role, content: m.content })),
    summary: doc?.summary || '',
    total: msgs.length
  };
}

/** Xabar qo'shadi (yaratilmagan bo'lsa yozuvni ochadi). */
async function append(restaurantId, waiterId, role, content) {
  const text = String(content || '').slice(0, MAX_MESSAGE_LEN);
  await MentorChat.updateOne(
    { restaurantId, waiterId },
    {
      $push: { messages: { role, content: text, at: new Date() } },
      $set: { updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
}

/**
 * Kerak bo'lsa qisqacha mazmunni yangilaydi.
 * Oxirgi RECENT_WINDOW dan tashqarida SUMMARIZE_EVERY dan ko'p yangi xabar
 * to'planganda ishlaydi — ya'ni har so'rovda emas, ~10 xabarda bir marta.
 *
 * Xato bo'lsa jim o'tadi: summary yangilanmasa ham suhbat ishlashda davom etadi.
 */
async function maybeSummarize(restaurantId, waiterId) {
  const doc = await MentorChat.findOne({ restaurantId, waiterId });
  if (!doc) return;

  const msgs = doc.messages || [];
  // Oxirgi oyna tegilmaydi — u baribir to'liq yuboriladi
  const olderCount = Math.max(0, msgs.length - RECENT_WINDOW);
  const unsummarized = olderCount - (doc.summarizedUpTo || 0);
  if (unsummarized < SUMMARIZE_EVERY) return;

  const toSummarize = msgs.slice(0, olderCount);
  const transcript = toSummarize
    .map(m => `${m.role === 'user' ? 'Ofitsiant' : 'Murabbiy'}: ${m.content}`)
    .join('\n');

  try {
    const summary = await ai.complete({
      system: SUMMARY_PROMPT,
      messages: [{
        role: 'user',
        content: (doc.summary ? `AVVALGI MAZMUN:\n${doc.summary}\n\n` : '') + `SUHBAT:\n${transcript}`
      }],
      maxTokens: 700,
      tier: 'fast',              // siqish murakkab vazifa emas — arzon modelda
      restaurantId
    });

    doc.summary = String(summary || '').trim().slice(0, 2000);
    doc.summarizedUpTo = olderCount;

    // Juda uzun tarixni kesamiz — mazmuni summary'da saqlanib qolgan
    if (doc.messages.length > MAX_STORED) {
      const drop = doc.messages.length - MAX_STORED;
      doc.messages.splice(0, drop);
      doc.summarizedUpTo = Math.max(0, doc.summarizedUpTo - drop);
    }

    doc.updatedAt = new Date();
    await doc.save();
  } catch (err) {
    // Kvota tugagan yoki AI ishlamadi — keyingi safar qayta urinadi
    console.warn('[mentorChat] mazmunni yangilab bo\'lmadi:', err.code || err.message);
  }
}

/** Suhbatni tozalash (ofitsiant o'zi so'raganda). */
async function clear(restaurantId, waiterId) {
  await MentorChat.updateOne(
    { restaurantId, waiterId },
    { $set: { messages: [], summary: '', summarizedUpTo: 0, updatedAt: new Date() } }
  );
}

module.exports = {
  load, history, append, buildContext, maybeSummarize, clear,
  RECENT_WINDOW, SUMMARIZE_EVERY, MAX_STORED, MAX_MESSAGE_LEN
};
