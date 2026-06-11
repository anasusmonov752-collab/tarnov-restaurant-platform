const https = require('https');
const BASE = 'https://tarnov-restaurant-platform.onrender.com';

function req(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname, path: url.pathname, method,
      headers: { 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(data), 'Cookie':cookie||'' }
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

  // ── 1. Okroshka menyuga qayta qo'shish ──
  console.log('\n1. Okroshka menyuga qo\'shilmoqda...');
  const menuRes = await req('POST','/api/restaurant/menu',{
    name:'Okroshka', category:'Birinchi taom', price:42000,
    description:'Mol go\'shti, nordon sut, qaymoq, yangi bodring va o\'tlar, kartoshka'
  }, cookie);
  console.log(menuRes.status===200 ? '✓ Okroshka qo\'shildi' : '✗ '+menuRes.body);

  // ── 2. Savollarni to'g'irlash ──
  const fixes = [
    // Okroshka menyuda yo'q → Manpar haqida yangi savol
    { id:'89760dac-934f-46dd-8129-df381ed8d9a4',
      q:"Okroshka qaysi bo'limda va narxi qancha?",
      o:["Salatlar, 38 000","Birinchi taom, 42 000","Ikkinchi taom, 46 000","Uyg'ur taomlari, 42 000"],
      a:1, d:"easy" },

    // Okroshkaning ingredientlari → haqiqiy ma'lumot bilan qoldirish (to'g'ri savol)
    { id:'e6e66fd8-ac6c-4f45-8504-56dc8cde7af1',
      q:"Okroshkaning asosiy ingredientlaridan biri qaysi?",
      o:["Guruch va sabzi","Nordon sut va bodring","Makaron va tuxum","Guruch va piyoz"],
      a:1, d:"easy" },

    // Noxot sho'rak → Noxot shorak (1-chi)
    { id:'6f8f7e51-b954-4428-ae0d-b30976b27123',
      q:"Noxot shorak narxi qancha?",
      o:["55 000","60 000","64 000","68 000"],
      a:2, d:"medium" },

    // Noxot sho'rak → Noxot shorak (2-chi)
    { id:'b247b719-2a8a-449a-a3e5-d0b6b38bdcd1',
      q:"Halim (70 000) va Noxot shorak (64 000) narxi farqi qancha?",
      o:["4 000","5 000","6 000","7 000"],
      a:2, d:"hard" },

    // Noxot sho'rak → Noxot shorak (3-chi, duplicate)
    { id:'80f49001-95c6-4525-8425-d70453e54a87',
      q:"Noxot shorak qaysi bo'limda va narxi qancha?",
      o:["Kabob, 60 000","Ikkinchi taom, 64 000","Uyg'ur taomlari, 70 000","Birinchi taom, 57 000"],
      a:1, d:"medium" },

    // Tabaka set → Osh set haqida
    { id:'45a318cc-4bfb-4262-add6-f0e6d715cba2',
      q:"Set bo'limida qancha xil set bor?",
      o:["4 ta","5 ta","6 ta","7 ta"],
      a:2, d:"easy" },

    // Assorti set narxi → Set eng arzon haqida
    { id:'389f1fb7-5382-4025-a022-5a085a1926c3',
      q:"Set bo'limida eng arzon set qaysi va narxi qancha?",
      o:["Mangal set — 59 000","Qovurma set — 59 000","KFC set — 42 000","Kabob set — 62 000"],
      a:2, d:"hard" },

    // Set bo'limida eng qimmat → Osh set (66 000)
    { id:'70c7fa35-83da-48a0-a9ad-50d42276f2a7',
      q:"Set bo'limida eng qimmat set qaysi?",
      o:["Mangal set (59 000)","Kabob set (62 000)","Sumboro set (62 000)","Osh set (66 000)"],
      a:3, d:"hard" },

    // Borjomi 0.33 → Chortok 0.3l
    { id:'96811c46-e0a2-4037-8f95-3ba81b7edf4e',
      q:"Chortok (0.3l) narxi qancha?",
      o:["8 000","10 000","12 000","15 000"],
      a:2, d:"medium" },
  ];

  console.log('\n2. Savollar to\'g\'irlandi:');
  let ok=0, fail=0;
  for (const f of fixes) {
    const r = await req('PUT', `/api/restaurant/questions/${f.id}`,
      { question:f.q, options:f.o, correctAnswer:f.a, difficulty:f.d }, cookie);
    if (r.status===200) { ok++; console.log(`  ✓ [${f.d}] ${f.q.substring(0,55)}`); }
    else { fail++; console.log(`  ✗ ${f.id}: ${r.body.substring(0,60)}`); }
    await new Promise(r=>setTimeout(r,80));
  }
  console.log(`\n✅ To'g'irlandi: ${ok} | ✗ Xato: ${fail}`);
}

main().catch(console.error);
