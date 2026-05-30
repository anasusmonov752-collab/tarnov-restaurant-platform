const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { JWT_SECRET } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const SuperAdmin = require('../models/SuperAdmin');
const Restaurant = require('../models/Restaurant');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Juda ko\'p urinish. 15 daqiqadan so\'ng qayta urinib ko\'ring.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
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
