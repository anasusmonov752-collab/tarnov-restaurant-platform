const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { connectDB } = require('./src/config/db');
const { errorHandler } = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET env variable not set — using insecure default!');
}

// ── Security headers ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false // CDN resources (Lucide, fonts) need this off
}));
app.set('trust proxy', 1);

// ── Body & cookies ────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── Static files ──────────────────────────────────────────────────
// Render'da /app/data persistent disk sifatida ulangan (render.yaml) — bor bo'lsa undan foydalanamiz,
// aks holda (lokal dev) loyiha ichidagi uploads/ papkasi ishlatiladi.
const UPLOADS_DIR = fs.existsSync('/app/data') ? '/app/data/uploads' : path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // HTML — hech qachon keshlamasin, har safar server dan olsin
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    } else if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      // CSS/JS — 1 soat kesh, ETag bilan yangilanishni tekshiradi
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }
}));

// ── Health check (UptimeRobot / keep-alive) ────────────────────────
app.get('/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Public route: restaurant list for waiter login ─────────────────
const Restaurant = require('./src/models/Restaurant');
app.get('/api/restaurants/list', async (req, res, next) => {
  try {
    const list = await Restaurant.find({ active: true }, 'id name location');
    res.json(list.map(r => ({ id: r.id, name: r.name, location: r.location })));
  } catch (err) { next(err); }
});

// ── API routes ─────────────────────────────────────────────────────
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/super', require('./src/routes/super'));
app.use('/api/restaurant', require('./src/routes/restaurant'));
app.use('/api/waiter', require('./src/routes/waiter'));

// ── Global error handler ───────────────────────────────────────────
app.use(errorHandler);

// ── Start ──────────────────────────────────────────────────────────
async function startServer() {
  let retries = 5;
  while (retries > 0) {
    try {
      await connectDB();
      break;
    } catch (err) {
      retries--;
      console.error(`MongoDB ulanish xatosi (${5 - retries}/5):`, err.message);
      if (retries === 0) {
        console.error('MongoDB ga ulanib bo\'lmadi. MONGODB_URI ni tekshiring!');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  app.listen(PORT, () => {
    console.log('✦ Tarnov Restaurant Platform');
    console.log(`✦ Running on http://localhost:${PORT}`);
    console.log(`✦ ENV: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
