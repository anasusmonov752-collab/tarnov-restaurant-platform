const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tarnov-secret-jwt-key-2024';
const DATA_DIR = path.join(__dirname, 'data');
const RESTAURANTS_DIR = path.join(DATA_DIR, 'restaurants');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Initialize directories
[DATA_DIR, RESTAURANTS_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize super admin
const SUPERADMIN_FILE = path.join(DATA_DIR, 'superadmin.json');
if (!fs.existsSync(SUPERADMIN_FILE)) {
  const hashedPassword = bcrypt.hashSync('Tarnov2024!', 10);
  fs.writeFileSync(SUPERADMIN_FILE, JSON.stringify({
    email: 'admin@tarnov.uz',
    password: hashedPassword,
    name: 'Super Admin'
  }, null, 2));
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Faqat rasm fayllari qabul qilinadi'));
  }
});

// Helpers
function readData(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}
function writeData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function getRestaurantFile(id) {
  return path.join(RESTAURANTS_DIR, `${id}.json`);
}
function getAllRestaurants() {
  if (!fs.existsSync(RESTAURANTS_DIR)) return [];
  return fs.readdirSync(RESTAURANTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => readData(path.join(RESTAURANTS_DIR, f)))
    .filter(Boolean);
}
function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// Auth middleware
function auth(roles) {
  return (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (roles && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Ruxsat yo\'q' });
      }
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Token yaroqsiz' });
    }
  };
}

// ==================== AUTH ====================

app.post('/api/auth/login', async (req, res) => {
  const { loginType, email, password, restaurantId, pin } = req.body;

  if (loginType === 'superadmin') {
    const admin = readData(SUPERADMIN_FILE);
    if (!admin || admin.email !== email)
      return res.status(401).json({ error: 'Noto\'g\'ri email yoki parol' });
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ error: 'Noto\'g\'ri email yoki parol' });
    const token = jwt.sign({ role: 'superadmin', name: admin.name }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, maxAge: 86400000, sameSite: 'lax' });
    return res.json({ success: true, role: 'superadmin', redirect: '/super-admin.html' });
  }

  if (loginType === 'restaurant') {
    const restaurants = getAllRestaurants();
    const restaurant = restaurants.find(r => r.adminEmail === email && r.active);
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
    if (!restaurantId || !pin)
      return res.status(400).json({ error: 'Restoran va PIN kiritish shart' });
    const restaurant = readData(getRestaurantFile(restaurantId));
    if (!restaurant || !restaurant.active)
      return res.status(404).json({ error: 'Restoran topilmadi' });
    const waiter = restaurant.waiters?.find(w => w.pin === pin && w.active);
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
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json(decoded);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/restaurants/list', (req, res) => {
  const list = getAllRestaurants()
    .filter(r => r.active)
    .map(r => ({ id: r.id, name: r.name, location: r.location }));
  res.json(list);
});

// ==================== SUPER ADMIN ====================

app.get('/api/super/dashboard', auth(['superadmin']), (req, res) => {
  const restaurants = getAllRestaurants();
  res.json({
    total: restaurants.length,
    active: restaurants.filter(r => r.active).length,
    inactive: restaurants.filter(r => !r.active).length,
    totalWaiters: restaurants.reduce((s, r) => s + (r.waiters?.length || 0), 0),
    totalMenuItems: restaurants.reduce((s, r) => s + (r.menu?.length || 0), 0),
    totalRevenue: restaurants.reduce((s, r) => s + (r.planPrice || 0), 0),
    restaurants: restaurants.map(r => ({
      id: r.id, name: r.name, location: r.location, active: r.active,
      plan: r.plan, planPrice: r.planPrice, adminEmail: r.adminEmail,
      waitersCount: r.waiters?.length || 0, menuCount: r.menu?.length || 0,
      questionsCount: r.questions?.length || 0, createdAt: r.createdAt
    }))
  });
});

