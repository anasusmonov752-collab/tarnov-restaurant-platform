const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const MenuItemSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  // ── Ruscha kontent (rus tilidagi mijoz uchun). Bo'sh bo'lsa UZ ko'rsatiladi. ──
  nameRu:        { type: String, default: '', trim: true },
  descriptionRu: { type: String, default: '', trim: true },
  ingredients: [String],
  allergens: [String],
  price: { type: Number, min: 0, default: 0 },
  servingSuggestion: { type: String, default: '' },
  image: { type: String, maxlength: 7000000 },
  createdAt: { type: Date, default: Date.now }
});

// ── Xodim hujjati ──
// Sanitar kitobcha (oshxona xodimi uchun majburiy va MUDDATI O'TADI), mehnat
// shartnomasi, ID, tibbiy ko'rik. expiryDate bo'lsa — muddat nazorat qilinadi.
const WaiterDocumentSchema = new mongoose.Schema({
  id:         { type: String, default: () => uuidv4() },
  type:       { type: String, default: 'boshqa' },   // sanitar|shartnoma|id|tibbiy|boshqa
  title:      { type: String, required: true, trim: true },
  number:     { type: String, default: '' },
  issueDate:  { type: String, default: '' },         // 'YYYY-MM-DD'
  expiryDate: { type: String, default: '' },         // 'YYYY-MM-DD' — bo'sh = muddatsiz
  note:       { type: String, default: '' },
  createdAt:  { type: Date, default: Date.now }
}, { _id: false });

const WaiterSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: { type: String, required: true, trim: true },
  pin: { type: String, required: true, match: [/^\d{4}$/, 'PIN 4 raqamli bo\'lishi kerak'] },
  // Lavozim — o'quv fokusini belgilaydi. Eski xodimlar 'ofitsiant' bo'lib qoladi.
  // Ro'yxat: src/data/roles.js
  role: { type: String, default: 'ofitsiant' },
  // ── Profil ──
  phone:    { type: String, default: '' },
  hireDate: { type: String, default: '' },           // ishga kirgan sana 'YYYY-MM-DD'
  documents: [WaiterDocumentSchema],
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  readDocuments: [String]
});

const QuestionSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  question: { type: String, required: true, trim: true },

  // type: 'choice'  — variantli savol, darhol tekshiriladi, AI so'rovi sarflanmaydi
  //       'written' — yozma javob, AI baholaydi (0-100 qisman ball)
  type: { type: String, enum: ['choice', 'written'], default: 'choice' },

  // ── faqat 'choice' uchun ──
  options: {
    type: [String],
    validate: {
      validator: function (v) {
        // Yozma savolda variant kerak emas
        return this.type === 'written' || (Array.isArray(v) && v.length >= 2);
      },
      message: 'Variantli savolda kamida 2 ta javob varianti kerak'
    }
  },
  correctAnswer: {
    type: Number,
    min: 0,
    required: function () { return this.type !== 'written'; }
  },

  // ── faqat 'written' uchun ──
  // rubric — AI shu mezon bo'yicha baholaydi (nima to'g'ri javob hisoblanadi)
  rubric:    { type: String, default: '', trim: true },
  // keyPoints — javobda bo'lishi shart bo'lgan asosiy nuqtalar
  keyPoints: { type: [String], default: [] },
  // to'liq javob uchun maksimal ball (KPI hisobida vazn sifatida ishlatiladi)
  maxScore:  { type: Number, default: 100, min: 1 },

  difficulty: { type: String, required: true, enum: ['easy', 'medium', 'hard'] },
  explanation: { type: String, default: '', trim: true },   // xato javob uchun izoh
  menuItemId: String,
  createdAt: { type: Date, default: Date.now }
});

const AnnouncementSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

const BreakdownItemSchema = new mongoose.Schema({
  questionId: String, question: String,
  selectedAnswer: Number, correctAnswer: Number,
  isCorrect: Boolean, difficulty: String, options: [String],
  explanation: String,

  // ── yozma javob (type: 'written') ──
  type:          { type: String, default: 'choice' },
  writtenAnswer: String,                       // ofitsiant yozgan matn
  aiScore:       { type: Number, default: null },   // 0-100, null = hali baholanmagan
  aiFeedback:    String,                       // AI izohi (ofitsiantga ko'rsatiladi)

  // Admin qo'lda tuzatgan bo'lsa — apellyatsiya izi.
  // manualScore null bo'lmasa, hisobda AYNAN shu ishlatiladi.
  manualScore:   { type: Number, default: null },
  manualBy:      String,
  manualAt:      Date
}, { _id: false });

const TestResultSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  waiterId: String, waiterName: String, date: String,
  score: Number, totalCorrect: Number, totalQuestions: Number,
  easyScore: Number, easyTotal: Number,
  mediumScore: Number, mediumTotal: Number,
  hardScore: Number, hardTotal: Number,
  hasCertificate: Boolean, breakdown: [BreakdownItemSchema],
  submittedAt: { type: Date, default: Date.now },

  // Yozma javoblar AI tomonidan navbatda baholanadi (10 so'rov/daqiqa limiti sabab),
  // shuning uchun natija ikki bosqichda yakunlanadi:
  //   'complete' — yozma savol yo'q yoki baholash tugagan (yagona holat eski testlar uchun)
  //   'pending'  — navbatda, ball hozircha faqat variantli savollardan
  //   'failed'   — AI baholay olmadi, admin qo'lda qo'yishi kerak
  gradingStatus: { type: String, enum: ['complete', 'pending', 'failed'], default: 'complete' },
  gradedAt: Date,

  // ── Murabbiy hukmi ──
  // Test tugagach mentor beradigan baho. Saqlanadi, chunki:
  //   1. ofitsiant tarixdan qayta ochganda o'sha gap turishi kerak
  //   2. har ochilishda qayta yozilsa bepul AI kvotasi behuda ketadi
  //   3. mentor keyingi suhbatda "testdan keyin aytgandim" deya oladi
  mentorVerdict:   String,
  mentorVerdictAt: Date
});

const ChecklistItemSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  period: { type: String, enum: ['1-kun', '1-hafta', '1-oy'], default: '1-hafta' },
  order: { type: Number, default: 0 }
});

const WaiterChecklistSchema = new mongoose.Schema({
  waiterId: String,
  completedItems: [String]
}, { _id: false });

const ManagementMemberSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: { type: String, required: true, trim: true },
  position: { type: String, required: true, trim: true },
  phone: String,
  photo: { type: String, maxlength: 7000000 },
  order: { type: Number, default: 0 }
});

// ── Training Videos (erkin nomlangan qisqa standart videolar) ──
const TrainingVideoSchema = new mongoose.Schema({
  id:          { type: String, default: () => uuidv4() },
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  videoUrl:    { type: String, required: true, trim: true },  // /uploads/training/<file>
  order:       { type: Number, default: 0 },
  createdAt:   { type: Date, default: Date.now }
});

const WaiterTrainingViewSchema = new mongoose.Schema({
  waiterId: String,
  viewedVideoIds: [String]
}, { _id: false });

// Menyu yodlash mashqi — ofitsiant "bildim" deb belgilagan taomlar
// Spaced repetition — "Bildim" belgilangan taom unutilmasligi uchun Leitner
// tizimida qayta so'raladi. box oshgani sayin interval uzayadi.
const MenuReviewSchema = new mongoose.Schema({
  dishId:         String,
  box:            { type: Number, default: 1 },   // 1..6
  dueAt:          Date,                            // qachon takrorga chiqadi
  lastReviewedAt: Date
}, { _id: false });

