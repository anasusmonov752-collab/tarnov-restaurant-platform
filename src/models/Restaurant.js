const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const MenuItemSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: String, category: String, description: String,
  ingredients: [String], allergens: [String],
  price: Number, servingSuggestion: String,
  image: { type: String, maxlength: 2000000 },
  createdAt: { type: Date, default: Date.now }
});

const WaiterSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: String, pin: String, active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const QuestionSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  question: String, options: [String],
  correctAnswer: Number, difficulty: String,
  menuItemId: String, createdAt: { type: Date, default: Date.now }
});

const AnnouncementSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  title: String, content: String,
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
  title: String,
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
  name: String, position: String, phone: String,
  photo: { type: String, maxlength: 2000000 },
  order: { type: Number, default: 0 }
});

const AdaptationSchema = new mongoose.Schema({
  history: { type: String, default: '' },
  mission: { type: String, default: '' },
  values: [String],
  management: [ManagementMemberSchema]
}, { _id: false });

const RestaurantSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4(), unique: true },
  name: String, location: String,
  active: { type: Boolean, default: true },
  plan: { type: String, default: 'basic' },
  planPrice: { type: Number, default: 0 },
  adminEmail: { type: String, unique: true },
  adminPassword: String,
  createdAt: { type: Date, default: Date.now },
  menu: [MenuItemSchema],
  waiters: [WaiterSchema],
  questions: [QuestionSchema],
  testDays: [String],
  announcements: [AnnouncementSchema],
  testResults: [TestResultSchema],
  checklist: [ChecklistItemSchema],
  waiterChecklists: [WaiterChecklistSchema],
  adaptation: { type: AdaptationSchema, default: () => ({}) }
});

module.exports = mongoose.model('Restaurant', RestaurantSchema);
