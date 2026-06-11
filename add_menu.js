// tarnov.uz dan olingan mahsulotlarni platformaga qo'shish skripti
const https = require('https');

// --- Platformadagi mavjud taomlar (skip qilinadi) ---
const existing = new Set([
  'Kuksi','Okroshka','Ko\'za sho\'rva','Mastava','Sho\'rva','Xash','Manpar',
  'Norin kg','Halim','Norin (porsiya)','3 kishi uchun assorti','Tabaka',
  'Bifstrogan','Bifshteks','Dolma','Beshbarmoq','Kozon kabob',
  'Assorti 1 porsiya','Noxot shorak',
  // variants
  'Do\'lma','Noxot sho\'rak','Norin'
]);

// --- Barcha taomlar: tarnov.uz dan olingan, kategoriya bilan ---
const allProducts = [
  // SALATLAR
  { name:"Ananasli salat",           category:"Salatlar",        price:42000, description:"Ananasli fruksoniy salat" },
  { name:"Qo'ziqorinli navozi salat",category:"Salatlar",        price:74000, description:"Qo'ziqorin bilan salat" },
  { name:"Qo'ziqorinli buratto salat",category:"Salatlar",       price:94000, description:"Buratta pishlog'i va qo'ziqorin bilan" },
  { name:"Buratto salat",            category:"Salatlar",        price:91000, description:"Buratta pishlog'i bilan salat" },
  { name:"Tarnov salat",             category:"Salatlar",        price:43000, description:"Restoran uslubidagi salat" },
  { name:"Dollar salat",             category:"Salatlar",        price:34000, description:"" },
  { name:"Olivye",                   category:"Salatlar",        price:34000, description:"Klassik olivye salati" },
  { name:"Grecheskiy salat",         category:"Salatlar",        price:42000, description:"Yunon salati" },
  { name:"Maftunkor salat",          category:"Salatlar",        price:45000, description:"" },
  { name:"Yaponcha salat",           category:"Salatlar",        price:36000, description:"Yapon uslubidagi salat" },
  { name:"Frantsuzcha salat",        category:"Salatlar",        price:32000, description:"Fransuz uslubidagi salat" },
  { name:"Dieta salat",              category:"Salatlar",        price:32000, description:"Yengil dietik salat" },
  { name:"Sezar salat",              category:"Salatlar",        price:41000, description:"Klassik Sezar salati" },
  { name:"Mimoza salat",             category:"Salatlar",        price:36000, description:"Mimoza salati" },
  { name:"Smak salat",               category:"Salatlar",        price:32000, description:"" },
  { name:"Bahor salati (200g)",      category:"Salatlar",        price:14000, description:"Yangi ko'katlar salati" },
  { name:"Suzma (150g)",             category:"Salatlar",        price:12000, description:"" },
  { name:"Qatiq (200g)",             category:"Salatlar",        price:9000,  description:"" },
  { name:"Yangi salat",              category:"Salatlar",        price:17000, description:"" },
  { name:"Vinegret salat",           category:"Salatlar",        price:32000, description:"Sabzavotli vinegret" },
  { name:"Tuzlamalar assorti",       category:"Salatlar",        price:12000, description:"Tuzlangan sabzavotlar" },
  { name:"Chiroqchi salat",          category:"Salatlar",        price:26000, description:"" },

  // QIYMA TOVUQ (KFC uslubi)
  { name:"KFC",                      category:"Qiyma tovuq",     price:25000, description:"Qiyma tovuq porsiyasi" },
  { name:"KFC qanotchalari",         category:"Qiyma tovuq",     price:33000, description:"Qiyma tovuq qanotchalari" },
  { name:"KFC kg",                   category:"Qiyma tovuq",     price:112000,description:"Qiyma tovuq 1 kg" },
  { name:"Tushonka",                 category:"Qiyma tovuq",     price:77000, description:"" },
  { name:"Qo'zichoq soni",           category:"Qiyma tovuq",     price:124000,description:"Qo'zichoq soni" },

  // UYG'UR TAOMLARI
  { name:"Lag'mon",                  category:"Uyg'ur taomlari", price:50000, description:"An'anaviy uyg'ur lag'moni" },
  { name:"Qovurma lag'mon",          category:"Uyg'ur taomlari", price:50000, description:"Qovurilgan lag'mon" },
  { name:"Ganpan",                   category:"Uyg'ur taomlari", price:50000, description:"Uyg'ur ganpani" },
  { name:"Ayrim say (xamirli)",      category:"Uyg'ur taomlari", price:64000, description:"Xamir bilan ayrim say" },
  { name:"Ayrim say (guruchli)",     category:"Uyg'ur taomlari", price:64000, description:"Guruch bilan ayrim say" },
  { name:"Go'sht say",               category:"Uyg'ur taomlari", price:85000, description:"Go'shtli say" },
  { name:"Juvova",                   category:"Uyg'ur taomlari", price:50000, description:"Uyg'ur juvovasi" },
  { name:"Manti",                    category:"Uyg'ur taomlari", price:10500, description:"Uyg'ur mantisi (1 dona)" },
  { name:"Sumboro",                  category:"Uyg'ur taomlari", price:74000, description:"" },
  { name:"Sokoro",                   category:"Uyg'ur taomlari", price:74000, description:"" },

  // STEYK
  { name:"Bedro steyk (240-270g)",   category:"Steyk",           price:30000, description:"Tovuq bedro steyki" },
  { name:"Bon file steyk (240-260g)",category:"Steyk",           price:88000, description:"Bon file steyki" },
  { name:"Grudka steyk (450-500g)",  category:"Steyk",           price:50000, description:"Tovuq ko'kragi steyki" },
  { name:"Koreyka steyk (220-250g)", category:"Steyk",           price:73000, description:"Koreyka steyki" },
  { name:"Ribay biftek (400-450g)",  category:"Steyk",           price:102000,description:"Ribay steyki" },

  // PIZZA
  { name:"Pizza Margarita",          category:"Pizza",           price:40000, description:"Klassik margarita pizza" },
  { name:"Pizza Pepperoni",          category:"Pizza",           price:45000, description:"Pepperoni pizza" },

  // BALIQ TAOMLARI
  { name:"Sazan baliq",              category:"Baliq taomlari",  price:73000, description:"Grilda pishirilgan sazan" },
  { name:"Sudak baliq",              category:"Baliq taomlari",  price:38000, description:"Sudak baliq" },
  { name:"Baliq steyki (240-260g)",  category:"Baliq taomlari",  price:39000, description:"Baliq steyki" },

  // PALOV VA SAMSA
  { name:"Osh to'plam",              category:"Palov va Samsa",  price:53000, description:"Palov to'plam seti" },
  { name:"Osh (palov)",              category:"Palov va Samsa",  price:43000, description:"O'zbek plov" },
  { name:"Qazi",                     category:"Palov va Samsa",  price:10000, description:"Qazi go'shti" },
  { name:"Somsa",                    category:"Palov va Samsa",  price:12000, description:"O'zbek somsasi (1 dona)" },

  // KABOB
  { name:"Tovuqli kabob",            category:"Kabob",           price:16000, description:"Tovuq kabob (1 sanchqi)" },
  { name:"Mol go'shtidan kabob",     category:"Kabob",           price:22000, description:"Mol go'shtidan (1 sanchqi)" },
  { name:"Jigar kabob",              category:"Kabob",           price:19000, description:"Jigar kabob (1 sanchqi)" },
  { name:"Qiyma kabob",              category:"Kabob",           price:19000, description:"Qiyma kabob (1 sanchqi)" },
  { name:"Qo'y go'shtidan kabob",    category:"Kabob",           price:24000, description:"Qo'y go'shtidan (1 sanchqi)" },

  // MANGAL
  { name:"Mangal qanot",             category:"Mangal",          price:10500, description:"Grildagi qanot (1 dona)" },
  { name:"Sabzavotli kabob",         category:"Mangal",          price:19000, description:"Sabzavotli kabob" },
  { name:"Makkajo'xori",             category:"Mangal",          price:17000, description:"Grildagi makkajo'xori" },
  { name:"Mangal assorti (3 kishi)", category:"Mangal",          price:357000,description:"3 kishilik mangal assorti" },
  { name:"Mangal assorti (6 kishi)", category:"Mangal",          price:687000,description:"6 kishilik mangal assorti" },
  { name:"Turk assorti",             category:"Mangal",          price:323000,description:"Turk uslubidagi assorti" },
  { name:"Iskandar",                 category:"Mangal",          price:98000, description:"Turk Iskandar kebabi" },
  { name:"Donar Beyti",              category:"Mangal",          price:87000, description:"Donar beyti" },
  { name:"Pilov usti Donar",         category:"Mangal",          price:79000, description:"Palov ustiga donar" },
  { name:"Donar Cheeseburger",       category:"Mangal",          price:60000, description:"Donar chizburger" },
  { name:"Turk kebab",               category:"Mangal",          price:72000, description:"Turk kabob" },
  { name:"Adana achchiq",            category:"Mangal",          price:60000, description:"Achchiq adana" },
  { name:"Beyti durum",              category:"Mangal",          price:67000, description:"Beyti durum" },
  { name:"Cheeseburger",             category:"Mangal",          price:45000, description:"Chizburger" },
  { name:"Qanot kebab",              category:"Mangal",          price:46000, description:"Qanot kebab" },
  { name:"Adana kabob",              category:"Mangal",          price:60000, description:"Adana kabob" },
  { name:"Mini burger",              category:"Mangal",          price:35000, description:"Mini burger" },
  { name:"Shef burgeri",             category:"Mangal",          price:44000, description:"Shef burgeri" },

  // DESSERT
  { name:"Ekler",                    category:"Dessert",         price:17000, description:"Klassik ekler" },
  { name:"San Sebastyan cheesecake", category:"Dessert",         price:35000, description:"San Sebastyan pishloq pirogi" },
  { name:"Napoleon tort",            category:"Dessert",         price:24000, description:"Napoleon pishiriq" },
  { name:"Beze merengi",             category:"Dessert",         price:35000, description:"Beze merengali dessert" },
  { name:"Klassik cheesecake",       category:"Dessert",         price:35000, description:"Klassik cheesecake" },
  { name:"Piramida tort",            category:"Dessert",         price:35000, description:"Piramida tort" },
  { name:"Shokoladli cheesecake",    category:"Dessert",         price:35000, description:"Shokoladli cheesecake" },
  { name:"Lakomka dessert",          category:"Dessert",         price:35000, description:"" },
  { name:"Super mevali dessert",     category:"Dessert",         price:35000, description:"Super mevali dessert" },
  { name:"Mevali tort",              category:"Dessert",         price:35000, description:"Mevali tort" },

  // ICHIMLIKLAR
  { name:"O'rik sharbati (tabiiy)",  category:"Ichimliklar",     price:16000, description:"Tabiiy o'rik sharbati" },
  { name:"Pepsi",                    category:"Ichimliklar",     price:10000, description:"Pepsi 0.5l" },
  { name:"Coca-Cola",                category:"Ichimliklar",     price:10000, description:"Coca-Cola 0.5l" },
  { name:"Fanta",                    category:"Ichimliklar",     price:10000, description:"Fanta 0.5l" },
  { name:"Hydrolife (gazsiiz)",      category:"Ichimliklar",     price:5000,  description:"Gazsiiz suv" },
  { name:"Hydrolife (gazli)",        category:"Ichimliklar",     price:5000,  description:"Gazli suv" },
  { name:"Chortok (0.5l)",           category:"Ichimliklar",     price:15000, description:"Chortok mineral suvi" },
  { name:"Chortok (0.3l)",           category:"Ichimliklar",     price:12000, description:"Chortok mineral suvi" },
  { name:"Borjomi (0.5l)",           category:"Ichimliklar",     price:19500, description:"Borjomi mineral suvi" },
  { name:"Kompot olcha (1l)",        category:"Ichimliklar",     price:16000, description:"Gilos kompoti" },

  // SET
  { name:"Tabaka set",               category:"Set",             price:50000, description:"Tabaka asosidagi set" },
  { name:"Osh set",                  category:"Set",             price:66000, description:"Palov asosidagi set" },
  { name:"Do'lma set",               category:"Set",             price:67000, description:"Do'lma asosidagi set" },
  { name:"KFC set",                  category:"Set",             price:42000, description:"KFC asosidagi set" },
  { name:"Assorti set",              category:"Set",             price:68000, description:"Assorti set" },
  { name:"Kabob set",                category:"Set",             price:62000, description:"Kabob asosidagi set" },
  { name:"Sumboro set",              category:"Set",             price:62000, description:"Sumboro asosidagi set" },
  { name:"Qovurma set",              category:"Set",             price:59000, description:"Qovurma asosidagi set" },
  { name:"Mangal set",               category:"Set",             price:59000, description:"Mangal asosidagi set" },

  // VAFEL VA MUZQAYMOQ
  { name:"Gonkong vafli (ananasli)", category:"Vafel va Muzqaymoq", price:50000, description:"Gonkong vaflisi ananasli" },
  { name:"Gonkong vafli (miks)",     category:"Vafel va Muzqaymoq", price:65000, description:"Gonkong vaflisi miks" },
  { name:"Belgiya vafli (miks)",     category:"Vafel va Muzqaymoq", price:65000, description:"Belgiya vaflisi miks" },
  { name:"Belgiya vafli (ananasli)", category:"Vafel va Muzqaymoq", price:50000, description:"Belgiya vaflisi ananasli" },
  { name:"Fondyu",                   category:"Vafel va Muzqaymoq", price:80000, description:"Shokoladli fondyu" },
  { name:"Belgiya assorti vafli",    category:"Vafel va Muzqaymoq", price:60000, description:"Belgiya vaflisi assorti" },
  { name:"Gonkong assorti vafli",    category:"Vafel va Muzqaymoq", price:60000, description:"Gonkong vaflisi assorti" },
  { name:"Belgiya vafli (bananli)",  category:"Vafel va Muzqaymoq", price:40000, description:"Belgiya vaflisi bananli" },
  { name:"Gonkong vafli (bananli)",  category:"Vafel va Muzqaymoq", price:50000, description:"Gonkong vaflisi bananli" },
  { name:"Belgiya vafli (qulupnayli)",category:"Vafel va Muzqaymoq",price:55000, description:"Belgiya vaflisi qulupnayli" },
  { name:"Gonkong vafli (qulupnayli)",category:"Vafel va Muzqaymoq",price:55000, description:"Gonkong vaflisi qulupnayli" },
  { name:"Belgiya vafli (shokoladli)",category:"Vafel va Muzqaymoq",price:40000, description:"Belgiya vaflisi shokoladli" },
  { name:"Gonkong vafli (shokoladli)",category:"Vafel va Muzqaymoq",price:40000, description:"Gonkong vaflisi shokoladli" },
  { name:"Mevali muzqaymoq",         category:"Vafel va Muzqaymoq", price:60000, description:"Mevali muzqaymoq" },

  // QO'SHIMCHALAR
  { name:"Non (patir)",              category:"Qo'shimchalar",   price:4500,  description:"Tandirdan chiqarilgan non" },
  { name:"Kartoshka fri",            category:"Qo'shimchalar",   price:16000, description:"Qovurilgan kartoshka" },
  { name:"Guruch garniri",           category:"Qo'shimchalar",   price:13000, description:"Guruch garniri" },
  { name:"Grechka garniri",          category:"Qo'shimchalar",   price:13000, description:"Grechka garniri" },
  { name:"Pyure garniri",            category:"Qo'shimchalar",   price:13000, description:"Kartoshka pyuresi" },
  { name:"Kotletlar",                category:"Qo'shimchalar",   price:17000, description:"" },
  { name:"Tuxum",                    category:"Qo'shimchalar",   price:5000,  description:"Qaynatilgan tuxum" },
  { name:"Achchiq murch",            category:"Qo'shimchalar",   price:3000,  description:"" },
  { name:"Sirka",                    category:"Qo'shimchalar",   price:1000,  description:"" },
  { name:"Soya sousi",               category:"Qo'shimchalar",   price:2000,  description:"" },
  { name:"Lozi",                     category:"Qo'shimchalar",   price:3000,  description:"" },
  { name:"Sarimsoq (3 dona)",        category:"Qo'shimchalar",   price:1000,  description:"" },
  { name:"Lag'mon uchun palochka",   category:"Qo'shimchalar",   price:2000,  description:"" },
  { name:"Garnir",                   category:"Qo'shimchalar",   price:31000, description:"Katta garnir" },
  { name:"Go'shtli assorti garnir",  category:"Qo'shimchalar",   price:82000, description:"Go'shtli garnir assorti" },

  // MOXITO
  { name:"Moxito (yagodali)",        category:"Moxito",          price:25000, description:"Yagodali moxito" },
  { name:"Klassik Moxito",           category:"Moxito",          price:25000, description:"Klassik moxito" },
  { name:"Moxito (kivili)",          category:"Moxito",          price:25000, description:"Kivi bilan moxito" },
];

