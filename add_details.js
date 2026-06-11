/**
 * 1. Asosiy taomlarning ingredients/allergens/servingSuggestion ni to'ldirish
 * 2. Tarkib, alergen va tavsiya bo'yicha ~50 yangi savol qo'shish
 */
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

// ── MENYU: asosiy taomlar uchun to'liq ma'lumotlar ──
const menuDetails = [
  // BIRINCHI TAOM
  { name:'Kuksi',           ingredients:'Bug\'doy xamiri,mol go\'shti,sabzavot,tuxum,o\'tlar,sirkali sous', allergens:'Gluten,Tuxum',      srv:'Non (patir) bilan tavsiya etiladi' },
  { name:'Okroshka',        ingredients:'Mol go\'shti,qatiq,qaymoq,yangi bodring,tuxum,kartoshka,ko\'katlar', allergens:'Laktoza,Tuxum', srv:'Sovuq holda, yozda eng mos taom' },
  { name:'Ko\'za sho\'rva', ingredients:'Qo\'y go\'shti,kartoshka,sabzi,piyoz,pomidor,ko\'katlar', allergens:'Yo\'q',              srv:'Non (patir) yoki Tuzlamalar bilan' },
  { name:'Mastava',         ingredients:'Guruch,mol go\'shti,sabzavot,piyoz,pomidor,ko\'katlar', allergens:'Yo\'q',               srv:'Non (patir) bilan tavsiya etiladi' },
  { name:'Sho\'rva',        ingredients:'Mol go\'shti,qo\'y go\'shti,sabzavot,kartoshka,ko\'katlar', allergens:'Yo\'q',            srv:'Non yoki Tuzlamalar bilan' },
  { name:'Xash',            ingredients:'Mol tizzasi,sarimsoq,sirka,qalampir,ko\'katlar', allergens:'Yo\'q',                    srv:'Ertalab issiq holda, sirka va sarimsoq bilan' },
  { name:'Manpar',          ingredients:'Bug\'doy xamiri,mol go\'shti,sabzavot,tuxum,piyoz,pomidor', allergens:'Gluten,Tuxum',    srv:'Issiq holda, ko\'katlar sepib' },

  // SALATLAR
  { name:'Buratto salat',           ingredients:'Buratta pishlog\'i,pomidor,reyxon,zaytun moyi', allergens:'Laktoza',            srv:'Engil taom sifatida, baliq yoki steyk oldidan' },
  { name:'Qo\'ziqorinli buratto salat', ingredients:'Buratta pishlog\'i,qo\'ziqorin,reyxon,zaytun moyi', allergens:'Laktoza',   srv:'Asosiy taom oldidan appetizer sifatida' },
  { name:'Sezar salat',             ingredients:'Romaine salat,tovuq,parmezano,krutoni,sezar sous', allergens:'Laktoza,Gluten,Tuxum', srv:'Hafif asosiy taom sifatida yoki Steyk oldidan' },
  { name:'Olivye',                  ingredients:'Mol go\'shti,kartoshka,bodring,tuxum,sabzi,mayonez', allergens:'Tuxum',         srv:'Asosiy taomlarga qo\'shimcha sifatida' },
  { name:'Tarnov salat',            ingredients:'Go\'sht,sabzavot,maxsus sous', allergens:'Yo\'q',                              srv:'Restoranning signature salati — har doim tavsiya' },

  // IKKINCHI TAOM
  { name:'Beshbarmoq',      ingredients:'Qo\'y go\'shti,mol go\'shti,yupqa xamir,piyoz,go\'sht suvi', allergens:'Gluten',        srv:'Kompot yoki Qatiq bilan, 3-4 kishi uchun mos' },
  { name:'Halim',           ingredients:'Bug\'doy doni,mol go\'shti,piyoz,ziravorlar', allergens:'Gluten',                      srv:'Issiq holda, sariyog\' bilan' },
  { name:'Norin (porsiya)', ingredients:'Bug\'doy uni xamiri,qo\'y go\'shti,piyoz,ziravorlar', allergens:'Gluten',              srv:'Kompot yoki Qatiq bilan tavsiya etiladi' },
  { name:'Norin kg',        ingredients:'Bug\'doy uni xamiri,qo\'y go\'shti,piyoz,ziravorlar', allergens:'Gluten',              srv:'Katta davra uchun (3-4 kishi), Kompot bilan' },
  { name:'Tabaka',          ingredients:'Butun tovuq,sarimsoq,ziravorlar,sariyog\'', allergens:'Yo\'q',                         srv:'Kartoshka fri yoki Garnir + Moxito bilan' },
  { name:'Beshbarmoq',      ingredients:'Qo\'y go\'shti,mol go\'shti,yupqa xamir,piyoz', allergens:'Gluten',                    srv:'Kompot yoki Qatiq bilan' },
  { name:'Dolma',           ingredients:'Mol go\'shti,guruch,piyoz,uzum bargi,ziravorlar', allergens:'Yo\'q',                   srv:'Qatiq yoki Suzma bilan tavsiya etiladi' },

  // UYG'UR TAOMLARI
  { name:'Lag\'mon',        ingredients:'Bug\'doy xamiri,mol go\'shti,sabzavot,piyoz,ziravorlar', allergens:'Gluten',            srv:'Lag\'mon uchun palochka + Moxito yoki Kompot' },
  { name:'Qovurma lag\'mon',ingredients:'Bug\'doy xamiri,mol go\'shti,sabzavot,tuxum,piyoz', allergens:'Gluten,Tuxum',          srv:'Issiq holda, Moxito bilan' },
  { name:'Manti',           ingredients:'Bug\'doy uni,mol go\'shti,qo\'y go\'shti,piyoz', allergens:'Gluten',                   srv:'Qatiq yoki Suzma bilan (1 dona narxi 10 500)' },
  { name:'Sumboro',         ingredients:'Un xamiri,go\'sht,sabzavot,ziravorlar', allergens:'Gluten',                            srv:'Qatiq bilan tavsiya etiladi' },
  { name:'Juvova',          ingredients:'Un xamiri,go\'sht,ko\'katlar,piyoz', allergens:'Gluten',                               srv:'Issiq holda, Moxito bilan' },

  // TURK TAOMLARI
  { name:'Iskandar',        ingredients:'Mol go\'shti,lavaш,pomidor sousi,qaymoq,sariyog\'', allergens:'Laktoza,Gluten',        srv:'Ayran yoki Moxito bilan, eng mashhur turk taomi' },
  { name:'Adana kabob',     ingredients:'Mol go\'shti qiyma,achchiq qalampir,piyoz,ziravorlar', allergens:'Yo\'q',             srv:'Non yoki Guruch garniri + Moxito bilan' },
  { name:'Adana achchiq',   ingredients:'Mol go\'shti qiyma,achchiq chili,piyoz,ziravorlar', allergens:'Yo\'q',                srv:'Achchiqni yaxshi ko\'radiganlar uchun, Borjomi bilan' },
  { name:'Beyti durum',     ingredients:'Mol go\'shti,lavash,pomidor,sarimsoq sousi', allergens:'Gluten',                       srv:'Coca-Cola yoki Moxito bilan' },
  { name:'Turk kebab',      ingredients:'Mol go\'shti,piyoz,ziravorlar,pomidor', allergens:'Yo\'q',                            srv:'Guruch garniri + Moxito bilan' },

  // MANGAL (STEYKLAR)
  { name:'Ribay biftek (400-450g)',  ingredients:'Mol go\'shti qobirg\'a qismi,ziravorlar,o\'tlar', allergens:'Yo\'q',         srv:'Pyure garniri + Moxito yoki Borjomi bilan' },
  { name:'Bon file steyk (240-260g)',ingredients:'Mol go\'shtining eng yumshoq qismi,ziravorlar', allergens:'Yo\'q',           srv:'Grechka garniri + Borjomi bilan tavsiya' },
  { name:'Grudka steyk (450-500g)',  ingredients:'Tovuq ko\'kragi,ziravorlar,o\'tlar', allergens:'Yo\'q',                     srv:'Guruch garniri + Klassik Moxito bilan' },
  { name:'Koreyka steyk (220-250g)', ingredients:'Cho\'chqa koreykasi,ziravorlar', allergens:'Yo\'q',                         srv:'Kartoshka fri + Pepsi yoki Fanta bilan' },
  { name:'Bedro steyk (240-270g)',   ingredients:'Tovuq bedro go\'shti,ziravorlar,limon', allergens:'Yo\'q',                  srv:'Kartoshka fri + Moxito bilan, eng arzon steyk' },

  // PIZZA
  { name:'Pizza Margarita', ingredients:'Un xamiri,pomidor sousi,mozzarella,reyxon', allergens:'Gluten,Laktoza',               srv:'Coca-Cola yoki Fanta bilan, vegetarianlar uchun mos' },
  { name:'Pizza Pepperoni', ingredients:'Un xamiri,pepperoni,mozzarella,pomidor sousi', allergens:'Gluten,Laktoza',            srv:'Pepsi yoki Coca-Cola bilan, eng mashhur pizza' },

  // BALIQ
  { name:'Sazan baliq',            ingredients:'Sazan baliq,ziravorlar,limon,o\'tlar', allergens:'Baliq',                     srv:'Borjomi 0.5l + Yangi salat bilan tavsiya' },
  { name:'Sudak baliq',            ingredients:'Sudak baliq,un,tuxum,ziravorlar', allergens:'Baliq,Gluten,Tuxum',             srv:'Borjomi yoki Moxito + Kartoshka fri bilan' },
  { name:'Baliq steyki (240-260g)',ingredients:'Losos yoki sudak baliq,ziravorlar,limon', allergens:'Baliq',                  srv:'Borjomi bilan tavsiya — baliq va mineral suv klassik' },

  // PALOV VA SAMSA
  { name:'Osh (palov)',     ingredients:'Devzira guruch,mol go\'shti,sabzi,piyoz,sarimsoq,ziravorlar', allergens:'Yo\'q',      srv:'Qatiq yoki Kompot bilan, O\'zbek milliy taomi' },
  { name:'Osh to\'plam',   ingredients:'Devzira guruch,mol go\'shti,sabzi,piyoz,sarimsoq,qazi', allergens:'Yo\'q',            srv:'Kompot 1l + Qatiq bilan to\'liq to\'plam' },
  { name:'Somsa',           ingredients:'Bug\'doy uni,go\'sht,piyoz,ziravorlar', allergens:'Gluten',                          srv:'Choy yoki Kompot bilan appetizer sifatida' },

  // KABOB
  { name:'Tovuqli kabob',         ingredients:'Tovuq go\'shti,ziravorlar,piyoz', allergens:'Yo\'q',                           srv:'Non + Tuzlamalar + Moxito bilan, eng arzon kabob' },
  { name:'Mol go\'shtidan kabob', ingredients:'Mol go\'shti,piyoz,ziravorlar', allergens:'Yo\'q',                             srv:'Non + Tuzlamalar + Moxito bilan' },
  { name:'Qiyma kabob',          ingredients:'Mol go\'shti qiyma,piyoz,ziravorlar', allergens:'Yo\'q',                        srv:'Non + Achchiq murch + Moxito bilan' },
  { name:'Jigar kabob',          ingredients:'Mol jigari,piyoz,ziravorlar', allergens:'Yo\'q',                                srv:'Non + Lozi + Moxito bilan' },

  // DESSERT
  { name:'Napoleon tort',         ingredients:'Un,sariyog\',tuxum,sut,qand', allergens:'Gluten,Laktoza,Tuxum',               srv:'Issiq choy yoki Klassik Moxito bilan' },
  { name:'San Sebastyan cheesecake', ingredients:'Krem pishloq,qaymoq,tuxum,qand,pechenye', allergens:'Laktoza,Tuxum,Gluten', srv:'Klassik Moxito bilan, eng mashhur dessert' },
  { name:'Klassik cheesecake',    ingredients:'Krem pishloq,qaymoq,tuxum,limon,pechenye', allergens:'Laktoza,Tuxum,Gluten',  srv:'Moxito yoki Kompot bilan' },
  { name:'Ekler',                 ingredients:'Un,tuxum,sariyog\',sut,vanillik krem', allergens:'Gluten,Laktoza,Tuxum',       srv:'Choy yoki Moxito bilan, eng arzon dessert' },
];