app.post('/api/super/restaurants', auth(['superadmin']), async (req, res) => {
  const { name, location, adminEmail, adminPassword, plan, planPrice } = req.body;
  if (!name || !adminEmail || !adminPassword)
    return res.status(400).json({ error: 'Ism, email va parol majburiy' });
  const existing = getAllRestaurants().find(r => r.adminEmail === adminEmail);
  if (existing) return res.status(400).json({ error: 'Bu email allaqachon mavjud' });
  const restaurant = {
    id: uuidv4(), name, location: location || '', active: true,
    plan: plan || 'basic', planPrice: parseInt(planPrice) || 0,
    adminEmail, adminPassword: await bcrypt.hash(adminPassword, 10),
    createdAt: new Date().toISOString(),
    menu: [], waiters: [], questions: [], testDays: [], announcements: [], testResults: []
  };
  writeData(getRestaurantFile(restaurant.id), restaurant);
  const { adminPassword: _, ...safe } = restaurant;
  res.json({ success: true, restaurant: safe });
});

app.put('/api/super/restaurants/:id', auth(['superadmin']), async (req, res) => {
  const restaurant = readData(getRestaurantFile(req.params.id));
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });
  const { name, location, plan, planPrice, active, adminPassword, adminEmail } = req.body;
  if (name) restaurant.name = name;
  if (location !== undefined) restaurant.location = location;
  if (plan) restaurant.plan = plan;
  if (planPrice !== undefined) restaurant.planPrice = parseInt(planPrice);
  if (active !== undefined) restaurant.active = Boolean(active);
  if (adminEmail) restaurant.adminEmail = adminEmail;
  if (adminPassword) restaurant.adminPassword = await bcrypt.hash(adminPassword, 10);
  writeData(getRestaurantFile(req.params.id), restaurant);
  res.json({ success: true });
});

app.delete('/api/super/restaurants/:id', auth(['superadmin']), (req, res) => {
  const file = getRestaurantFile(req.params.id);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Restoran topilmadi' });
  fs.unlinkSync(file);
  res.json({ success: true });
});

app.patch('/api/super/restaurants/:id/toggle', auth(['superadmin']), (req, res) => {
  const restaurant = readData(getRestaurantFile(req.params.id));
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });
  restaurant.active = !restaurant.active;
  writeData(getRestaurantFile(req.params.id), restaurant);
  res.json({ success: true, active: restaurant.active });
});

// ==================== RESTAURANT ADMIN ====================

app.get('/api/restaurant/info', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const { adminPassword, ...safe } = r;
  res.json(safe);
});

// Menu
app.get('/api/restaurant/menu', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  res.json(r.menu || []);
});

app.post('/api/restaurant/menu', auth(['restaurant']), upload.single('image'), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const { name, category, description, ingredients, allergens, price, servingSuggestion } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'Taom nomi va kategoriya majburiy' });
  const item = {
    id: uuidv4(), name, category,
    description: description || '',
    ingredients: ingredients ? ingredients.split(',').map(i => i.trim()).filter(Boolean) : [],
    allergens: allergens ? allergens.split(',').map(a => a.trim()).filter(Boolean) : [],
    price: parseInt(price) || 0,
    servingSuggestion: servingSuggestion || '',
    image: req.file ? `/uploads/${req.file.filename}` : null,
    createdAt: new Date().toISOString()
  };
  r.menu = r.menu || [];
  r.menu.push(item);
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true, item });
});

app.put('/api/restaurant/menu/:itemId', auth(['restaurant']), upload.single('image'), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const idx = r.menu?.findIndex(m => m.id === req.params.itemId);
  if (idx === undefined || idx === -1) return res.status(404).json({ error: 'Taom topilmadi' });
  const { name, category, description, ingredients, allergens, price, servingSuggestion } = req.body;
  const item = r.menu[idx];
  if (name) item.name = name;
  if (category) item.category = category;
  if (description !== undefined) item.description = description;
  if (ingredients !== undefined) item.ingredients = ingredients.split(',').map(i => i.trim()).filter(Boolean);
  if (allergens !== undefined) item.allergens = allergens.split(',').map(a => a.trim()).filter(Boolean);
  if (price !== undefined) item.price = parseInt(price) || 0;
  if (servingSuggestion !== undefined) item.servingSuggestion = servingSuggestion;
  if (req.file) item.image = `/uploads/${req.file.filename}`;
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true, item });
});

app.delete('/api/restaurant/menu/:itemId', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  r.menu = r.menu?.filter(m => m.id !== req.params.itemId) || [];
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true });
});

