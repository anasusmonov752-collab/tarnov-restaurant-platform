// Lokal dev: ba'zi tarmoqlarda tizim DNS'i MongoDB Atlas SRV yozuvini topa olmaydi.
// DNS_OVERRIDE="8.8.8.8,1.1.1.1" berilsa shu serverlar ishlatiladi (prod'da berilmaydi).
if (process.env.DNS_OVERRIDE) require('dns').setServers(process.env.DNS_OVERRIDE.split(','));

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

// ── Public certificate (ulashiladigan havola, auth talab qilinmaydi) ─
app.get('/api/cert/:id', async (req, res, next) => {
  try {
    const r = await Restaurant.findOne({ 'testResults.id': req.params.id }, 'name testResults');
    const result = r?.testResults?.find(t => t.id === req.params.id);
    if (!result || !result.hasCertificate) return res.status(404).json({ error: 'Sertifikat topilmadi' });
    res.json({
      waiterName: result.waiterName,
      restaurantName: r.name,
      score: result.score,
      date: result.date,
      easyScore: result.easyScore, easyTotal: result.easyTotal,
      mediumScore: result.mediumScore, mediumTotal: result.mediumTotal,
      hardScore: result.hardScore, hardTotal: result.hardTotal,
      certNo: 'RO-' + String(result.id).replace(/-/g, '').slice(0, 8).toUpperCase()
    });
  } catch (err) { next(err); }
});
app.get('/cert/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cert.html')));

// ── Trening videolar (GridFS'dan striming, Range bilan) ───────────
const mongooseLib = require('mongoose');
app.get('/media/training/:id', async (req, res, next) => {
  try {
    let oid;
    try { oid = new mongooseLib.mongo.ObjectId(req.params.id); } catch { return res.status(404).end(); }
    const bucket = new mongooseLib.mongo.GridFSBucket(mongooseLib.connection.db, { bucketName: 'trainingVideos' });
    const files = await bucket.find({ _id: oid }).toArray();
    if (!files.length) return res.status(404).end();
    const size = files[0].length;

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const range = req.headers.range && req.headers.range.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      let start = range[1] ? parseInt(range[1]) : 0;
      let end = range[2] ? parseInt(range[2]) : size - 1;
      if (start >= size) { res.status(416).setHeader('Content-Range', `bytes */${size}`); return res.end(); }
      end = Math.min(end, size - 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', end - start + 1);
      bucket.openDownloadStream(oid, { start, end: end + 1 }).on('error', next).pipe(res);
    } else {
      res.setHeader('Content-Length', size);
      bucket.openDownloadStream(oid).on('error', next).pipe(res);
    }
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