// Filter out existing items (approximate match by name)
const toAdd = allProducts.filter(p => {
  const name = p.name.toLowerCase();
  for (const ex of existing) {
    if (name.includes(ex.toLowerCase()) || ex.toLowerCase().includes(name.substring(0, 8))) return false;
  }
  return true;
});

console.log(`Qo'shiladigan taomlar: ${toAdd.length} ta`);

// Login and add items
const BASE = 'https://tarnov-restaurant-platform.onrender.com';

function request(method, path, body, cookies) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Cookie': cookies || ''
      }
    };
    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  // Login
  const loginRes = await request('POST', '/api/auth/login', {
    loginType: 'restaurant', email: 'admin@tarnov.uz', password: 'anas2024'
  });
  const setCookie = loginRes.headers['set-cookie'];
  const cookie = setCookie ? setCookie.map(c => c.split(';')[0]).join('; ') : '';
  console.log('Login:', loginRes.status, cookie ? 'cookie olindi' : 'cookie YO\'Q');
  if (!cookie) { console.error('Login failed!'); process.exit(1); }

  let added = 0, failed = 0;
  for (const item of toAdd) {
    const res = await request('POST', '/api/restaurant/menu', {
      name: item.name,
      category: item.category,
      price: item.price,
      description: item.description || ''
    }, cookie);

    if (res.status === 200) {
      added++;
      process.stdout.write(`✓ ${item.name} [${item.category}]\n`);
    } else {
      failed++;
      process.stdout.write(`✗ ${item.name}: ${res.body}\n`);
    }
    // Small delay to avoid overloading
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n=== NATIJA ===`);
  console.log(`✓ Qo'shildi: ${added}`);
  console.log(`✗ Xato: ${failed}`);
}

main().catch(console.error);
