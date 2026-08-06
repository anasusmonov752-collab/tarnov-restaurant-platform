// Lokal preview/dev uchun launcher.
// Prod (Render) bunga tegmaydi: u to'g'ridan-to'g'ri `npm start` → server.js ishlatadi.
//
// Maxfiy qiymatlar (MONGODB_URI, JWT_SECRET, GEMINI_API_KEY) .env faylida —
// bu fayl gitga tushmaydi. Namuna uchun: .env.example
// .env ni SHU fayl yonidan o'qiymiz — protsess qaysi papkadan ishga
// tushirilganidan qat'i nazar topiladi.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Ba'zi tarmoqlarda tizim DNS'i MongoDB Atlas SRV yozuvini topa olmaydi.
process.env.DNS_OVERRIDE = process.env.DNS_OVERRIDE || '8.8.8.8,1.1.1.1';

if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI topilmadi. .env faylini yarating (.env.example dan nusxa oling).');
  process.exit(1);
}

require('./server.js');