// ── YANGI SAVOLLAR: Tarkib, Alergen, Tavsiya (50 ta) ──
const newQuestions = [

  // ── TARKIB (Ingredients) ──
  { q:"Kuksi tarkibidagi asosiy allergen nima?", o:["Laktoza","Gluten va Tuxum","Baliq","Yong'oq"], a:1, d:"medium" },
  { q:"Okroshkaning suyuq asosi nima?", o:["Bulyon","Suv","Qatiq va qaymoq","Sut"], a:2, d:"medium" },
  { q:"Xash taomida qaysi mol go'shti bo'lagi ishlatiladi?", o:["Mol umurtqasi","Mol tizzasi","Mol jigari","Mol qovurg'asi"], a:1, d:"hard" },
  { q:"Buratto salatining asosiy qimmatli komponenti nima?", o:["Qo'ziqorin","Buratta pishlog'i","Pomidor","Limon"], a:1, d:"medium" },
  { q:"Halim taomining asosiy ikki ingredienti qaysi?", o:["Guruch va mol go'shti","Bug'doy va mol go'shti","Makaron va tovuq","Guruch va qo'y go'shti"], a:1, d:"medium" },
  { q:"Lag'mon xamiri qaysi undan tayyorlanadi?", o:["Makkajo'xori uni","Bug'doy uni","Guruch uni","Grecheck uni"], a:1, d:"easy" },
  { q:"Beshbarmoq tarkibida qaysi ingredient gluten allergiyasini keltirib chiqaradi?", o:["Go'sht","Piyoz","Yupqa xamir","Sabzi"], a:2, d:"hard" },
  { q:"Dolma nimaga o'ralgan?", o:["Karam bargi","Lavash","Uzum bargi","Qovoq"], a:2, d:"easy" },
  { q:"Iskandar taomida qaysi ikki sut mahsuloti bor?", o:["Sut va tuxum","Qaymoq va sariyog'","Pishloq va suzma","Qatiq va qaymoq"], a:1, d:"hard" },
  { q:"Pizza Margarita tarkibidagi pishloq nomi nima?", o:["Parmezan","Mozzarella","Brie","Buratta"], a:1, d:"medium" },
  { q:"Sezar salatida qaysi uchta allergen bor?", o:["Baliq, tuxum, gluten","Laktoza, gluten, tuxum","Yong'oq, laktoza, tuxum","Baliq, laktoza, gluten"], a:1, d:"hard" },
  { q:"Ribay biftek mol go'shtining qaysi qismidan tayyorlanadi?", o:["Dumba qismi","Qobirg'a qismi","File qismi","Bo'yin qismi"], a:1, d:"hard" },
  { q:"Manti tarkibida qaysi ikki go'sht turi bo'lishi mumkin?", o:["Tovuq va mol","Mol va qo'y go'shti","Qo'y va jigar","Tovuq va qo'y"], a:1, d:"medium" },
  { q:"Norin taomida qaysi allergen bor?", o:["Tuxum","Laktoza","Gluten","Baliq"], a:2, d:"medium" },
  { q:"KFC taomida qaysi parrand go'shti ishlatiladi?", o:["O'rdak","Tovuq","Bedana","Kurka"], a:1, d:"easy" },
  { q:"Adana achchiq va oddiy Adana kabobning farqi nima?", o:["Narxi farqli","Achchiq chili qo'shilgan","Go'sht turi farqli","Pishirish usuli farqli"], a:1, d:"medium" },
  { q:"Grudka steyk qaysi parranddan tayyorlanadi?", o:["O'rdak","Bedana","Tovuq","Kurka"], a:2, d:"easy" },
  { q:"Sazan va Sudak baliq savolida qaysi allergen ikkisida ham bor?", o:["Gluten","Tuxum","Baliq","Laktoza"], a:2, d:"hard" },
  { q:"Napoleon tort tarkibidagi allergenlarga nechta tur kiradi?", o:["1 ta","2 ta","3 ta","4 ta"], a:2, d:"hard" },
  { q:"Osh (palov) uchun qaysi guruch turi ishlatiladi?", o:["Basmati","Jasmine","Devzira","Alanga"], a:2, d:"medium" },

  // ── ALERGENLAR ──
  { q:"Quyidagi taomlardan qaysi birida GLUTEN yo'q?", o:["Lag'mon","Norin (porsiya)","Osh (palov)","Manpar"], a:2, d:"medium" },
  { q:"Mijoz laktoza muammosi borligini aytdi. Qaysi salatni buyurtma qila olmaydi?", o:["Olivye","Tarnov salat","Buratto salat","Yaponcha salat"], a:2, d:"hard" },
  { q:"Qaysi taomda BALIQ allergeni bor?", o:["Sezar salat","Sazan baliq","Beshbarmoq","Manti"], a:1, d:"easy" },
  { q:"Tuxum allergiyasi bor mijozga qaysi taomni tavsiya etmaysiz?", o:["Osh (palov)","Sho'rva","Okroshka","Tabaka"], a:2, d:"medium" },
  { q:"Quyidagi dessertlardan qaysi birida GLUTEN, LAKTOZA va TUXUM uchta allergen ham bor?", o:["Ekler","Mevali muzqaymoq","Fondyu","Lakomka dessert"], a:0, d:"hard" },
  { q:"Vegetarian mijozga qaysi pizza mos keladi?", o:["Pepperoni","Margarita","Ikkalasi ham","Ikkisi ham mos emas"], a:1, d:"easy" },
  { q:"Qaysi taomda LAKTOZA allergeni bor?", o:["Osh (palov)","Kabob","Iskandar","Sho'rva"], a:2, d:"medium" },
  { q:"Baliq allergiyasi bor mijoz uchun qaysi ichimlikni tavsiya etish mumkin?", o:["Baliq allergiyasi ichimliklarga ta'sir qilmaydi","Faqat Hydrolife","Faqat Borjomi","Hech qanday ichimlik emas"], a:0, d:"hard" },
  { q:"Qaysi birinchi taomda allergen YO'Q?", o:["Kuksi","Manpar","Sho'rva","Okroshka"], a:2, d:"medium" },
  { q:"Gluten allergiyasi bor mijozga Uyg'ur bo'limidan qaysi taomni tavsiya etish mumkin?", o:["Lag'mon","Manti","Juvova","Uyg'ur bo'limida gluten bo'lmagan taom yo'q"], a:3, d:"hard" },

  // ── TAVSIYALAR (Cross-selling & Recommendations) ──
  { q:"Mijoz Ribay biftek buyurtma qildi. Qaysi garnirni tavsiya etasiz?", o:["Grechka garniri","Kartoshka fri","Pyure garniri","Guruch garniri"], a:2, d:"medium" },
  { q:"Lag'mon buyurtma qilgan mijozga qaysi qo'shimcha tavsiya etiladi?", o:["Soya sousi","Lag'mon uchun palochka","Sirka","Lozi"], a:1, d:"easy" },
  { q:"Baliq taomi buyurtma qilgan mijozga qaysi ichimlik eng mos?", o:["Pepsi","Fanta","Borjomi (0.5l)","Moxito (kivili)"], a:2, d:"medium" },
  { q:"Mangal/Steyk olgan mijozga qaysi ichimlik eng ko'p tavsiya etiladi?", o:["Hydrolife","Moxito yoki Kompot","Pepsi","Fanta"], a:1, d:"medium" },
  { q:"KFC buyurtma qilgan mijozga qaysi garnir tavsiya etiladi?", o:["Guruch garniri","Grechka garniri","Kartoshka fri","Pyure garniri"], a:2, d:"easy" },
  { q:"Osh (palov) bilan qaysi ichimlik klassik kombinatsiya hisoblanadi?", o:["Borjomi","Pepsi","Qatiq yoki Kompot","Moxito"], a:2, d:"medium" },
  { q:"San Sebastyan cheesecake buyurtma qilgan mijozga qaysi ichimlik tavsiya?", o:["Borjomi","Klassik Moxito","Pepsi","Hydrolife"], a:1, d:"medium" },
  { q:"Mijoz 'engil, yog'siz taom' so'radi. Qaysi salatni tavsiya etasiz?", o:["Buratto salat","Dieta salat","Sezar salat","Olivye"], a:1, d:"medium" },
  { q:"Kabob olgan mijozga qaysi to'plam tavsiya qilinadi?", o:["Non+Tuzlamalar+Moxito","Kartoshka fri+Pepsi","Guruch+Kompot","Pyure+Borjomi"], a:0, d:"medium" },
  { q:"Mijoz 'O'zbek milliy taomi' so'radi. Qaysi taomni birinchi tavsiya etasiz?", o:["Lag'mon","Osh (palov)","Iskandar","KFC"], a:1, d:"easy" },
  { q:"Adana achchiq buyurtma qilgan mijozga qaysi ichimlik tavsiya etasiz?", o:["Fanta","Pepsi","Borjomi (achchiqni bosadi)","Moxito"], a:2, d:"hard" },
  { q:"Dolma bilan qaysi sut mahsuloti klassik tavsiya?", o:["Sut","Smetana","Qatiq yoki Suzma","Pishloq"], a:2, d:"medium" },
  { q:"Mijoz dessert so'radi va 'kalorii kam' dedi. Qaysi dessert mos?", o:["Napoleon tort","San Sebastyan cheesecake","Ekler","Mevali tort"], a:2, d:"hard" },
  { q:"Pizza Margarita vegetarian mijozga tavsiya etiladimi?", o:["Yo'q, go'sht bor","Ha, tarkibida go'sht yo'q","Faqat Pepperoni vegetarian","Ikkalasi ham emas"], a:1, d:"easy" },
  { q:"Mijoz birinchi marta keldi va 'mashhur taom' so'radi. Restoranning Signature taomi qaysi?", o:["Beshbarmoq","Norin kg","Tarnov salat","Kuksi"], a:2, d:"medium" },
  { q:"3 kishilik guruh keldi, 'katta to'plam' so'rashdi. Qaysi taomni tavsiya etasiz?", o:["Tabaka","3 kishi uchun assorti (277 000)","Norin kg","Osh to'plam"], a:1, d:"medium" },
  { q:"Mijoz 'Uyg'ur taomi, lekin shoshilaman' dedi. Qaysi taom tez tayyorlanadi?", o:["Sumboro","Juvova","Lag'mon","Ayrim say"], a:2, d:"hard" },
  { q:"Xash taomi qaysi vaqtda tavsiya etiladi?", o:["Kechki ovqat uchun","Tushlik uchun","Ertalab iste'mol qilinadi","Istalgan vaqtda"], a:2, d:"medium" },
  { q:"Mijoz 'go'sht emas, baliq' dedi. Baliq bo'limida nechta variant bor?", o:["2 ta","3 ta","4 ta","5 ta"], a:1, d:"easy" },
  { q:"Iskandar — eng mashhur Turk taomi. Uning tavsiya etilgan ichimligi qaysi?", o:["Fanta","Borjomi","Ayran (Qatiq) yoki Moxito","Kompot"], a:2, d:"hard" },
];

