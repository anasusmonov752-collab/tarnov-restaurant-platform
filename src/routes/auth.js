const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { JWT_SECRET } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const SuperAdmin = require('../models/SuperAdmin');
const Restaurant = require('../models/Restaurant');

const router = express.Router();

// TalentHub agentligining bosh sahifasi (login va qayta kirishda)
const AGENCY_HOME = '/talenthub.html';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Juda ko\'p urinish. 15 daqiqadan so\'ng qayta urinib ko\'ring.' },
  standardHeaders: true,
  legacyHeaders: false
});

// PIN tanlab topish: IP almashtirib urinilsa ham restoran bo'yicha chegara (10 ta 4 raqamli
// PIN tanlovi ~500 urinishda topilardi)
const pinFails = new Map();             // restaurantId -> { n, since }
const PIN_MAX = 20, PIN_WIN = 15 * 60e3;
const pinBlocked = id => { const x = pinFails.get(id); return !!x && Date.now() - x.since < PIN_WIN && x.n >= PIN_MAX; };
const pinFail = id => {
  const x = pinFails.get(id);
  if (!x || Date.now() - x.since >= PIN_WIN) pinFails.set(id, { n: 1, since: Date.now() }); else x.n++;
  if (pinFails.size > 2000) pinFails.delete(pinFails.keys().next().value);
};

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  // Faqat SATR: {"email":{"$ne":""}} kabi obyekt to'g'ridan-to'g'ri so'rovga tushib, emailni
  // bilmasdan parol tanlashga (yoki $regex bilan emailni aniqlashga) imkon berardi
  const str = x => (typeof x === 'string' ? x : '');
  const loginType = str(req.body && req.body.loginType);
  const email = str(req.body && req.body.email).trim().toLowerCase();
  const password = str(req.body && req.body.password);
  const restaurantId = str(req.body && req.body.restaurantId);
  const pin = str(req.body && req.body.pin);
  if ((loginType === 'superadmin' || loginType === 'restaurant') && (!email || !password)) {
    return res.status(400).json({ error: 'Email va parolni kiriting' });
  }

  if (loginType === 'superadmin') {
    const admin = await SuperAdmin.findOne({ email });
    if (!admin) return res.status(401).json({ error: 'Noto\'g\'ri email yoki parol' });
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ error: 'Noto\'g\'ri email yoki parol' });
    const token = jwt.sign({ role: 'superadmin', name: admin.name }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, maxAge: 86400000, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    return res.json({ success: true, role: 'superadmin', redirect: '/super-admin.html' });
  }

  if (loginType === 'restaurant') {
    const restaurant = await Restaurant.findOne({ adminEmail: email, active: true });
    if (!restaurant) return res.status(401).json({ error: 'Noto\'g\'ri email yoki parol' });
    const valid = await bcrypt.compare(password, restaurant.adminPassword);
    if (!valid) return res.status(401).json({ error: 'Noto\'g\'ri email yoki parol' });
    const kind = restaurant.kind || 'restaurant';
    const token = jwt.sign(
      { role: 'restaurant', restaurantId: restaurant.id, restaurantName: restaurant.name, kind },
      JWT_SECRET, { expiresIn: '24h' }
    );
    res.cookie('token', token, { httpOnly: true, maxAge: 86400000, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    // Agentlik (TalentHub) — o'z paneliga; restoran — trening paneliga
    return res.json({ success: true, role: 'restaurant', kind,
      redirect: kind === 'agency' ? AGENCY_HOME : '/restaurant-admin.html' });
  }

  if (loginType === 'waiter') {
    if (!restaurantId || !pin) return res.status(400).json({ error: 'Restoran va PIN kiritish shart' });
    if (pinBlocked(restaurantId)) return res.status(429).json({ error: 'Juda ko\'p noto\'g\'ri PIN. 15 daqiqadan so\'ng qayta urinib ko\'ring.' });
    const restaurant = await Restaurant.findOne({ id: restaurantId, active: true });
    if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });
    const waiter = restaurant.waiters.find(w => w.pin === pin && w.active);
    if (!waiter) { pinFail(restaurantId); return res.status(401).json({ error: 'Noto\'g\'ri PIN' }); }
    const token = jwt.sign(
      { role: 'waiter', restaurantId: restaurant.id, restaurantName: restaurant.name, waiterId: waiter.id, waiterName: waiter.name, waiterRole: waiter.role || 'ofitsiant' },
      JWT_SECRET, { expiresIn: '12h' }
    );
    res.cookie('token', token, { httpOnly: true, maxAge: 43200000, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    return res.json({ success: true, role: 'waiter', redirect: '/waiter.html' });
  }

  return res.status(400).json({ error: 'Noto\'g\'ri login turi' });
}));

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json(jwt.verify(token, JWT_SECRET));
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
