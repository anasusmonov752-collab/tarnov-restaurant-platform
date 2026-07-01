const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const MenuItemSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  ingredients: [String],
  allergens: [String],
  price: { type: Number, min: 0, default: 0 },
  servingSuggestion: { type: String, default: '' },
  image: { type: String, maxlength: 7000000 },
  createdAt: { type: Date, default: Date.now }
});

const WaiterSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: { type: String, required: true, trim: true },
  pin: { type: String, required: true, match: [/^\d{4}$/, 'PIN 4 raqamli bo\'lishi kerak'] },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  readDocuments: [String]
});

const QuestionSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  question: { type: String, required: true, trim: true },
  options: { type: [String], validate: { validator: v => v.length >= 2, message: 'Kamida 2 ta javob varianti kerak' } },
  correctAnswer: { type: Number, required: true, min: 0 },
  difficulty: { type: String, required: true, enum: ['easy', 'medium', 'hard'] },
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
  isCorrect: Boolean, difficulty: String, options: [String]
}, { _id: false });

const TestResultSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  waiterId: String, waiterName: String, date: String,
  score: Number, totalCorrect: Number, totalQuestions: Number,
  easyScore: Number, easyTotal: Number,
  mediumScore: Number, mediumTotal: Number,
  hardScore: Number, hardTotal: Number,
  hasCertificate: Boolean, breakdown: [BreakdownItemSchema],
  submittedAt: { type: Date, default: Date.now }
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
}, { _id: false });

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
  waiterTrainingViews: [WaiterTrainingViewSchema]
});

module.exports = mongoose.model('Restaurant', RestaurantSchema);
