// Eski 25 ta savolni yangi standartga moslashtirish
const https = require('https');

// Eski savollar ID si va yangi versiyalari
const updates = [
  // 0. Ko'za sho'rva qaysi idishda... → narx va bo'lim
  { id: 'e881a543-b1af-4103-b887-3b2c883cfcf5',
    q: "Ko'za sho'rva narxi boshqa birinchi taomlarga (42 000) nisbatan qancha qimmat?",
    o: ["5 000 so'm qimmat","10 000 so'm qimmat","21 000 so'm qimmat","Bir xil narxda"],
    a: 2, d: "hard" },

  // 1. Manpar qaysi oshxonaga → bo'lim va narx
  { id: '85122335-f14c-4d94-a457-9640be06353d',
    q: "Manpar qaysi bo'limga kiradi va narxi qancha?",
    o: ["Uyg'ur taomlari, 50 000","Birinchi taom, 42 000","Ikkinchi taom, 46 000","Salatlar, 38 000"],
    a: 1, d: "easy" },

  // 2. Beshbarmoq nima uchun → narx va bo'lim
  { id: '7205d650-47cb-4d4f-82f1-6b9726e9ad0f',
    q: "Beshbarmoq narxi qancha?",
    o: ["75 000","82 000","89 000","95 000"],
    a: 2, d: "medium" },

  // 3. Tabaka qaysi oshxonaga → narx va kategoriya
  { id: '21131dd4-f058-46ae-a742-376a2f0696cf',
    q: "Tabaka qaysi bo'limda va narxi qancha?",
    o: ["Steyk, 46 000","Ikkinchi taom, 43 000","Kabob, 50 000","Qiyma tovuq, 40 000"],
    a: 1, d: "medium" },

  // 4. Bifshteks tarkibida nechta garnir → narx taqqoslash
  { id: 'cf40bc15-08b9-41dd-a68b-0b3e4bde7862',
    q: "Bifstrogan (57 000) va Bifshteks (46 000) narxi farqi necha?",
    o: ["9 000","10 000","11 000","12 000"],
    a: 2, d: "hard" },

  // 5. Halim taomida qaysi don → narx va bo'lim
  { id: '865e9819-0b63-442c-8819-a32fb49e1092',
    q: "Halim narxi qancha va qaysi bo'limda?",
    o: ["63 000 — Birinchi taom","70 000 — Ikkinchi taom","75 000 — Ikkinchi taom","55 000 — Uyg'ur taomlari"],
    a: 1, d: "easy" },

  // 6. Assorti 1 porsiyaning ogerligi → narx
  { id: 'cda767be-9772-43d5-94ab-4609eb83e652',
    q: "Assorti 1 porsiya narxi qancha?",
    o: ["82 000","89 000","97 000","105 000"],
    a: 2, d: "medium" },

  // 7. Okroshkaning asosi nimadan → bo'lim va narx
  { id: '89760dac-934f-46dd-8129-df381ed8d9a4',
    q: "Okroshka qaysi bo'limda va narxi qancha?",
    o: ["Salatlar, 38 000","Birinchi taom, 42 000","Ikkinchi taom, 46 000","Birinchi taom, 36 000"],
    a: 1, d: "easy" },

  // 8. Norin kg narxi va necha kishiga → aniq narx
  { id: '36a47d04-1806-4202-afea-d4e810364c42',
    q: "Norin kg narxi qancha?",
    o: ["120 000","132 000","146 000","158 000"],
    a: 2, d: "hard" },

  // 9. Xash ogerligi va vaqt → og'irlik
  { id: '43f81c81-ba2b-4d31-8298-1487a949ab28',
    q: "Xash og'irligi qancha?",
    o:["380g","400g","430g","450g"],
    a: 2, d: "hard" },

  // 10. Dolma nima ichiga o'ralgan → bo'lim va narx
  { id: '20600693-d03f-4486-a7bc-98baab9e2f7e',
    q: "Do'lma qaysi bo'limda va narxi qancha?",
    o: ["Kabob, 7 500","Ikkinchi taom, 7 500","Uyg'ur taomlari, 10 500","Salatlar, 9 000"],
    a: 1, d: "medium" },

  // 11. 3 kishi assorti narxi → yaxshi, faqat optionsni yaxshilash
  { id: 'd9f0bebc-4820-41a5-95f6-3062c3394c47',
    q: "3 kishi uchun assorti va Assorti 1 porsiya narxlari yig'indisi?",
    o: ["352 000","360 000","374 000","380 000"],
    a: 2, d: "hard" },

  // 12. Kozon kabobda qaysi gosht → narx
  { id: 'fd8df002-1670-4a84-80f1-8b536ec85d9e',
    q: "Kozon kabob narxi qancha?",
    o: ["65 000","70 000","75 000","82 000"],
    a: 2, d: "medium" },

  // 13. Ko'za sho'rva sabzavotlar → og'irlik
  { id: '0b3f937f-366b-4d28-9367-091918141511',
    q: "Ko'za sho'rva og'irligi qancha va narxi qancha?",
    o: ["430g — 57 000","450g — 63 000","500g — 63 000","600g — 70 000"],
    a: 2, d: "hard" },

  // 14. Kuksi og'irligi → og'irlik va narx
  { id: '184667bf-55e8-43be-85b9-43e8d2e4643e',
    q: "Kuksi og'irligi qancha?",
    o: ["430g","500g","550g","600g"],
    a: 3, d: "medium" },

  // 15. Beshbarmoq tarkibida qaysi gosht → narx taqqoslash
  { id: 'a4710dd0-d365-43af-b263-df5abb35bc18',
    q: "Beshbarmoq va Kozon kabob — qaysi biri qimmatroq?",
    o: ["Beshbarmoq (89 000)","Kozon kabob (75 000)","Bir xil narxda","Farqi 5 000"],
    a: 0, d: "medium" },

  // 16. Bifstrogan tarkibida → narx
  { id: '40ef340b-2c76-46db-a31e-3d57f59d23d4',
    q: "Bifstrogan narxi qancha?",
    o: ["50 000","54 000","57 000","60 000"],
    a: 2, d: "easy" },

  // 17. Sho'rva tarkibida gosht → og'irlik
  { id: '5de2563b-cd82-4e83-a910-d5b99e9f6363',
    q: "Sho'rva og'irligi qancha?",
    o: ["400g","430g","450g","500g"],
    a: 2, d: "medium" },

  // 18. Noxot sho'rak ko'katlar → narx
  { id: '6f8f7e51-b954-4428-ae0d-b30976b27123',
    q: "Noxot sho'rak narxi qancha?",
    o: ["55 000","60 000","64 000","68 000"],
    a: 2, d: "medium" },

  // 19. Mastava necha xil sabzavot → og'irlik
  { id: '1b413aca-6659-48c9-916e-e2fd9bf76283',
    q: "Mastava og'irligi qancha?",
    o: ["400g","430g","450g","500g"],
    a: 1, d: "hard" },

  // 20. Norin porsiyasi narxi → yaxshi savol, option tartibini yaxshilash
  { id: 'b069ed79-a832-49af-a851-dd19fb2907fc',
    q: "Norin (porsiya) narxi qancha?",
    o: ["24 000","28 000","32 000","36 000"],
    a: 1, d: "easy" },

  // 21. Halim allergik ingredient → narx taqqoslash
  { id: 'b247b719-2a8a-449a-a3e5-d0b6b38bdcd1',
    q: "Halim (70 000) va Noxot sho'rak (64 000) narxi farqi qancha?",
    o: ["4 000","5 000","6 000","7 000"],
    a: 2, d: "hard" },

  // 22. Manpar tarkibidagi 4 ingredient → og'irlik va narx
  { id: 'c07a2a6f-8526-4f7b-b95e-b710ac62ec32',
    q: "Manpar og'irligi va narxi qancha?",
    o: ["500g — 38 000","550g — 40 000","600g — 42 000","650g — 45 000"],
    a: 2, d: "hard" },

  // 23. Xash asosiy ingredient → bo'lim va narx
  { id: '77261228-42ca-40ff-8399-d4ccce03ea95',
    q: "Xash qaysi bo'limda va narxi qancha?",
    o: ["Ikkinchi taom, 42 000","Birinchi taom, 42 000","Uyg'ur taomlari, 38 000","Birinchi taom, 36 000"],
    a: 1, d: "easy" },

  // 24. Mastava qaysi guruch → bo'lim va og'irlik
  { id: 'cd9d623b-2347-4639-bb12-02aca1843044',
    q: "Mastava qaysi bo'limda va og'irligi qancha?",
    o: ["Birinchi taom, 400g","Birinchi taom, 430g","Ikkinchi taom, 430g","Uyg'ur taomlari, 450g"],
    a: 1, d: "medium" },
];

const BASE = 'https://tarnov-restaurant-platform.onrender.com';

function req(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname, path: url.pathname, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Cookie': cookie || '' }
    };
    const r = https.request(opts, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    r.on('error', reject);
    r.write(data); r.end();
  });
}

async function main() {
  const login = await req('POST', '/api/auth/login', { loginType:'restaurant', email:'admin@tarnov.uz', password:'anas2024' });
  const cookie = (login.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  console.log('Login:', login.status);

  let ok = 0, fail = 0;
  for (const u of updates) {
    const r = await req('PUT', `/api/restaurant/questions/${u.id}`, {
      question: u.q, options: u.o, correctAnswer: u.a, difficulty: u.d
    }, cookie);
    if (r.status === 200) {
      ok++;
      console.log(`✓ [${u.d}] ${u.q.substring(0,55)}`);
    } else {
      fail++;
      console.log(`✗ ${u.id}: ${r.body.substring(0,60)}`);
    }
    await new Promise(r => setTimeout(r, 80));
  }
  console.log(`\n✅ Yangilandi: ${ok} | ✗ Xato: ${fail}`);
}

main().catch(console.error);
