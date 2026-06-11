const https = require('https');
const BASE = 'https://tarnov-restaurant-platform.onrender.com';

function req(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname, path: url.pathname, method,
      headers: { 'Content-Type':'application/json','Content-Length':Buffer.byteLength(data),'Cookie':cookie||'' }
    };
    const r = https.request(opts, res => {
      let b=''; res.on('data',d=>b+=d); res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:b}));
    });
    r.on('error',reject); r.write(data); r.end();
  });
}

async function main() {
  const login = await req('POST','/api/auth/login',{loginType:'restaurant',email:'admin@tarnov.uz',password:'anas2024'});
  const cookie = (login.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ');
  console.log('Login:', login.status);

  // ══════════════════════════════════════════════
  //  1. MENYU: Kategoriyalarni to'g'irlash
  // ══════════════════════════════════════════════

  // Mangal → Turk (Turk oshxonasi taomlar)
  const toTurk = [
    'bfb4db20', // Turk assorti
    '60a15247', // Iskandar
    '1270123a', // Donar Beyti
    '670ffbc9', // Pilov usti Donar
    '7d1f9f7b', // Donar Cheeseburger
    '21b4b7cf', // Turk kebab
    'a5f12260', // Adana achchiq
    '5aca3d4b', // Beyti durum
    'c0537da2', // Cheeseburger
    'e7917686', // Qanot kebab
    '21793cfc', // Adana kabob
    '63cdda4e', // Mini burger
    '92f2b4d4', // Shef burgeri
  ];

  // Steyk → Mangal (Mangal otdeli taomlar)
  const toMangal = [
    'ee9a88ba', // Bedro steyk (240-270g)
    'a6e86f97', // Bon file steyk (240-260g)
    'f9a25a28', // Grudka steyk (450-500g)
    '7d324da6', // Koreyka steyk (220-250g)
    'd7d64689', // Ribay biftek (400-450g)
  ];

  console.log('\n── Menyu: Mangal → Turk (13 ta) ──');
  for (const id of toTurk) {
    // Find full ID from menu
    const r = await req('GET', '/api/restaurant/menu', {}, cookie);
    const menu = JSON.parse(r.body);
    const arr = Array.isArray(menu) ? menu : (menu.menu||[]);
    const item = arr.find(x => x.id.startsWith(id));
    if (!item) { console.log('  ✗ Topilmadi: '+id); continue; }
    const upd = await req('PUT', `/api/restaurant/menu/${item.id}`, { category:'Turk' }, cookie);
    console.log(upd.status===200 ? `  ✓ ${item.name} → Turk` : `  ✗ ${item.name}: ${upd.body.substring(0,40)}`);
    await new Promise(r=>setTimeout(r,60));
  }

  console.log('\n── Menyu: Steyk → Mangal (5 ta) ──');
  for (const id of toMangal) {
    const r = await req('GET', '/api/restaurant/menu', {}, cookie);
    const menu = JSON.parse(r.body);
    const arr = Array.isArray(menu) ? menu : (menu.menu||[]);
    const item = arr.find(x => x.id.startsWith(id));
    if (!item) { console.log('  ✗ Topilmadi: '+id); continue; }
    const upd = await req('PUT', `/api/restaurant/menu/${item.id}`, { category:'Mangal' }, cookie);
    console.log(upd.status===200 ? `  ✓ ${item.name} → Mangal` : `  ✗ ${item.name}: ${upd.body.substring(0,40)}`);
    await new Promise(r=>setTimeout(r,60));
  }

  // ══════════════════════════════════════════════
  //  2. SAVOLLAR: Noto'g'ri kategoriyali savollar
  // ══════════════════════════════════════════════
  console.log('\n── Savollar yuklanmoqda... ──');
  const qRes = await req('GET', '/api/restaurant/questions', {}, cookie);
  const qArr = JSON.parse(qRes.body);
  const questions = Array.isArray(qArr) ? qArr : (qArr.questions||[]);
  console.log('Jami savollar:', questions.length);

  const turkItems = ['iskandar','donar','adana','beyti','turk','cheeseburger','mini burger','shef burger','qanot kebab'];
  const mangalRealItems = ['mangal qanot','mangal assorti','makkajo\'xori','sabzavotli','ribay','bedro steyk','bon file','grudka','koreyka','biftek'];

  const qFixes = [];

  questions.forEach(q => {
    const text = (q.question + ' ' + (q.options||[]).join(' ')).toLowerCase();
    const correctOpt = (q.options?.[q.correctAnswer]||'').toLowerCase();
    const opts = (q.options||[]).map(o=>o.toLowerCase());

    // ----- Tur 1: Turk taomini "Mangal" deb javob bergan -----
    const isTurkItem = turkItems.some(t => text.includes(t));
    const correctIsMangal = correctOpt.includes('mangal') && !correctOpt.includes('turk');

    if (isTurkItem && correctIsMangal) {
      // To'g'ri javobni Mangal → Turk ga o'zgartirish
      const newOpts = (q.options||[]).map(o => {
        if (o.toLowerCase().includes('mangal') && !o.toLowerCase().includes('assorti') && !o.toLowerCase().includes('3 kishi') && !o.toLowerCase().includes('6 kishi')) {
          return o.replace(/Mangal/g,'Turk').replace(/mangal/g,'Turk');
        }
        return o;
      });
      const newQ = q.question.replace(/Mangal/g,'Turk').replace(/mangal/g,'Turk');
      qFixes.push({ id:q.id, q:newQ, o:newOpts, a:q.correctAnswer, d:q.difficulty, why:'Turk taomi → Turk bo\'lim' });
    }

    // ----- Tur 2: "Steyk" bo'limini javob sifatida bergan -----
    if (correctOpt === 'steyk' || correctOpt.includes('steyk bo\'lim')) {
      const newOpts = (q.options||[]).map(o => o==='Steyk' ? 'Mangal' : o);
      const newQ = q.question.replace(/Steyk bo'lim/g,'Mangal bo\'lim').replace(/Steyk otdel/g,'Mangal');
      qFixes.push({ id:q.id, q:newQ, o:newOpts, a:q.correctAnswer, d:q.difficulty, why:'Steyk → Mangal bo\'lim' });
    }

    // ----- Tur 3: Steyk items (bedro, bon file, grudka, koreyka, ribay) → bo'lim Mangal -----
    const isSteykItem = ['bedro steyk','bon file steyk','grudka steyk','koreyka steyk','ribay biftek'].some(s=>text.includes(s));
    if (isSteykItem && opts.some(o=>o==='steyk')) {
      const newOpts = (q.options||[]).map(o => o==='Steyk' ? 'Mangal' : o);
      qFixes.push({ id:q.id, q:q.question, o:newOpts, a:q.correctAnswer, d:q.difficulty, why:'Steyk item bo\'limi → Mangal' });
    }

    // ----- Tur 4: "Steyk bo'limida eng arzon/qimmat" kabi savollar -----
    if (text.includes('steyk bo\'lim') || (text.includes('steyk') && (text.includes('eng arzon') || text.includes('eng qimmat') || text.includes('nechta')))) {
      const newQ = q.question
        .replace(/Steyk bo'lim/gi, 'Mangal bo\'lim')
        .replace(/steyk bo'lim/gi, 'Mangal bo\'lim');
      const newOpts = (q.options||[]).map(o=>o.replace(/Steyk/g,'Mangal'));
      qFixes.push({ id:q.id, q:newQ, o:newOpts, a:q.correctAnswer, d:q.difficulty, why:'Steyk bo\'lim → Mangal bo\'lim' });
    }
  });

  // Deduplicate by id
  const uniqueFixes = [...new Map(qFixes.map(f=>[f.id,f])).values()];
  console.log('\n── Savollar: To\'g\'irlanadigan ──', uniqueFixes.length,'ta');

  let qOk=0, qFail=0;
  for (const f of uniqueFixes) {
    const r = await req('PUT', `/api/restaurant/questions/${f.id}`,
      { question:f.q, options:f.o, correctAnswer:f.a, difficulty:f.d }, cookie);
    if (r.status===200) {
      qOk++;
      console.log(`  ✓ [${f.why}] ${f.q.substring(0,55)}`);
    } else {
      qFail++;
      console.log(`  ✗ ${f.id}: ${r.body.substring(0,50)}`);
    }
    await new Promise(r=>setTimeout(r,80));
  }

  console.log(`\n═══════════════════════════════`);
  console.log(`Menyu: Turk(13) + Mangal(5) to'g'irlandi`);
  console.log(`Savollar: ✅ ${qOk} ta | ✗ ${qFail} ta`);
}

main().catch(console.error);