// Waiters
app.get('/api/restaurant/waiters', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  res.json(r.waiters || []);
});

app.post('/api/restaurant/waiters', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const { name, pin } = req.body;
  if (!name || !pin || !/^\d{4}$/.test(pin))
    return res.status(400).json({ error: 'Ism va 4 raqamli PIN kiritish shart' });
  if (r.waiters?.find(w => w.pin === pin))
    return res.status(400).json({ error: 'Bu PIN allaqachon mavjud' });
  const waiter = { id: uuidv4(), name, pin, active: true, createdAt: new Date().toISOString() };
  r.waiters = r.waiters || [];
  r.waiters.push(waiter);
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true, waiter });
});

app.put('/api/restaurant/waiters/:waiterId', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const idx = r.waiters?.findIndex(w => w.id === req.params.waiterId);
  if (idx === undefined || idx === -1) return res.status(404).json({ error: 'Ofitsiant topilmadi' });
  const { name, pin, active } = req.body;
  const waiter = r.waiters[idx];
  if (name) waiter.name = name;
  if (pin && /^\d{4}$/.test(pin)) {
    if (r.waiters.find(w => w.pin === pin && w.id !== req.params.waiterId))
      return res.status(400).json({ error: 'Bu PIN allaqachon mavjud' });
    waiter.pin = pin;
  }
  if (active !== undefined) waiter.active = Boolean(active);
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true, waiter });
});

app.delete('/api/restaurant/waiters/:waiterId', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  r.waiters = r.waiters?.filter(w => w.id !== req.params.waiterId) || [];
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true });
});

// Questions
app.get('/api/restaurant/questions', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  res.json(r.questions || []);
});

app.post('/api/restaurant/questions', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  let { question, options, correctAnswer, difficulty, menuItemId } = req.body;
  if (!question || !options || correctAnswer === undefined || !difficulty)
    return res.status(400).json({ error: 'Barcha maydonlar to\'ldirilishi shart' });
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch { options = options.split('|'); }
  }
  if (!Array.isArray(options) || options.length < 2)
    return res.status(400).json({ error: 'Kamida 2 ta javob varianti kerak' });
  const q = {
    id: uuidv4(), question, options,
    correctAnswer: parseInt(correctAnswer),
    difficulty, menuItemId: menuItemId || null,
    createdAt: new Date().toISOString()
  };
  r.questions = r.questions || [];
  r.questions.push(q);
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true, question: q });
});

app.put('/api/restaurant/questions/:qId', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const idx = r.questions?.findIndex(q => q.id === req.params.qId);
  if (idx === undefined || idx === -1) return res.status(404).json({ error: 'Savol topilmadi' });
  let { question, options, correctAnswer, difficulty, menuItemId } = req.body;
  const q = r.questions[idx];
  if (question) q.question = question;
  if (options) {
    if (typeof options === 'string') {
      try { options = JSON.parse(options); } catch { options = options.split('|'); }
    }
    q.options = options;
  }
  if (correctAnswer !== undefined) q.correctAnswer = parseInt(correctAnswer);
  if (difficulty) q.difficulty = difficulty;
  if (menuItemId !== undefined) q.menuItemId = menuItemId;
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true, question: q });
});

app.delete('/api/restaurant/questions/:qId', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  r.questions = r.questions?.filter(q => q.id !== req.params.qId) || [];
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true });
});

// Test Days
app.get('/api/restaurant/testdays', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  res.json(r.testDays || []);
});

app.post('/api/restaurant/testdays', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const { date } = req.body;
  r.testDays = r.testDays || [];
  if (!r.testDays.includes(date)) r.testDays.push(date);
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true, testDays: r.testDays });
});

app.delete('/api/restaurant/testdays/:date', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  r.testDays = r.testDays?.filter(d => d !== req.params.date) || [];
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true });
});

// Announcements
app.get('/api/restaurant/announcements', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  res.json(r.announcements || []);
});

app.post('/api/restaurant/announcements', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Sarlavha va matn majburiy' });
  const ann = { id: uuidv4(), title, content, createdAt: new Date().toISOString() };
  r.announcements = r.announcements || [];
  r.announcements.unshift(ann);
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true, announcement: ann });
});

