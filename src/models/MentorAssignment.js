const mongoose = require('mongoose');

// ── MURABBIY TOPSHIRIQLARI ───────────────────────────────────
// Mentorni "jonli ustoz" qiladigan narsa — qattiq gapirishi emas, AYTGANINI
// SO'RASHI. Shuning uchun har topshiriq yozib qo'yiladi, muddati belgilanadi
// va muddat kelganda AVTOMATIK tekshiriladi.
//
// ALOHIDA kolleksiya — MentorChat kabi. Restaurant hujjati deyarli har
// so'rovda to'liq o'qiladi, topshiriqlar esa vaqt o'tishi bilan to'planadi.
//
// TEKSHIRISH AI ISHLATMAYDI. Hamma dalil allaqachon bazada:
// o'rganilgan taomlar, test ballari, modul progressi.

const CheckSchema = new mongoose.Schema({
  // menuCount      — umuman N ta yangi taom o'rganish
  // categoryDishes — muayyan bo'limdan N ta taom o'rganish
  // testScore      — keyingi testda kamida N% olish
  // manual         — mashinada tekshirib bo'lmaydi (masalan "smenada qo'llang"),
  //                  ofitsiantning o'zi tasdiqlaydi
  type:     { type: String, enum: ['menuCount', 'categoryDishes', 'testScore', 'manual'], required: true },
  target:   { type: Number, default: 0 },
  category: String,

  // Topshiriq BERILGAN PAYTDAGI holat. Busiz tekshiruv yolg'on chiqadi:
  // "yana 8 ta taom o'rganing" degan topshiriqni allaqachon 100 ta taom
  // biladigan ofitsiant hech narsa qilmasdan "bajargan" bo'lib qolardi.
  baseline: { type: Number, default: 0 }
}, { _id: false });

const MentorAssignmentSchema = new mongoose.Schema({
  restaurantId: { type: String, required: true },
  waiterId:     { type: String, required: true },

  title:  { type: String, required: true },   // ofitsiant ko'radigan matn
  detail: String,
  check:  { type: CheckSchema, required: true },

  dueAt:  { type: Date, required: true },
  status: { type: String, enum: ['active', 'done', 'missed'], default: 'active' },

  // Bajarilmagani uchun mentor bir marta hisob so'raydi. Har ochilishda
  // takrorlansa — bu janjal bo'ladi, murabbiylik emas.
  askedAt:    Date,
  createdAt:  { type: Date, default: Date.now },
  resolvedAt: Date,

  // Tekshiruv paytidagi haqiqiy natija — "8 tadan 3 tasini qildingiz"
  // deya olish uchun. Busiz mentor faqat "bajarmadingiz" deya olardi.
  progressAt: { type: Number, default: 0 }
});

// Bosh ekran har ochilganda shu ofitsiantning faol topshiriqlarini so'raydi
MentorAssignmentSchema.index({ restaurantId: 1, waiterId: 1, status: 1 });

module.exports = mongoose.model('MentorAssignment', MentorAssignmentSchema);
