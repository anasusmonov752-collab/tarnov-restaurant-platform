const mongoose = require('mongoose');
const { phoneKey } = require('../utils/candidateKeys');

// ── NOMZODLAR BAZASI (rezyume) ───────────────────────────────
// ALOHIDA kolleksiya — Restaurant hujjatiga solinmaydi.
// Sabab: rezyumelar cheksiz o'sadi (yuzlab nomzod) va har birida to'liq
// matn + original PDF (base64) bo'lishi mumkin. Buni Restaurant ichiga
// solsak har API so'rovi og'irlashadi va 16 MB hujjat limitiga uriladi.
//
// Ma'lumot manbai: restoran admini hh.uz (yoki boshqa manbadan) O'ZI
// yuklab olgan rezyume fayllari. Platforma faqat o'qiydi, saralaydi va
// saqlaydi — hech qanday tashqi saytga ulanmaydi.

// Ish tarixi bandi — qaysi kompaniya, qaysi lavozimda, qancha muddat
const WorkSchema = new mongoose.Schema({
  company:     { type: String, default: '' },
  position:    { type: String, default: '' },
  period:      { type: String, default: '' },  // masalan "2021-2023" yoki "2 yil"
  description: { type: String, default: '' }   // shu ish joyidagi majburiyatlar (rezyumeda yozilgani)
}, { _id: false });

