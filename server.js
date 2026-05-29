const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tarnov-secret-jwt-key-2024';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tarnov';
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ==================== MONGOOSE SCHEMAS ====================

const SuperAdminSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  name: String
});

const MenuItemSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: String, category: String, description: String,
  ingredients: [String], allergens: [String],
  price: Number, servingSuggestion: String,
  image: { type: String, maxlength: 2000000 }, // Base64 ~1.5MB rasm
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
  testResults: [TestResultSchema]
});

const SuperAdmin = mongoose.model('SuperAdmin', SuperAdminSchema);
const Restaurant = mongoose.model('Restaurant', RestaurantSchema);

// ==================== CONNECT & INIT ====================

async function connectDB() {
  await mongoose.connect(MONGODB_URI);
  console.log('✦ MongoDB connected');

  const existing = await SuperAdmin.findOne({ email: 'admin@tarnov.uz' });
  if (!existing) {
    const hashed = await bcrypt.hash('Tarnov2024!', 10);
    await SuperAdmin.create({ email: 'admin@tarnov.uz', password: hashed, name: 'Super Admin' });
    console.log('✦ Super Admin created: admin@tarnov.uz / Tarnov2024!');
  }
}

// ==================== MIDDLEWARE ====================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function auth(roles) {
  return (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (roles && !roles.includes(decoded.role)) return res.status(403).json({ error: 'Ruxsat yo\'q' });
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Token yaroqsiz' });
    }
  };
}

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

// ==================== AUTH ====================

app.post('/api/auth/login', async (req, res) => {
  const { loginType, email, password, restaurantId, pin } = req.body;

  if (loginType === 'superadmin') {
    const admin = await SuperAdmin.findOne({ email });
    if (!admin) return res.status(401).json({ error: 'Noto\'g\'ri email yoki parol' });
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ error: 'Noto\'g\'ri email yoki parol' });
    const token = jwt.sign({ role: 'superadmin', name: admin.name }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, maxAge: 86400000, sameSite: 'lax' });
    return res.json({ success: true, role: 'superadmin', redirect: '/super-admin.html' });
  }

  if (loginType === 'restaurant') {
    const restaurant = await Restaurant.findOne({ adminEmail: email, active: true });
    if (!restaurant) return res.status(401).json({ error: 'Noto\'g\'ri email yoki parol' });
    const valid = await bcrypt.compare(password, restaurant.adminPassword);
    if (!valid) return res.status(401).json({ error: 'Noto\'g\'ri email yoki parol' });
    const token = jwt.sign(
      { role: 'restaurant', restaurantId: restaurant.id, restaurantName: restaurant.name },
      JWT_SECRET, { expiresIn: '24h' }
    );
    res.cookie('token', token, { httpOnly: true, maxAge: 86400000, sameSite: 'lax' });
    return res.json({ success: true, role: 'restaurant', redirect: '/restaurant-admin.html' });
  }

  if (loginType === 'waiter') {
    if (!restaurantId || !pin) return res.status(400).json({ error: 'Restoran va PIN kiritish shart' });
    const restaurant = await Restaurant.findOne({ id: restaurantId, active: true });
    if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });
    const waiter = restaurant.waiters.find(w => w.pin === pin && w.active);
    if (!waiter) return res.status(401).json({ error: 'Noto\'g\'ri PIN' });
    const token = jwt.sign(
      { role: 'waiter', restaurantId: restaurant.id, restaurantName: restaurant.name, waiterId: waiter.id, waiterName: waiter.name },
      JWT_SECRET, { expiresIn: '12h' }
    );
    res.cookie('token', token, { httpOnly: true, maxAge: 43200000, sameSite: 'lax' });
    return res.json({ success: true, role: 'waiter', redirect: '/waiter.html' });
  }

  return res.status(400).json({ error: 'Noto\'g\'ri login turi' });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(jwt.verify(token, JWT_SECRET));
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/restaurants/list', async (req, res) => {
  const list = await Restaurant.find({ active: true }, 'id name location');
  res.json(list.map(r => ({ id: r.id, name: r.name, location: r.location })));
});

// ==================== SUPER ADMIN ====================

