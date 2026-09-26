const mongoose = require('mongoose');

// ── NOMZODLAR BAZASI (rezyume) ───────────────────────────────
// ALOHIDA kolleksiya — Restaurant hujjatiga solinmaydi.
// Sabab: rezyumelar cheksiz o'sadi (yuzlab nomzod) va har birida to'liq
// matn + original PDF (base64) bo'lishi mumkin. Buni Restaurant ichiga
// solsak har API so'rovi og'irlashadi va 16 MB hujjat limitiga uriladi.
//
// Ma'lumot manbai: restoran admini hh.uz (yoki boshqa manbadan) O'ZI
// yuklab olgan rezyume fayllari. Platforma faqat o'qiydi, saralaydi va
// saqlaydi — hech qanday tashqi saytga ulanmaydi.

const CandidateSchema = new mongoose.Schema({
  id:           { type: String, required: true },     // uuid
  restaurantId: { type: String, required: true },

  // ── AI ajratib olgan maydonlar ──
  fullName:          { type: String, default: '' },
  phone:             { type: String, default: '' },
  email:             { type: String, default: '' },
  desiredPosition:   { type: String, default: '' },   // rezyumedagi asl lavozim matni
  role:              { type: String, default: 'boshqa' }, // normallashtirilgan: ROLE_KEYS yoki 'boshqa'
  experienceYears:   { type: Number, default: 0 },
  experienceSummary: { type: String, default: '' },
  skills:            { type: [String], default: [] },
  languages:         { type: [String], default: [] },
  location:          { type: String, default: '' },
  age:               { type: Number, default: null },
  education:         { type: String, default: '' },
  salaryExpectation: { type: String, default: '' },
  summary:           { type: String, default: '' },   // AI qisqa xulosa (UZ)

  // ── Xom ma'lumot ──
  rawText:  { type: String, default: '' },            // to'liq matn — kalit so'z qidiruvi uchun
  fileName: { type: String, default: '' },
  fileData: { type: String, default: '' },            // original PDF base64 (list'da qaytarilmaydi)
  fileType: { type: String, default: '' },

  // ── Admin boshqaruvi ──
  source:  { type: String, default: 'hh' },           // hh | manual | referral | telegram | other
  status:  { type: String, default: 'new' },          // new|contacted|interview|trial|hired|rejected|reserve
  rating:  { type: Number, default: 0 },              // 0-5 qo'lda baho
  notes:   { type: String, default: '' },
  tags:    { type: [String], default: [] },
  aiParsed:{ type: Boolean, default: false },          // AI tahlili muvaffaqiyatli bo'ldimi

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

CandidateSchema.index({ restaurantId: 1, createdAt: -1 });
CandidateSchema.index({ restaurantId: 1, id: 1 }, { unique: true });

module.exports = mongoose.model('Candidate', CandidateSchema);