async function main() {
  const login = await req('POST','/api/auth/login',{loginType:'restaurant',email:'admin@tarnov.uz',password:'anas2024'});
  const cookie = (login.headers['set-cookie']||[]).map(c=>c.split(';')[0]).join('; ');
  console.log('Login:', login.status);

  // ── 1. Menyu: tarkib/alergen/tavsiya qo'shish ──
  const menuRes = await req('GET','/api/restaurant/menu',{},cookie);
  const allMenu = JSON.parse(menuRes.body);
  const menuArr = Array.isArray(allMenu) ? allMenu : (allMenu.menu||[]);

  console.log('\n── Menyu ma\'lumotlari to\'ldirilmoqda ──');
  let mOk=0, mSkip=0;
  for (const d of menuDetails) {
    const item = menuArr.find(x => x.name === d.name || x.name.toLowerCase() === d.name.toLowerCase());
    if (!item) { mSkip++; console.log(`  ⚠ Topilmadi: ${d.name}`); continue; }
    const r = await req('PUT', `/api/restaurant/menu/${item.id}`, {
      ingredients: d.ingredients,
      allergens: d.allergens,
      servingSuggestion: d.srv
    }, cookie);
    if (r.status===200) { mOk++; process.stdout.write(`  ✓ ${item.name}\n`); }
    else { console.log(`  ✗ ${item.name}: ${r.body.substring(0,50)}`); }
    await new Promise(r=>setTimeout(r,70));
  }
  console.log(`\nMenyu: ✅ ${mOk} ta yangilandi | ⚠ ${mSkip} ta topilmadi`);

  // ── 2. Yangi savollar ──
  console.log('\n── Yangi savollar qo\'shilmoqda ('+newQuestions.length+' ta) ──');
  let qOk=0, qFail=0;
  for (const q of newQuestions) {
    const r = await req('POST','/api/restaurant/questions',{
      question:q.q, options:q.o, correctAnswer:q.a, difficulty:q.d
    }, cookie);
    if (r.status===200||r.status===201) { qOk++; process.stdout.write(`  ✓ [${q.d}] ${q.q.substring(0,50)}\n`); }
    else { qFail++; console.log(`  ✗ ${q.q.substring(0,40)}: ${r.body.substring(0,40)}`); }
    await new Promise(r=>setTimeout(r,80));
  }

  console.log(`\n═══════════════════════════════`);
  console.log(`Menyu: ✅ ${mOk} ta (ingredients+allergens+tavsiya)`);
  console.log(`Savollar: ✅ ${qOk} ta yangi | ✗ ${qFail} ta xato`);
  console.log(`Jami savollar taxminan: 210 + ${qOk} = ${210+qOk} ta`);
}

main().catch(console.error);
