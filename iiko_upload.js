// IIKO menyusini platformaga yuklash
const https = require('https');
const http = require('http');
const fs = require('fs');

const menu = JSON.parse(fs.readFileSync('iiko_clean_menu.json', 'utf8'));

// "Посуда" kategoriyasini o'chirish (idish-tovoq, taom emas)
const filtered = menu.filter(m => m.category !== 'Посуда');
console.log(`Import: ${filtered.length} ta taom (Посуда o'chirildi)`);

// Platform login
const BASE = 'https://tarnov-restaurant-platform.onrender.com';
const COOKIE_FILE = '/tmp/iiko_import.txt';

function request(opts, data) {
  return new Promise((resolve, reject) => {
    const mod = opts.hostname.includes('onrender') ? https : http;
    const req = mod.request(opts, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let cookie = '';

async function login() {
  const body = JSON.stringify({ loginType: 'restaurant', email: 'admin@tarnov.uz', password: 'anas2024' });
  const res = await request({
    hostname: 'tarnov-restaurant-platform.onrender.com',
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body);

  const setCookie = res.headers['set-cookie'];
  if (setCookie) {
    cookie = setCookie.map(c => c.split(';')[0]).join('; ');
    console.log('✅ Login muvaffaqiyatli');
    return true;
  }
  console.log('❌ Login xatosi:', res.body.substring(0, 200));
  return false;
}

async function clearMenu() {
  // Mavjud menyuni olish
  const res = await request({
    hostname: 'tarnov-restaurant-platform.onrender.com',
    path: '/api/restaurant/menu',
    method: 'GET',
    headers: { 'Cookie': cookie }
  });

  if (res.status !== 200) {
    console.log('Menyu olishda xato:', res.status);
    return;
  }

  const existing = JSON.parse(res.body);
  console.log(`Mavjud menyu: ${existing.length} ta taom — o'chirilmoqda...`);

  let deleted = 0;
  for (const item of existing) {
    const delRes = await request({
      hostname: 'tarnov-restaurant-platform.onrender.com',
      path: `/api/restaurant/menu/${item.id}`,
      method: 'DELETE',
      headers: { 'Cookie': cookie }
    });
    if (delRes.status === 200) deleted++;
  }
  console.log(`✅ ${deleted} ta taom o'chirildi`);
}

async function addItem(item) {
  const body = JSON.stringify({
    name: item.name,
    category: item.category,
    price: item.price,
    description: ''
  });

  const res = await request({
    hostname: 'tarnov-restaurant-platform.onrender.com',
    path: '/api/restaurant/menu',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Cookie': cookie
    }
  }, body);

  return res.status === 200 || res.status === 201;
}

async function main() {
  // Login
  const ok = await login();
  if (!ok) return;

  // Mavjud menyuni tozalash
  await clearMenu();

  // Yangi taomlarni qo'shish
  console.log(`\nYangi menyu yuklanmoqda: ${filtered.length} ta taom...`);
  let added = 0, failed = 0;

  for (let i = 0; i < filtered.length; i++) {
    const item = filtered[i];
    const success = await addItem(item);
    if (success) {
      added++;
      if (added % 20 === 0) console.log(`  ${added}/${filtered.length} ta qo'shildi...`);
    } else {
      failed++;
      console.log(`  ❌ Xato: ${item.name}`);
    }
    // Server yukini kamaytirish
    if (i % 10 === 9) await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n✅ TAYYOR! ${added} ta taom qo'shildi, ${failed} ta xato`);
}

main().catch(console.error);