const CandidateSchema = new mongoose.Schema({
  id:           { type: String, required: true },     // uuid
  restaurantId: { type: String, required: true },

  photo:             { type: String, default: '' },   // ixtiyoriy avatar (base64 dataURL) — list'da qaytarilmaydi
  hasPhoto:          { type: Boolean, default: false },// foto bor-yo'qligi (yengil list uchun)

  // ── AI ajratib olgan maydonlar ──
  fullName:          { type: String, default: '' },
  phone:             { type: String, default: '' },
  email:             { type: String, default: '' },
  desiredPosition:   { type: String, default: '' },   // rezyumedagi asl lavozim matni
  role:              { type: String, default: 'boshqa' }, // normallashtirilgan: ROLE_KEYS yoki 'boshqa'
  experienceYears:   { type: Number, default: 0 },
  experienceSummary: { type: String, default: '' },
  workHistory:       { type: [WorkSchema], default: [] }, // ish tarixi (kompaniya/lavozim/muddat)
  shift:             { type: String, default: '' },   // kunduzgi | kechki | ikkalasi
  fitScore:          { type: Number, default: 0 },    // AI moslik bahosi 0-5
  fitReason:         { type: String, default: '' },   // moslik sababi (qisqa, UZ)
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
  branch:  { type: String, default: '' },              // filial/bo'lim (Podrazdelenie)
  source:  { type: String, default: 'hh' },            // hh | manual | referral | telegram | other
  status:  { type: String, default: 'new' },           // kanban bosqichi (VALID_STATUS)
  statusChangedAt: { type: Date, default: Date.now },  // shu bosqichga qachon o'tgan ("N kun bu bosqichda")
  rating:  { type: Number, default: 0 },               // 0-5 qo'lda baho
  notes:   { type: String, default: '' },
  tags:    { type: [String], default: [] },
  aiParsed:{ type: Boolean, default: false },          // AI tahlili muvaffaqiyatli bo'ldimi

  // ── Telegram aloqasi ──
  // Bot o'zi birinchi bo'lib yoza olmaydi (Telegram qoidasi), shuning uchun
  // nomzodga SMS/email orqali deep link yuboriladi. U bosgach chatId bog'lanadi.
  tgChatId:       { type: String, default: '' },
  tgUsername:     { type: String, default: '' },
  tgState:        { type: String, default: 'none' },  // none|invited|linked|blocked|stopped
  tgInviteToken:  { type: String, default: '' },      // deep link payload, bir martalik
  tgInviteSentAt: { type: Date,   default: null },
  tgInviteChannel:{ type: String, default: '' },      // sms | email | hh | manual
  tgLinkedAt:     { type: Date,   default: null },
  tgUnread:       { type: Number, default: 0 },       // o'qilmagan kiruvchi xabarlar
  tgLastMsgAt:    { type: Date,   default: null },

  // ── Mijozga ko'rsatish (TalentHub) ──
  // Mijoz ism va kontaktni ko'rmaydi, shuning uchun nomzodga suhbatda
  // murojaat qilish uchun qisqa kod kerak ("A-3F7C haqida gaplashaylik").
  publicCode:  { type: String, default: '' },
  // hh.uz'dagidek: mijoz eski nomzodga vaqt sarflamasligi uchun
  jobStatus:   { type: String, default: 'unknown' },  // active|considering|not_looking|unknown
  jobStatusAt: { type: Date,   default: null },
  shownToClients: { type: [String], default: [] },    // takror ko'rsatmaslik uchun

  // Sanitar kitobcha — oziq-ovqat sohasida MAJBURIY hujjat. hh'da u
  // profil tubida ko'milgan, bizda esa birinchi savollardan biri:
  // kitobchasi yo'q nomzodni restoran ishga ololmaydi.
  sanitaryBook:      { type: String, default: '' },   // yes | no | expired
  sanitaryBookUntil: { type: Date,   default: null },

  // Interfeys tili (nomzod kabineti va bot): 'uz' | 'ru' | '' (hali
  // tanlamagan — Telegram language_code'dan taxmin). Client.lang bilan bir xil.
  lang: { type: String, default: '' },

  // ── Anketa (services/survey.js) ──
  gender:          { type: String, default: '' },   // male | female
  birthDate:       { type: Date,   default: null },  // age shundan hisoblanadi
  // Telefon Telegram "kontaktni ulashish" orqali kelgan — raqam haqiqiy
  // va shu odamniki. Qo'lda yozilgan telefonda null.
  phoneVerifiedAt: { type: Date,   default: null },
  // Ma'lumotni qayta ishlash va ish beruvchilarga ko'rsatishga rozilik.
  // Agentlik modeli uchun shart; 14 kunlik ariza qoidasi ham shunga tayanadi.
  consentAt:       { type: Date,   default: null },
  channel:         { type: String, default: '' },   // e'lon manbasi (ig, tg, olx, qr ...)
  // "Qachondan ish boshlay olasiz" — now | w1 | w2 | m1 va taxminiy sana
  // (anketa yuborilgan kundan hisoblanadi; ish beruvchi kartada ko'radi)
  startWhen:       { type: String, default: '' },
  availableFrom:   { type: Date,   default: null },
  // Konstruktorda qo'shilgan o'z savollari javoblari (maydoni yo'q):
  // { q: savol matni, a: javob } — panel kartasida "Anketa javoblari"
  extraAnswers:    { type: [{ q: String, a: String, _id: false }], default: [] },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

CandidateSchema.index({ restaurantId: 1, createdAt: -1 });
CandidateSchema.index({ restaurantId: 1, id: 1 }, { unique: true });
// Deep link tokenini yechish (sparse — ko'pchilikda bo'sh)
CandidateSchema.index({ tgInviteToken: 1 }, { sparse: true });
// Kiruvchi Telegram xabarini nomzodga bog'lash
CandidateSchema.index({ restaurantId: 1, tgChatId: 1 }, { sparse: true });
// Nomzod kabineti guard'i agentliksiz, faqat tgChatId bo'yicha qidiradi —
// yuqoridagi indeks ishlamasdi, har so'rovda butun kolleksiya ko'rilardi
CandidateSchema.index({ tgChatId: 1 }, { sparse: true });
// Mijoz ko'rgan qisqa kod bo'yicha topish
CandidateSchema.index({ restaurantId: 1, publicCode: 1 }, { sparse: true });

// ── Dublikat kalitlari (utils/candidateKeys.js) ──
// phoneKey har saqlashda telefondan qayta hisoblanadi — telefon qayerda
// o'zgarmasin (panel, nomzod o'zi, AI qayta tahlili), kalit mos turadi.
// textHash faqat yaratishda qo'yiladi: rezyume matni keyin o'zgarmaydi.
CandidateSchema.add({
  phoneKey: { type: String, default: '' },
  textHash: { type: String, default: '' }
});
CandidateSchema.pre('save', function () {
  this.phoneKey = phoneKey(this.phone);
});
CandidateSchema.index({ restaurantId: 1, phoneKey: 1 });
CandidateSchema.index({ restaurantId: 1, textHash: 1 });

module.exports = mongoose.model('Candidate', CandidateSchema);