const WaiterMenuProgressSchema = new mongoose.Schema({
  waiterId: String,
  knownDishIds: [String],
  reviews: [MenuReviewSchema],
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

// ── Training Modules ──────────────────────────────────────────
const LessonSchema = new mongoose.Schema({
  id:          { type: String, default: () => uuidv4() },
  title:       { type: String, required: true, trim: true },
  content:     { type: String, default: '', trim: true },   // markdown-like text
  image:       { type: String, maxlength: 7000000 },        // base64 or URL
  videoUrl:    { type: String, default: '' },               // optional YouTube embed
  order:       { type: Number, default: 0 },
  createdAt:   { type: Date, default: Date.now }
});

const ModuleQuizSchema = new mongoose.Schema({
  id:            { type: String, default: () => uuidv4() },
  question:      { type: String, required: true },
  options:       [String],
  correctAnswer: { type: Number, required: true }
}, { _id: false });

const ModuleSchema = new mongoose.Schema({
  id:          { type: String, default: () => uuidv4() },
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  emoji:       { type: String, default: '📚' },
  color:       { type: String, default: '#C8922A' },        // accent color
  // Qaysi lavozimlar uchun — bo'sh massiv = HAMMA rol ko'radi.
  // Ro'yxat: src/data/roles.js
  roles:       { type: [String], default: [] },
  order:       { type: Number, default: 0 },
  lessons:     [LessonSchema],
  quiz:        [ModuleQuizSchema],                          // mini-quiz at end
  passingScore:{ type: Number, default: 70 },              // % to pass
  createdAt:   { type: Date, default: Date.now }
});

const WaiterModuleProgressSchema = new mongoose.Schema({
  waiterId:          String,
  moduleId:          String,
  completedLessons:  [String],                             // lesson ids
  quizScore:         { type: Number, default: -1 },        // -1 = not taken
  completed:         { type: Boolean, default: false },
  completedAt:       Date,
  badgeEarned:       { type: Boolean, default: false }
}, { _id: false });

// ── Bazaviy bilim diagnostikasi ───────────────────────────────
// Ofitsiant birinchi kirganda topshiradigan servis standartlari testi.
// Menyu testidan farqli: bir marta topshiriladi, KPI/maoshga TA'SIR QILMAYDI —
// maqsad baholash emas, o'quv kursini to'g'ri tuzish.
const AreaScoreSchema = new mongoose.Schema({
  area:    String,
  label:   String,
  icon:    String,
  correct: Number,
  total:   Number,
  score:   Number
}, { _id: false });

const AssessmentSchema = new mongoose.Schema({
  waiterId:       String,
  score:          Number,
  totalCorrect:   Number,
  totalQuestions: Number,
  areaScores:     [AreaScoreSchema],
  breakdown:      [BreakdownItemSchema],
  completedAt:    { type: Date, default: Date.now }
}, { _id: false });

// ── Shaxsiy o'quv kursi ───────────────────────────────────────
// Diagnostika natijasidan avtomatik tuziladi: zaif yo'nalishlar birinchi.
const CourseStepSchema = new mongoose.Schema({
  id:      { type: String, default: () => uuidv4() },
  area:    String,                       // qaysi kompetensiyani yopadi
  title:   { type: String, required: true },
  why:     String,                       // nega aynan shu qadam berilgan
  // Qadam qayerga olib boradi: mavjud kontent yoki menyu bo'limi
  sourceType: { type: String, enum: ['module', 'video', 'menu', 'lesson', 'practice'], default: 'lesson' },
  sourceId:   String,                    // modul/video id
  category:   String,                    // menyu bo'limi
  lesson:     String,                    // AI yozgan dars matni (sourceType='lesson')
  order:   { type: Number, default: 0 },
  done:    { type: Boolean, default: false },
  doneAt:  Date
}, { _id: false });

const WaiterCourseSchema = new mongoose.Schema({
  waiterId:  String,
  steps:     [CourseStepSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const KPISettingsSchema = new mongoose.Schema({
  periodDays:      { type: Number, default: 10, enum: [7, 10, 14, 15, 30] },
  masterMin:       { type: Number, default: 90  },
  masterBonus:     { type: Number, default: 15  },
  proMin:          { type: Number, default: 75  },
  proBonus:        { type: Number, default: 0   },
  goodMin:         { type: Number, default: 60  },
  goodBonus:       { type: Number, default: 0   },
  warningMin:      { type: Number, default: 45  },
  warningPenalty:  { type: Number, default: -10 },
  penaltyMin:      { type: Number, default: 30  },
  penaltyFine:     { type: Number, default: -20 },

  // ── Kompozit KPI vaznlari ──
  // Daraja endi faqat testdan emas, uch komponent aralashmasidan chiqadi.
  // Vaznni 0 qilib qo'yilsa o'sha komponent hisobga olinmaydi (menuWeight=0 &
  // moduleWeight=0 → eski faqat-test xulqi).
  testWeight:      { type: Number, default: 60 },  // test o'rtachasi
  menuWeight:      { type: Number, default: 25 },  // menyu o'rganilgan %
  moduleWeight:    { type: Number, default: 15 },  // modul tugatilgan %
  floorWeight:     { type: Number, default: 20 },  // amaliy (floor) baho — baho bo'lmasa hisobga olinmaydi
}, { _id: false });

// ── Amaliy (floor) baholash ───────────────────────────────────
// Servis standartini test bilan o'lchab bo'lmaydi — menejer smenada kuzatib
// baho beradi. Har mezon 0 (yo'q) / 1 (qisman) / 2 (to'liq) bilan baholanadi.
const EvalCriterionSchema = new mongoose.Schema({
  id:    { type: String, default: () => uuidv4() },
  title: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 }
}, { _id: false });

const EvaluationScoreSchema = new mongoose.Schema({
  criterionId: String,
  title:       String,   // baho paytidagi mezon matni (keyin o'zgarsa ham saqlanadi)
  score:       Number    // 0 | 1 | 2
}, { _id: false });

const EvaluationSchema = new mongoose.Schema({
  id:         { type: String, default: () => uuidv4() },
  waiterId:   String,
  waiterName: String,    // snapshot
  evaluator:  String,    // baho bergan menejer nomi (ixtiyoriy)
  date:       String,     // 'YYYY-MM-DD'
  scores:     [EvaluationScoreSchema],
  totalScore: Number,    // 0-100 %
  note:       String,
  createdAt:  { type: Date, default: Date.now }
});

// ── Xodim jurnali ─────────────────────────────────────────────
// Baholash suhbatlari (1-on-1) va intizom yozuvlari — har xodim bo'yicha
// vaqt tasmasi. KPI'ga ta'sir qilmaydi (bu HR yozuvi, avtomatik baho emas).
const StaffNoteSchema = new mongoose.Schema({
  id:         { type: String, default: () => uuidv4() },
  waiterId:   { type: String, required: true },
  waiterName: String,    // snapshot
  kind:       { type: String, enum: ['review', 'praise', 'incident'], default: 'review' },
  date:       String,     // 'YYYY-MM-DD'
  title:      { type: String, required: true, trim: true },
  content:    { type: String, default: '' },
  author:     String,     // yozib qo'ygan menejer
  createdAt:  { type: Date, default: Date.now }
});

const AdaptDocumentSchema = new mongoose.Schema({
  id:       { type: String, default: () => uuidv4() },
  title:    { type: String, required: true, trim: true },
  content:  { type: String, default: '', trim: true },
  icon:     { type: String, default: '📄' },
  required: { type: Boolean, default: false },
  order:    { type: Number, default: 0 }
}, { _id: false });

const OnboardingStepSchema = new mongoose.Schema({
  id:          { type: String, default: () => uuidv4() },
  day:         { type: String, default: '1-kun' },
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  tasks:       [String],
  order:       { type: Number, default: 0 }
}, { _id: false });

const AdaptationSchema = new mongoose.Schema({
  history:         { type: String, default: '' },
  mission:         { type: String, default: '' },
  image:           { type: String, maxlength: 7000000 },   // restoran rasmi (base64)
  values:          [String],
  management:      [ManagementMemberSchema],
  documents:       [AdaptDocumentSchema],
  onboardingSteps: [OnboardingStepSchema]
}, { _id: false });

const RestaurantSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4(), unique: true },
  name: { type: String, required: true, trim: true },
  location: { type: String, default: '', trim: true },
  active: { type: Boolean, default: true },
  plan: { type: String, default: 'basic', enum: ['basic', 'pro', 'enterprise'] },
  planPrice: { type: Number, default: 0, min: 0 },
  adminEmail: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email format noto\'g\'ri']
  },
  adminPassword: { type: String, required: true, minlength: 6 },
  createdAt: { type: Date, default: Date.now },
  menu: [MenuItemSchema],
  waiters: [WaiterSchema],
  questions: [QuestionSchema],
  testDays: [String],
  announcements: [AnnouncementSchema],
  testResults: [TestResultSchema],
  checklist: [ChecklistItemSchema],
  waiterChecklists: [WaiterChecklistSchema],
  adaptation:   { type: AdaptationSchema,  default: () => ({}) },
  kpiSettings:  { type: KPISettingsSchema, default: () => ({}) },
  modules: [ModuleSchema],
  moduleProgress: [WaiterModuleProgressSchema],
  trainingVideos: [TrainingVideoSchema],
  waiterTrainingViews: [WaiterTrainingViewSchema],
  waiterMenuProgress: [WaiterMenuProgressSchema],
  assessments: [AssessmentSchema],
  courses: [WaiterCourseSchema],
  evalCriteria: [EvalCriterionSchema],
  evaluations:  [EvaluationSchema],
  staffNotes:   [StaffNoteSchema]
});

module.exports = mongoose.model('Restaurant', RestaurantSchema);