app.get('/api/super/dashboard', auth(['superadmin']), async (req, res) => {
  const restaurants = await Restaurant.find();
  res.json({
    total: restaurants.length,
    active: restaurants.filter(r => r.active).length,
    inactive: restaurants.filter(r => !r.active).length,
    totalWaiters: restaurants.reduce((s, r) => s + r.waiters.length, 0),
    totalMenuItems: restaurants.reduce((s, r) => s + r.menu.length, 0),
    totalRevenue: restaurants.reduce((s, r) => s + (r.planPrice || 0), 0),
    restaurants: restaurants.map(r => ({
      id: r.id, name: r.name, location: r.location, active: r.active,
      plan: r.plan, planPrice: r.planPrice, adminEmail: r.adminEmail,
      waitersCount: r.waiters.length, menuCount: r.menu.length,
      questionsCount: r.questions.length, createdAt: r.createdAt
    }))
  });
});

app.post('/api/super/restaurants', auth(['superadmin']), async (req, res) => {
  const { name, location, adminEmail, adminPassword, plan, planPrice } = req.body;
  if (!name || !adminEmail || !adminPassword) return res.status(400).json({ error: 'Ism, email va parol majburiy' });
  const existing = await Restaurant.findOne({ adminEmail });
  if (existing) return res.status(400).json({ error: 'Bu email allaqachon mavjud' });
  const restaurant = await Restaurant.create({
    id: uuidv4(), name, location: location || '', active: true,
    plan: plan || 'basic', planPrice: parseInt(planPrice) || 0,
    adminEmail, adminPassword: await bcrypt.hash(adminPassword, 10)
  });
  res.json({ success: true, restaurant: { id: restaurant.id, name: restaurant.name, adminEmail: restaurant.adminEmail } });
});

app.put('/api/super/restaurants/:id', auth(['superadmin']), async (req, res) => {
  const { name, location, plan, planPrice, active, adminPassword, adminEmail } = req.body;
  const update = {};
  if (name) update.name = name;
  if (location !== undefined) update.location = location;
  if (plan) update.plan = plan;
  if (planPrice !== undefined) update.planPrice = parseInt(planPrice);
  if (active !== undefined) update.active = Boolean(active);
  if (adminEmail) update.adminEmail = adminEmail;
  if (adminPassword) update.adminPassword = await bcrypt.hash(adminPassword, 10);
  await Restaurant.updateOne({ id: req.params.id }, update);
  res.json({ success: true });
});

app.delete('/api/super/restaurants/:id', auth(['superadmin']), async (req, res) => {
  await Restaurant.deleteOne({ id: req.params.id });
  res.json({ success: true });
});

app.patch('/api/super/restaurants/:id/toggle', auth(['superadmin']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.params.id });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  r.active = !r.active;
  await r.save();
  res.json({ success: true, active: r.active });
});

// ==================== RESTAURANT ADMIN ====================

app.get('/api/restaurant/info', auth(['restaurant']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, '-adminPassword');
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  res.json(r);
});

// Menu
app.get('/api/restaurant/menu', auth(['restaurant']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'menu');
  res.json(r?.menu || []);
});

app.post('/api/restaurant/menu', auth(['restaurant']), async (req, res) => {
  const { name, category, description, ingredients, allergens, price, servingSuggestion, imageBase64 } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'Taom nomi va kategoriya majburiy' });
  const item = {
    id: uuidv4(), name, category, description: description || '',
    ingredients: ingredients ? ingredients.split(',').map(i => i.trim()).filter(Boolean) : [],
    allergens: allergens ? allergens.split(',').map(a => a.trim()).filter(Boolean) : [],
    price: parseInt(price) || 0, servingSuggestion: servingSuggestion || '',
    image: imageBase64 || null
  };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { menu: item } });
  res.json({ success: true, item });
});

app.put('/api/restaurant/menu/:itemId', auth(['restaurant']), async (req, res) => {
  const { name, category, description, ingredients, allergens, price, servingSuggestion, imageBase64 } = req.body;
  const update = {};
  if (name) update['menu.$.name'] = name;
  if (category) update['menu.$.category'] = category;
  if (description !== undefined) update['menu.$.description'] = description;
  if (ingredients !== undefined) update['menu.$.ingredients'] = ingredients.split(',').map(i => i.trim()).filter(Boolean);
  if (allergens !== undefined) update['menu.$.allergens'] = allergens.split(',').map(a => a.trim()).filter(Boolean);
  if (price !== undefined) update['menu.$.price'] = parseInt(price) || 0;
  if (servingSuggestion !== undefined) update['menu.$.servingSuggestion'] = servingSuggestion;
  if (imageBase64) update['menu.$.image'] = imageBase64;
  await Restaurant.updateOne({ id: req.user.restaurantId, 'menu.id': req.params.itemId }, { $set: update });
  res.json({ success: true });
});

