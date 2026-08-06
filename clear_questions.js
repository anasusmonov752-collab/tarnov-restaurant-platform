const https = require('https');
const HOST = 'tarnov-restaurant-platform.onrender.com';

// ← Bu yerga restoran admin email va parolini kiriting
const RESTAURANT_EMAIL = process.argv[2] || '';
const RESTAURANT_PASS  = process.argv[3] || '';

function req(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: HOST, port: 443, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? {'Content-Length': Buffer.byteLength(data)} : {}),
        ...(cookie ? {'Cookie': cookie} : {}),
      }
    };
    const r = https.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        const sc = res.headers['set-cookie'];
        try { resolve({body: JSON.parse(buf), sc}); }
        catch { resolve({body: buf, sc}); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  if (!RESTAURANT_EMAIL || !RESTAURANT_PASS) {
    console.log('Ishlatish: node clear_questions.js <email> <parol>');
    return;
  }

  console.log('Login qilinmoqda...');
  const login = await req('POST', '/api/auth/login', {
    loginType: 'restaurant', email: RESTAURANT_EMAIL, password: RESTAURANT_PASS
  });
  if (!login.body.success) { console.error('Login failed:', login.body); return; }
  const cookie = login.sc.map(c => c.split(';')[0]).join('; ');
  console.log('Login muvaffaqiyatli!');

  console.log('Savollar o\'chirilmoqda...');
  const result = await req('DELETE', '/api/restaurant/questions', null, cookie);
  console.log('Natija:', result.body);
}

main().catch(console.error);