app.delete('/api/restaurant/announcements/:id', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  r.announcements = r.announcements?.filter(a => a.id !== req.params.id) || [];
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true });
});

// Results
app.get('/api/restaurant/results', auth(['restaurant']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  res.json((r.testResults || []).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)));
});

// ==================== WAITER ====================

app.get('/api/waiter/info', auth(['waiter']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const waiter = r.waiters?.find(w => w.id === req.user.waiterId);
  const today = new Date().toISOString().split('T')[0];
  res.json({
    waiter,
    restaurant: { id: r.id, name: r.name, location: r.location },
    isTestDay: r.testDays?.includes(today) || false,
    announcements: (r.announcements || []).slice(0, 3)
  });
});

app.get('/api/waiter/menu', auth(['waiter']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const today = new Date().toISOString().split('T')[0];
  if (r.testDays?.includes(today)) {
    return res.json({ hidden: true, message: 'Bugun test kuni! Menyu yashirilgan.' });
  }
  res.json({ hidden: false, menu: r.menu || [] });
});

app.get('/api/waiter/test/start', auth(['waiter']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const today = new Date().toISOString().split('T')[0];
  if (!r.testDays?.includes(today))
    return res.status(403).json({ error: 'Bugun test kuni emas' });
  const taken = r.testResults?.find(x => x.waiterId === req.user.waiterId && x.date === today);
  if (taken) return res.status(400).json({ error: 'Siz bugun allaqachon test topshirdingiz', result: taken });
  const qs = r.questions || [];
  const easy = qs.filter(q => q.difficulty === 'easy');
  const medium = qs.filter(q => q.difficulty === 'medium');
  const hard = qs.filter(q => q.difficulty === 'hard');
  if (easy.length < 10 || medium.length < 5 || hard.length < 5) {
    return res.status(400).json({
      error: `Test uchun yetarli savol yo'q. Kerak: 10 oson, 5 o'rta, 5 qiyin. Mavjud: ${easy.length} oson, ${medium.length} o'rta, ${hard.length} qiyin`
    });
  }
  const selected = [
    ...shuffle(easy).slice(0, 10),
    ...shuffle(medium).slice(0, 5),
    ...shuffle(hard).slice(0, 5)
  ].map(q => ({
    id: q.id, question: q.question,
    options: q.options, difficulty: q.difficulty
  }));
  res.json({ questions: selected, timePerQuestion: 30 });
});

app.post('/api/waiter/test/submit', auth(['waiter']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const today = new Date().toISOString().split('T')[0];
  if (!r.testDays?.includes(today))
    return res.status(403).json({ error: 'Bugun test kuni emas' });
  const { answers } = req.body;
  const qs = r.questions || [];
  let easyScore = 0, easyTotal = 0, mediumScore = 0, mediumTotal = 0, hardScore = 0, hardTotal = 0;
  const breakdown = [];
  Object.entries(answers || {}).forEach(([qId, selected]) => {
    const q = qs.find(x => x.id === qId);
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
  const waiter = r.waiters?.find(w => w.id === req.user.waiterId);
  const result = {
    id: uuidv4(), waiterId: req.user.waiterId, waiterName: waiter?.name || req.user.waiterName,
    date: today, score: percentage, totalCorrect, totalQuestions,
    easyScore, easyTotal, mediumScore, mediumTotal, hardScore, hardTotal,
    hasCertificate: percentage >= 90, breakdown, submittedAt: new Date().toISOString()
  };
  r.testResults = r.testResults || [];
  r.testResults.push(result);
  writeData(getRestaurantFile(req.user.restaurantId), r);
  res.json({ success: true, result });
});

app.get('/api/waiter/history', auth(['waiter']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  const history = (r.testResults || []).filter(x => x.waiterId === req.user.waiterId);
  res.json(history.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.get('/api/waiter/announcements', auth(['waiter']), (req, res) => {
  const r = readData(getRestaurantFile(req.user.restaurantId));
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  res.json(r.announcements || []);
});

// Start
app.listen(PORT, () => {
  console.log(`\n✦ Tarnov Restaurant Platform`);
  console.log(`✦ Running on http://localhost:${PORT}`);
  console.log(`✦ Super Admin: admin@tarnov.uz / Tarnov2024!\n`);
});