app.delete('/api/restaurant/menu/:itemId', auth(['restaurant']), async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { menu: { id: req.params.itemId } } });
  res.json({ success: true });
});

// Waiters
app.get('/api/restaurant/waiters', auth(['restaurant']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'waiters');
  res.json(r?.waiters || []);
});

app.post('/api/restaurant/waiters', auth(['restaurant']), async (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin || !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'Ism va 4 raqamli PIN kiritish shart' });
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (r.waiters.find(w => w.pin === pin)) return res.status(400).json({ error: 'Bu PIN allaqachon mavjud' });
  const waiter = { id: uuidv4(), name, pin, active: true };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { waiters: waiter } });
  res.json({ success: true, waiter });
});

app.put('/api/restaurant/waiters/:waiterId', auth(['restaurant']), async (req, res) => {
  const { name, pin, active } = req.body;
  const update = {};
  if (name) update['waiters.$.name'] = name;
  if (pin && /^\d{4}$/.test(pin)) update['waiters.$.pin'] = pin;
  if (active !== undefined) update['waiters.$.active'] = Boolean(active);
  await Restaurant.updateOne({ id: req.user.restaurantId, 'waiters.id': req.params.waiterId }, { $set: update });
  res.json({ success: true });
});

app.delete('/api/restaurant/waiters/:waiterId', auth(['restaurant']), async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { waiters: { id: req.params.waiterId } } });
  res.json({ success: true });
});

// Questions
app.get('/api/restaurant/questions', auth(['restaurant']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'questions');
  res.json(r?.questions || []);
});

app.post('/api/restaurant/questions', auth(['restaurant']), async (req, res) => {
  let { question, options, correctAnswer, difficulty, menuItemId } = req.body;
  if (!question || !options || correctAnswer === undefined || !difficulty) return res.status(400).json({ error: 'Barcha maydonlar to\'ldirilishi shart' });
  if (typeof options === 'string') { try { options = JSON.parse(options); } catch { options = options.split('|'); } }
  if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ error: 'Kamida 2 ta javob varianti kerak' });
  const q = { id: uuidv4(), question, options, correctAnswer: parseInt(correctAnswer), difficulty, menuItemId: menuItemId || null };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { questions: q } });
  res.json({ success: true, question: q });
});

app.put('/api/restaurant/questions/:qId', auth(['restaurant']), async (req, res) => {
  let { question, options, correctAnswer, difficulty, menuItemId } = req.body;
  const update = {};
  if (question) update['questions.$.question'] = question;
  if (options) {
    if (typeof options === 'string') { try { options = JSON.parse(options); } catch { options = options.split('|'); } }
    update['questions.$.options'] = options;
  }
  if (correctAnswer !== undefined) update['questions.$.correctAnswer'] = parseInt(correctAnswer);
  if (difficulty) update['questions.$.difficulty'] = difficulty;
  if (menuItemId !== undefined) update['questions.$.menuItemId'] = menuItemId;
  await Restaurant.updateOne({ id: req.user.restaurantId, 'questions.id': req.params.qId }, { $set: update });
  res.json({ success: true });
});

app.delete('/api/restaurant/questions/:qId', auth(['restaurant']), async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { questions: { id: req.params.qId } } });
  res.json({ success: true });
});

// Test Days
app.get('/api/restaurant/testdays', auth(['restaurant']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'testDays');
  res.json(r?.testDays || []);
});

app.post('/api/restaurant/testdays', auth(['restaurant']), async (req, res) => {
  const { date } = req.body;
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $addToSet: { testDays: date } });
  res.json({ success: true });
});

app.delete('/api/restaurant/testdays/:date', auth(['restaurant']), async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { testDays: req.params.date } });
  res.json({ success: true });
});

// Announcements
app.get('/api/restaurant/announcements', auth(['restaurant']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'announcements');
  res.json((r?.announcements || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post('/api/restaurant/announcements', auth(['restaurant']), async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Sarlavha va matn majburiy' });
  const ann = { id: uuidv4(), title, content };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { announcements: { $each: [ann], $position: 0 } } });
  res.json({ success: true, announcement: ann });
});

app.delete('/api/restaurant/announcements/:id', auth(['restaurant']), async (req, res) => {
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $pull: { announcements: { id: req.params.id } } });
  res.json({ success: true });
});

// Results
app.get('/api/restaurant/results', auth(['restaurant']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'testResults');
  res.json((r?.testResults || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)));
});

// ==================== WAITER ====================

app.get('/api/waiter/info', auth(['waiter']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const waiter = r.waiters.find(w => w.id === req.user.waiterId);
  const today = new Date().toISOString().split('T')[0];
  res.json({
    waiter, restaurant: { id: r.id, name: r.name, location: r.location },
    isTestDay: r.testDays.includes(today),
    announcements: (r.announcements || []).slice(0, 3)
  });
});

app.get('/api/waiter/menu', auth(['waiter']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const today = new Date().toISOString().split('T')[0];
  if (r.testDays.includes(today)) return res.json({ hidden: true, message: 'Bugun test kuni! Menyu yashirilgan.' });
  res.json({ hidden: false, menu: r.menu });
});

app.get('/api/waiter/test/start', auth(['waiter']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const today = new Date().toISOString().split('T')[0];
  if (!r.testDays.includes(today)) return res.status(403).json({ error: 'Bugun test kuni emas' });
  const taken = r.testResults.find(x => x.waiterId === req.user.waiterId && x.date === today);
  if (taken) return res.status(400).json({ error: 'Siz bugun allaqachon test topshirdingiz', result: taken });
  const easy = r.questions.filter(q => q.difficulty === 'easy');
  const medium = r.questions.filter(q => q.difficulty === 'medium');
  const hard = r.questions.filter(q => q.difficulty === 'hard');
  if (easy.length < 10 || medium.length < 5 || hard.length < 5) {
    return res.status(400).json({ error: `Test uchun yetarli savol yo'q. Kerak: 10 oson, 5 o'rta, 5 qiyin. Mavjud: ${easy.length} oson, ${medium.length} o'rta, ${hard.length} qiyin` });
  }
  const selected = [
    ...shuffle(easy).slice(0, 10),
    ...shuffle(medium).slice(0, 5),
    ...shuffle(hard).slice(0, 5)
  ].map(q => ({ id: q.id, question: q.question, options: q.options, difficulty: q.difficulty }));
  res.json({ questions: selected, timePerQuestion: 30 });
});

app.post('/api/waiter/test/submit', auth(['waiter']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const today = new Date().toISOString().split('T')[0];
  if (!r.testDays.includes(today)) return res.status(403).json({ error: 'Bugun test kuni emas' });
  const { answers } = req.body;
  let easyScore = 0, easyTotal = 0, mediumScore = 0, mediumTotal = 0, hardScore = 0, hardTotal = 0;
  const breakdown = [];
  Object.entries(answers || {}).forEach(([qId, selected]) => {
    const q = r.questions.find(x => x.id === qId);
    if (!q) return;
    const isCorrect = parseInt(selected) === q.correctAnswer;
    breakdown.push({ questionId: qId, question: q.question, selectedAnswer: parseInt(selected), correctAnswer: q.correctAnswer, isCorrect, difficulty: q.difficulty, options: q.options });
    if (q.difficulty === 'easy') { easyTotal++; if (isCorrect) easyScore++; }
    else if (q.difficulty === 'medium') { mediumTotal++; if (isCorrect) mediumScore++; }
    else if (q.difficulty === 'hard') { hardTotal++; if (isCorrect) hardScore++; }
  });
  const totalCorrect = easyScore + mediumScore + hardScore;
  const totalQuestions = easyTotal + mediumTotal + hardTotal;
  const percentage = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const waiter = r.waiters.find(w => w.id === req.user.waiterId);
  const result = {
    id: uuidv4(), waiterId: req.user.waiterId, waiterName: waiter?.name || req.user.waiterName,
    date: today, score: percentage, totalCorrect, totalQuestions,
    easyScore, easyTotal, mediumScore, mediumTotal, hardScore, hardTotal,
    hasCertificate: percentage >= 90, breakdown
  };
  await Restaurant.updateOne({ id: req.user.restaurantId }, { $push: { testResults: result } });
  res.json({ success: true, result });
});

app.get('/api/waiter/history', auth(['waiter']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'testResults');
  const history = (r?.testResults || []).filter(x => x.waiterId === req.user.waiterId);
  res.json(history.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.get('/api/waiter/announcements', auth(['waiter']), async (req, res) => {
  const r = await Restaurant.findOne({ id: req.user.restaurantId }, 'announcements');
  res.json(r?.announcements || []);
});

// ==================== START ====================

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✦ Tarnov Restaurant Platform`);
    console.log(`✦ Running on http://localhost:${PORT}`);
    console.log(`✦ Super Admin: admin@tarnov.uz / Tarnov2024!`);
  });
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});
