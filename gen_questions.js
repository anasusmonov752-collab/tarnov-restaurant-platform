/**
 * TARNOV RESTAURANT — 2026 Professional Test Questions
 * Maqsad: 50 ofitsiant ichida faqat 1-2 top ofitsiant 90%+ olsin
 * Strategiya: oson=menyu bilganlar 8/10, qiyin=faqat chuqur o'rganganlar 4/5
 * Jami: 70 oson + 70 o'rta + 70 qiyin = 210 savol
 */

const https = require('https');

const questions = [

// ═══════════════════════════════════════════════════════
//  OSON (70 ta) — kategoriya, asosiy bilim, oddiy narxlar
// ═══════════════════════════════════════════════════════

// --- Birinchi taom ---
{ q:"Kuksi qaysi bo'limga kiradi?", o:["Salatlar","Birinchi taom","Ikkinchi taom","Uyg'ur taomlari"], a:1, d:"easy" },
{ q:"Xash qaysi bo'limga kiradi?", o:["Ikkinchi taom","Salatlar","Birinchi taom","Dessert"], a:2, d:"easy" },
{ q:"Manpar qaysi turdagi taom?", o:["Salat","Birinchi taom (sho'rva)","Ikkinchi taom","Pizza"], a:1, d:"easy" },
{ q:"Okroshkaning asosiy ingredientlaridan biri qaysi?", o:["Guruch","Nordon sut va bodring","Makaron","Pomidor"], a:1, d:"easy" },
{ q:"Ko'za sho'rva boshqa birinchi taomlarga nisbatan qanday?", o:["Arzonroq","Bir xil narxda","Qimmatroq","Menyuda yo'q"], a:2, d:"easy" },
{ q:"Mastava qaysi bo'limga kiradi?", o:["Salatlar","Uyg'ur taomlari","Birinchi taom","Palov va Samsa"], a:2, d:"easy" },

// --- Salatlar ---
{ q:"Quyidagilardan qaysi biri salat bo'limiga kiradi?", o:["Lag'mon","Somsa","Olivye","Manti"], a:2, d:"easy" },
{ q:"Sezar qaysi bo'lim?", o:["Ikkinchi taom","Salatlar","Dessert","Set"], a:1, d:"easy" },
{ q:"Mimoza qaysi bo'limga kiradi?", o:["Ichimliklar","Moxito","Salatlar","Vafel va Muzqaymoq"], a:2, d:"easy" },
{ q:"Vinegret qaysi bo'limga kiradi?", o:["Qo'shimchalar","Salatlar","Birinchi taom","Palov va Samsa"], a:1, d:"easy" },
{ q:"Buratto salat asosiy komponenti nima?", o:["Qo'ziqorin","Tovuq","Buratta pishlog'i","Tuxum"], a:2, d:"easy" },
{ q:"Olivye va Sezar qaysi bir bo'limga kiradi?", o:["Ikkinchi taom","Salatlar","Qo'shimchalar","Birinchi taom"], a:1, d:"easy" },

// --- Ikkinchi taom ---
{ q:"Beshbarmoq qaysi bo'limga kiradi?", o:["Uyg'ur taomlari","Kabob","Ikkinchi taom","Palov va Samsa"], a:2, d:"easy" },
{ q:"Kozon kabob qaysi bo'limda?", o:["Kabob","Mangal","Ikkinchi taom","Uyg'ur taomlari"], a:2, d:"easy" },
{ q:"Halim qaysi turdagi taom?", o:["Salat","Dessert","Birinchi taom","Ikkinchi taom"], a:3, d:"easy" },
{ q:"Do'lma qaysi bo'limda?", o:["Kabob","Ikkinchi taom","Salatlar","Mangal"], a:1, d:"easy" },

// --- Uyg'ur taomlari ---
{ q:"Lag'mon qaysi bo'limga kiradi?", o:["Birinchi taom","Ikkinchi taom","Uyg'ur taomlari","Kabob"], a:2, d:"easy" },
{ q:"Manti qaysi bo'limga kiradi?", o:["Palov va Samsa","Qo'shimchalar","Uyg'ur taomlari","Birinchi taom"], a:2, d:"easy" },
{ q:"Qovurma lag'mon oddiy lag'mondan qanday farq qiladi?", o:["Arzonroq","Qovuriladi","Uyg'ur usulida","Pishloqli"], a:1, d:"easy" },
{ q:"Sumboro va Sokoro qaysi bo'limda?", o:["Kabob","Ikkinchi taom","Uyg'ur taomlari","Salatlar"], a:2, d:"easy" },

// --- Steyk ---
{ q:"Ribay biftek qaysi bo'limga kiradi?", o:["Ikkinchi taom","Mangal","Steyk","Kabob"], a:2, d:"easy" },
{ q:"Steyk bo'limida qanday go'sht turlari bor?", o:["Faqat qo'y go'shti","Tovuq va mol go'shti","Baliq","Faqat cho'chqa"], a:1, d:"easy" },
{ q:"Grudka steyk qaysi bo'limda?", o:["Qiyma tovuq","Ikkinchi taom","Steyk","Mangal"], a:2, d:"easy" },

// --- Mangal ---
{ q:"Iskandar qaysi bo'limga kiradi?", o:["Steyk","Kabob","Mangal","Ikkinchi taom"], a:2, d:"easy" },
{ q:"Adana kabob qaysi bo'limda?", o:["Kabob","Mangal","Steyk","Uyg'ur taomlari"], a:1, d:"easy" },
{ q:"Cheeseburger qaysi bo'limda?", o:["Pizza","Qo'shimchalar","Mangal","Ikkinchi taom"], a:2, d:"easy" },
{ q:"Donar Beyti qaysi bo'limga kiradi?", o:["Kabob","Steyk","Salatlar","Mangal"], a:3, d:"easy" },

// --- Pizza ---
{ q:"Menyuda qancha xil pizza bor?", o:["1 ta","2 ta","3 ta","4 ta"], a:1, d:"easy" },
{ q:"Pizza bo'limida qaysi ikki xil pizza bor?", o:["Margarita va Pepperoni","Margarita va Hawai","Pepperoni va BBQ","Diablo va Margarita"], a:0, d:"easy" },

// --- Baliq ---
{ q:"Sazan qaysi bo'limga kiradi?", o:["Steyk","Baliq taomlari","Mangal","Kabob"], a:1, d:"easy" },
{ q:"Sudak qaysi bo'limda?", o:["Birinchi taom","Baliq taomlari","Ikkinchi taom","Uyg'ur taomlari"], a:1, d:"easy" },

// --- Palov va Samsa ---
{ q:"Somsa qaysi bo'limga kiradi?", o:["Qo'shimchalar","Uyg'ur taomlari","Palov va Samsa","Ikkinchi taom"], a:2, d:"easy" },
{ q:"Osh (palov) qaysi bo'limda?", o:["Ikkinchi taom","Uyg'ur taomlari","Palov va Samsa","Set"], a:2, d:"easy" },
{ q:"Qazi qaysi bo'limga kiradi?", o:["Salatlar","Qo'shimchalar","Kabob","Palov va Samsa"], a:3, d:"easy" },

// --- Kabob ---
{ q:"Tovuqli kabob qaysi bo'limda?", o:["Mangal","Kabob","Steyk","Qiyma tovuq"], a:1, d:"easy" },
{ q:"Jigar kabob qaysi bo'limda?", o:["Ikkinchi taom","Mangal","Kabob","Steyk"], a:2, d:"easy" },
{ q:"Kabob bo'limida qanday go'sht turlari bor?", o:["Faqat tovuq","Tovuq, mol, jigar, qiyma, qo'y","Faqat mol va qo'y","Baliq va tovuq"], a:1, d:"easy" },

// --- Dessert ---
{ q:"Ekler qaysi bo'limda?", o:["Vafel va Muzqaymoq","Set","Dessert","Ichimliklar"], a:2, d:"easy" },
{ q:"Cheesecake qaysi bo'limda?", o:["Dessert","Salatlar","Set","Qo'shimchalar"], a:0, d:"easy" },
{ q:"Napoleon tort qaysi bo'limga kiradi?", o:["Set","Vafel va Muzqaymoq","Qo'shimchalar","Dessert"], a:3, d:"easy" },

// --- Ichimliklar ---
{ q:"Pepsi qaysi bo'limda?", o:["Moxito","Set","Ichimliklar","Qo'shimchalar"], a:2, d:"easy" },
{ q:"Borjomi qaysi bo'limda?", o:["Moxito","Qo'shimchalar","Ichimliklar","Set"], a:2, d:"easy" },
{ q:"Kompot menyuda qaysi bo'limda?", o:["Dessert","Ichimliklar","Vafel va Muzqaymoq","Moxito"], a:1, d:"easy" },

// --- Set ---
{ q:"Tabaka set qaysi bo'limda?", o:["Ikkinchi taom","Qiyma tovuq","Set","Mangal"], a:2, d:"easy" },
{ q:"Set bo'limining maqsadi nima?", o:["Faqat ichimliklar","Bir nechta taom birlashtirilgan to'plam","Faqat dessert","Qo'shimcha garnir"], a:1, d:"easy" },

// --- Vafel va Muzqaymoq ---
{ q:"Fondyu qaysi bo'limda?", o:["Dessert","Set","Ichimliklar","Vafel va Muzqaymoq"], a:3, d:"easy" },
{ q:"Gonkong vaflisi va Belgiya vaflisi qaysi bo'limda?", o:["Dessert","Vafel va Muzqaymoq","Set","Ichimliklar"], a:1, d:"easy" },
{ q:"Mevali muzqaymoq qaysi bo'limda?", o:["Dessert","Ichimliklar","Salatlar","Vafel va Muzqaymoq"], a:3, d:"easy" },

// --- Qo'shimchalar ---
{ q:"Kartoshka fri qaysi bo'limda?", o:["Ikkinchi taom","Salatlar","Qo'shimchalar","Set"], a:2, d:"easy" },
{ q:"Non (patir) qaysi bo'limda?", o:["Birinchi taom","Palov va Samsa","Qo'shimchalar","Salatlar"], a:2, d:"easy" },
{ q:"Soya sousi qaysi bo'limda?", o:["Ichimliklar","Salatlar","Moxito","Qo'shimchalar"], a:3, d:"easy" },

// --- Moxito ---
{ q:"Moxito bo'limida nechta xil moxito bor?", o:["2 ta","3 ta","4 ta","5 ta"], a:1, d:"easy" },
{ q:"Klassik Moxito qaysi bo'limda?", o:["Ichimliklar","Dessert","Moxito","Set"], a:2, d:"easy" },
{ q:"Moxito bo'limidagi barcha moxitolar bir xil narxdami?", o:["Ha, barchasi bir xil","Yo'q, har xil","Faqat kivili qimmat","Faqat klassik arzon"], a:0, d:"easy" },

// --- Qiyma tovuq ---
{ q:"KFC qaysi bo'limda?", o:["Steyk","Ikkinchi taom","Mangal","Qiyma tovuq"], a:3, d:"easy" },
{ q:"KFC qanotchalari qaysi bo'limda?", o:["Mangal","Kabob","Qiyma tovuq","Steyk"], a:2, d:"easy" },

// --- Umumiy ---
{ q:"Tarnov menyusida pizza bormi?", o:["Ha, ikki xil","Ha, to'rt xil","Yo'q","Faqat Margarita"], a:0, d:"easy" },
{ q:"Quyidagilardan qaysi biri ichimlik?", o:["Fondyu","Borjomi","Ekler","Somsa"], a:1, d:"easy" },
{ q:"Quyidagilardan qaysi biri dessert?", o:["Sudak","Garnir","Piramida tort","Cheeseburger"], a:2, d:"easy" },
{ q:"Quyidagilardan qaysi biri kabob bo'limiga kiradi?", o:["Tushonka","Jigar kabob","Fondyu","Sudak"], a:1, d:"easy" },
{ q:"Menyuda baliq taomlari bo'limida nechta taom bor?", o:["2 ta","3 ta","4 ta","5 ta"], a:1, d:"easy" },
{ q:"Hydrolife qaysi bo'limda?", o:["Moxito","Qo'shimchalar","Vafel va Muzqaymoq","Ichimliklar"], a:3, d:"easy" },
{ q:"Osh to'plam qaysi bo'limda?", o:["Set","Ikkinchi taom","Palov va Samsa","Uyg'ur taomlari"], a:2, d:"easy" },


// ═══════════════════════════════════════════════════════
//  O'RTA (70 ta) — aniq narxlar, tarkib, og'irlik
// ═══════════════════════════════════════════════════════

// --- Narxlar: Birinchi taom ---
{ q:"Kuksi narxi qancha?", o:["38 000","42 000","46 000","50 000"], a:1, d:"medium" },
{ q:"Ko'za sho'rva narxi qancha?", o:["42 000","50 000","57 000","63 000"], a:3, d:"medium" },
{ q:"Xash narxi qancha?", o:["35 000","42 000","48 000","55 000"], a:1, d:"medium" },
{ q:"Manpar narxi qancha?", o:["36 000","39 000","42 000","45 000"], a:2, d:"medium" },
{ q:"Ko'za sho'rva og'irligi qancha?", o:["400g","430g","500g","600g"], a:2, d:"medium" },
{ q:"Kuksi og'irligi qancha?", o:["430g","500g","550g","600g"], a:3, d:"medium" },
{ q:"Mastava va Sho'rva narxi bir xilmi?", o:["Ha, ikkalasi 42 000","Mastava qimmat","Sho'rva qimmat","Yo'q, har xil"], a:0, d:"medium" },

// --- Narxlar: Salatlar ---
{ q:"Sezar salat narxi qancha?", o:["36 000","38 000","41 000","45 000"], a:2, d:"medium" },
{ q:"Buratto salat narxi qancha?", o:["74 000","82 000","91 000","98 000"], a:2, d:"medium" },
{ q:"Qo'ziqorinli buratto salat narxi qancha?", o:["74 000","88 000","94 000","102 000"], a:2, d:"medium" },
{ q:"Olivye narxi qancha?", o:["28 000","32 000","34 000","38 000"], a:2, d:"medium" },
{ q:"Bahor salati (200g) narxi qancha?", o:["9 000","12 000","14 000","17 000"], a:2, d:"medium" },
{ q:"Qatiq (200g) narxi qancha?", o:["6 000","9 000","12 000","15 000"], a:1, d:"medium" },
{ q:"Frantsuzcha salat narxi qancha?", o:["28 000","32 000","36 000","40 000"], a:1, d:"medium" },
{ q:"Mimoza salat narxi qancha?", o:["32 000","36 000","41 000","45 000"], a:1, d:"medium" },

// --- Narxlar: Ikkinchi taom ---
{ q:"Beshbarmoq narxi qancha?", o:["75 000","82 000","89 000","95 000"], a:2, d:"medium" },
{ q:"Halim narxi qancha?", o:["55 000","63 000","70 000","75 000"], a:2, d:"medium" },
{ q:"Kozon kabob narxi qancha?", o:["63 000","70 000","75 000","82 000"], a:2, d:"medium" },
{ q:"Bifstrogan narxi qancha?", o:["46 000","50 000","54 000","57 000"], a:3, d:"medium" },
{ q:"Bifshteks narxi qancha?", o:["42 000","44 000","46 000","50 000"], a:2, d:"medium" },
{ q:"3 kishi uchun assorti narxi qancha?", o:["240 000","260 000","277 000","295 000"], a:2, d:"medium" },

// --- Narxlar: Uyg'ur taomlari ---
{ q:"Lag'mon narxi qancha?", o:["42 000","46 000","50 000","55 000"], a:2, d:"medium" },
{ q:"Manti narxi (1 dona) qancha?", o:["7 500","8 500","10 500","12 000"], a:2, d:"medium" },
{ q:"Sumboro va Sokoro narxi bir xilmi?", o:["Ha, ikkalasi 74 000","Sumboro qimmat","Sokoro qimmat","Yo'q, farq bor"], a:0, d:"medium" },
{ q:"Go'sht say narxi qancha?", o:["64 000","74 000","80 000","85 000"], a:3, d:"medium" },
{ q:"Ayrim say (xamirli va guruchli) narxi necha?", o:["Har xil","Ikkalasi 60 000","Ikkalasi 64 000","Ikkalasi 70 000"], a:2, d:"medium" },

// --- Narxlar: Steyk ---
{ q:"Ribay biftek narxi qancha?", o:["88 000","95 000","98 000","102 000"], a:3, d:"medium" },
{ q:"Bon file steyk narxi qancha?", o:["73 000","82 000","88 000","95 000"], a:2, d:"medium" },
{ q:"Bedro steyk narxi qancha?", o:["22 000","26 000","30 000","35 000"], a:2, d:"medium" },
{ q:"Grudka steyk narxi qancha?", o:["43 000","46 000","50 000","55 000"], a:2, d:"medium" },

// --- Narxlar: Mangal ---
{ q:"Mini burger narxi qancha?", o:["28 000","32 000","35 000","40 000"], a:2, d:"medium" },
{ q:"Iskandar narxi qancha?", o:["85 000","92 000","95 000","98 000"], a:3, d:"medium" },
{ q:"Donar Beyti narxi qancha?", o:["75 000","82 000","87 000","92 000"], a:2, d:"medium" },
{ q:"Adana kabob narxi qancha?", o:["50 000","55 000","60 000","65 000"], a:2, d:"medium" },
{ q:"Turk assorti narxi qancha?", o:["295 000","310 000","323 000","340 000"], a:2, d:"medium" },

// --- Narxlar: Pizza ---
{ q:"Pizza Margarita narxi qancha?", o:["35 000","40 000","45 000","50 000"], a:1, d:"medium" },
{ q:"Pizza Pepperoni narxi qancha?", o:["40 000","42 000","45 000","50 000"], a:2, d:"medium" },
{ q:"Qaysi pizza arzonroq?", o:["Pepperoni","Margarita","Bir xil","Menyuda yo'q"], a:1, d:"medium" },

// --- Narxlar: Baliq ---
{ q:"Sazan baliq narxi qancha?", o:["58 000","65 000","70 000","73 000"], a:3, d:"medium" },
{ q:"Sudak baliq narxi qancha?", o:["33 000","36 000","38 000","42 000"], a:2, d:"medium" },
{ q:"Baliq steyki narxi qancha?", o:["33 000","36 000","39 000","45 000"], a:2, d:"medium" },

// --- Narxlar: Palov ---
{ q:"Osh (palov) narxi qancha?", o:["38 000","43 000","48 000","53 000"], a:1, d:"medium" },
{ q:"Somsa narxi qancha?", o:["8 000","10 000","12 000","15 000"], a:2, d:"medium" },
{ q:"Osh to'plam narxi qancha?", o:["45 000","48 000","53 000","58 000"], a:2, d:"medium" },

// --- Narxlar: Kabob ---
{ q:"Tovuqli kabob narxi (1 sanchqi)?", o:["12 000","14 000","16 000","18 000"], a:2, d:"medium" },
{ q:"Mol go'shtidan kabob narxi (1 sanchqi)?", o:["18 000","20 000","22 000","25 000"], a:2, d:"medium" },
{ q:"Qo'y go'shtidan kabob narxi?", o:["19 000","22 000","24 000","28 000"], a:2, d:"medium" },

// --- Narxlar: Dessert ---
{ q:"Ekler narxi qancha?", o:["12 000","15 000","17 000","20 000"], a:2, d:"medium" },
{ q:"Napoleon tort narxi qancha?", o:["18 000","20 000","24 000","28 000"], a:2, d:"medium" },
{ q:"San Sebastyan cheesecake narxi qancha?", o:["28 000","32 000","35 000","40 000"], a:2, d:"medium" },

// --- Narxlar: Ichimliklar ---
{ q:"Borjomi (0.5l) narxi qancha?", o:["15 500","17 500","19 500","22 000"], a:2, d:"medium" },
{ q:"Coca-Cola narxi qancha?", o:["8 000","9 000","10 000","12 000"], a:2, d:"medium" },
{ q:"Hydrolife (gazli va gazsiz) narxi qancha?", o:["3 000","4 000","5 000","6 000"], a:2, d:"medium" },
{ q:"Kompot olcha (1l) narxi qancha?", o:["12 000","14 000","16 000","18 000"], a:2, d:"medium" },

// --- Narxlar: Set ---
{ q:"KFC set narxi qancha?", o:["38 000","42 000","46 000","50 000"], a:1, d:"medium" },
{ q:"OSH set narxi qancha?", o:["59 000","62 000","66 000","70 000"], a:2, d:"medium" },
{ q:"Assorti set narxi qancha?", o:["62 000","65 000","68 000","72 000"], a:2, d:"medium" },

// --- Narxlar: Vafel ---
{ q:"Fondyu narxi qancha?", o:["65 000","72 000","80 000","88 000"], a:2, d:"medium" },
{ q:"Belgiya vafli (shokoladli) narxi qancha?", o:["35 000","38 000","40 000","45 000"], a:2, d:"medium" },
{ q:"Mevali muzqaymoq narxi qancha?", o:["50 000","55 000","60 000","65 000"], a:2, d:"medium" },

// --- Narxlar: Qo'shimchalar ---
{ q:"Kartoshka fri narxi qancha?", o:["12 000","14 000","16 000","18 000"], a:2, d:"medium" },
{ q:"Non (patir) narxi qancha?", o:["3 000","3 500","4 500","5 000"], a:2, d:"medium" },
{ q:"Garnir narxi qancha?", o:["24 000","28 000","31 000","35 000"], a:2, d:"medium" },

// --- Narxlar: Moxito ---
{ q:"Moxito (yagodali) narxi qancha?", o:["18 000","22 000","25 000","28 000"], a:2, d:"medium" },
{ q:"Kivili moxito narxi qancha?", o:["20 000","23 000","25 000","30 000"], a:2, d:"medium" },


// ═══════════════════════════════════════════════════════
//  QIYIN (70 ta) — taqqoslash, aniq detallar, aralash
// ═══════════════════════════════════════════════════════

// --- Eng qimmat / eng arzon ---
{ q:"Birinchi taomlar ichida eng qimmat qaysi?", o:["Manpar","Mastava","Ko'za sho'rva","Kuksi"], a:2, d:"hard" },
{ q:"Steyk bo'limida eng arzon taom qaysi?", o:["Grudka steyk","Koreyka steyk","Bedro steyk","Ribay biftek"], a:2, d:"hard" },
{ q:"Steyk bo'limida eng qimmat taom qaysi?", o:["Bon file","Koreyka","Grudka","Ribay biftek"], a:3, d:"hard" },
{ q:"Kabob bo'limida eng arzon (1 sanchqi) qaysi?", o:["Jigar kabob","Qiyma kabob","Tovuqli kabob","Mol go'shtidan"], a:2, d:"hard" },
{ q:"Ichimliklar bo'limida eng arzon narx qancha?", o:["8 000","5 000","3 000","10 000"], a:1, d:"hard" },
{ q:"Ichimliklar bo'limida eng qimmat ichimlik qaysi?", o:["Coca-Cola","Kompot","Borjomi (0.5l)","Chortok 0.5l"], a:2, d:"hard" },
{ q:"Salatlar ichida eng qimmat qaysi?", o:["Buratto salat","Sezar salat","Qo'ziqorinli buratto salat","Grecheskiy salat"], a:2, d:"hard" },
{ q:"Qo'shimchalar bo'limida eng qimmat taom qaysi?", o:["Kartoshka fri","Guruch garniri","Go'shtli assorti garnir","Garnir"], a:2, d:"hard" },
{ q:"Vafel bo'limida eng qimmat taom qaysi?", o:["Belgiya miks vafli","Gonkong miks vafli","Fondyu","Mevali muzqaymoq"], a:2, d:"hard" },
{ q:"Menyudagi eng qimmat assorti qaysi?", o:["3 kishi assorti (277 000)","Turk assorti (323 000)","Mangal assorti 6 kishi (687 000)","Mangal assorti 3 kishi (357 000)"], a:2, d:"hard" },

// --- Narx taqqoslash ---
{ q:"Bifstrogan va Bifshteks ichida qaysi biri qimmatroq?", o:["Bifshteks","Bifstrogan","Bir xil","Menyuda ikkalasi yo'q"], a:1, d:"hard" },
{ q:"Buratto salat vs Qo'ziqorinli buratto salat — qaysi qimmat?", o:["Buratto salat","Qo'ziqorinli buratto","Bir xil narxda","Farq 5 000"], a:1, d:"hard" },
{ q:"Sazan baliq va Sudak — narx farqi qancha?", o:["25 000","30 000","35 000","40 000"], a:2, d:"hard" },
{ q:"Pizza Pepperoni va Margarita narxi farqi necha?", o:["0 so'm","3 000","5 000","10 000"], a:2, d:"hard" },
{ q:"Lag'mon va Qovurma lag'mon narxi bir xilmi?", o:["Ha, ikkalasi 50 000","Qovurma qimmat 5 000","Oddiy qimmat 5 000","Farq 10 000"], a:0, d:"hard" },
{ q:"Tovuqli kabob va Jigar kabob — qaysi biri qimmatroq?", o:["Tovuqli kabob","Jigar kabob","Bir xil","Farq 5 000"], a:1, d:"hard" },
{ q:"Osh (palov) va Tabaka — qaysi biri qimmatroq?", o:["Osh (palov)","Tabaka","Bir xil — 43 000","Farq 10 000"], a:2, d:"hard" },
{ q:"Set bo'limida eng arzon set qaysi?", o:["Mangal set (59 000)","Qovurma set (59 000)","KFC set (42 000)","Kabob set (62 000)"], a:2, d:"hard" },
{ q:"Set bo'limida eng qimmat set qaysi?", o:["Mangal set","Kabob set","Do'lma set (67 000)","Assorti set (68 000)"], a:3, d:"hard" },
{ q:"Koreyka steyk narxi va Bon file steyk narxi farqi necha?", o:["5 000","10 000","15 000","20 000"], a:2, d:"hard" },

// --- Og'irlik / porsiya ---
{ q:"Manpar og'irligi qancha?", o:["430g","500g","550g","600g"], a:3, d:"hard" },
{ q:"Ko'za sho'rva og'irligi qancha?", o:["430g","450g","500g","600g"], a:2, d:"hard" },
{ q:"Mastava og'irligi qancha?", o:["400g","430g","450g","500g"], a:1, d:"hard" },
{ q:"Sho'rva og'irligi qancha?", o:["430g","450g","500g","600g"], a:1, d:"hard" },
{ q:"Xash og'irligi qancha?", o:["380g","400g","430g","450g"], a:2, d:"hard" },
{ q:"Bedro steyk og'irligi qancha?", o:["200-220g","220-240g","240-270g","280-300g"], a:2, d:"hard" },
{ q:"Ribay biftek og'irligi qancha?", o:["350-380g","380-400g","400-450g","450-500g"], a:2, d:"hard" },
{ q:"Bon file steyk og'irligi qancha?", o:["200-220g","220-240g","240-260g","260-280g"], a:2, d:"hard" },
{ q:"Grudka steyk og'irligi qancha?", o:["350-400g","400-450g","450-500g","500-550g"], a:2, d:"hard" },
{ q:"Koreyka steyk og'irligi qancha?", o:["180-200g","200-220g","220-250g","250-280g"], a:2, d:"hard" },

// --- Aralash taqqoslash ---
{ q:"3 ta Manti (1 donasi 10 500) va 1 ta Somsa (12 000) — qaysi biri qimmatroq?", o:["3 ta Manti","1 ta Somsa","Bir xil","Farq 2 000"], a:0, d:"hard" },
{ q:"2 ta Moxito (25 000 x2) va 1 ta Borjomi (19 500) — qaysi arzonroq?", o:["2 ta Moxito","Borjomi","Bir xil","1 ta Moxito va Borjomi"], a:1, d:"hard" },
{ q:"Mangal assorti (6 kishi, 687 000) nechta kishiga mo'ljallangan?", o:["4 kishi","5 kishi","6 kishi","7 kishi"], a:2, d:"hard" },
{ q:"Sumboro va Sokoro narxlari bir xil, lekin qaysi bo'limda?", o:["Kabob","Mangal","Uyg'ur taomlari","Ikkinchi taom"], a:2, d:"hard" },
{ q:"KFC va KFC qanotchalari narxi farqi necha?", o:["5 000","6 000","7 000","8 000"], a:3, d:"hard" },

// --- Aniq detallar ---
{ q:"Qiyma kabob va Jigar kabob narxi bir xilmi?", o:["Ha, ikkalasi 19 000","Jigar qimmat","Qiyma qimmat","Farq 3 000"], a:0, d:"hard" },
{ q:"Chortok (0.5l) va Chortok (0.3l) narxi farqi necha?", o:["2 000","3 000","4 000","5 000"], a:1, d:"hard" },
{ q:"Hydrolife (gazli) va Hydrolife (gazsiz) narxi bir xilmi?", o:["Ha, ikkalasi 5 000","Gazli qimmat","Gazsiz qimmat","Farq 2 000"], a:0, d:"hard" },
{ q:"Qo'y go'shtidan kabob narxi mol go'shtidan qancha qimmat?", o:["1 000","2 000","3 000","5 000"], a:1, d:"hard" },
{ q:"Gonkong vafli (miks) va Belgiya vafli (miks) narxi bir xilmi?", o:["Ha, ikkalasi 65 000","Gonkong qimmat","Belgiya qimmat","Farq 5 000"], a:0, d:"hard" },
{ q:"Belgiya va Gonkong vaflisining shokoladli varianti bir xil narxdami?", o:["Ha, ikkalasi 40 000","Gonkong qimmat","Belgiya qimmat","Farq 5 000"], a:0, d:"hard" },
{ q:"Garnir (31 000) va Kartoshka fri (16 000) narxi farqi qancha?", o:["12 000","13 000","15 000","17 000"], a:2, d:"hard" },
{ q:"Ekler dessertlar ichida narx jihatidan qanday?", o:["Eng qimmat","O'rtacha","Eng arzon","Boshqalar bilan bir xil"], a:2, d:"hard" },
{ q:"Napoleon tort (24 000) va Piramida tort (35 000) farqi necha?", o:["9 000","10 000","11 000","12 000"], a:2, d:"hard" },

// --- Mantiqiy savollar ---
{ q:"Mijoz 1 ta Ribay biftek va 1 ta Borjomi 0.5l buyurtma qildi. Jami summa?", o:["118 500","119 500","121 500","122 000"], a:2, d:"hard" },
{ q:"Mijoz 2 ta Manti va 1 ta Kartoshka fri buyurtma qildi. Jami?", o:["34 000","37 000","38 000","40 000"], a:1, d:"hard" },
{ q:"3 kishilik Mangal assorti va 3 ta Klassik Moxito jami?", o:["420 000","432 000","435 000","440 000"], a:1, d:"hard" },
{ q:"Fondyu va Pizza Pepperoni jami narxi?", o:["120 000","122 000","125 000","128 000"], a:2, d:"hard" },
{ q:"Mijoz eng arzon Ichimlik va eng arzon Moxito so'radi. Jami?", o:["25 000","28 000","30 000","32 000"], a:2, d:"hard" },

// --- Xotirani tekshirish ---
{ q:"Norin kg narxi qancha?", o:["120 000","132 000","146 000","158 000"], a:2, d:"hard" },
{ q:"Assorti 1 porsiya narxi qancha?", o:["85 000","90 000","97 000","105 000"], a:2, d:"hard" },
{ q:"Noxot sho'rak narxi qancha?", o:["55 000","60 000","64 000","70 000"], a:2, d:"hard" },
{ q:"KFC kg narxi qancha?", o:["95 000","105 000","112 000","120 000"], a:2, d:"hard" },
{ q:"Qo'zichoq soni narxi qancha?", o:["110 000","118 000","124 000","130 000"], a:2, d:"hard" },
{ q:"Mangal assorti (3 kishi) narxi qancha?", o:["320 000","340 000","357 000","375 000"], a:2, d:"hard" },
{ q:"Go'shtli assorti garnir narxi qancha?", o:["70 000","75 000","82 000","88 000"], a:2, d:"hard" },
{ q:"Borjomi (0.33l) narxi qancha?", o:["14 500","15 500","17 500","19 500"], a:2, d:"hard" },

];

// ── Stats ──
const easy  = questions.filter(q => q.d === 'easy').length;
const med   = questions.filter(q => q.d === 'medium').length;
const hard  = questions.filter(q => q.d === 'hard').length;
console.log(`Jami: ${questions.length} | Oson: ${easy} | O'rta: ${med} | Qiyin: ${hard}`);

// ── Login & Post ──
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
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('error', reject);
    r.write(data); r.end();
  });
}

async function main() {
  const login = await req('POST', '/api/auth/login', { loginType:'restaurant', email:'admin@tarnov.uz', password:'anas2024' });
  const cookie = (login.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  console.log('Login:', login.status);
  if (!cookie) { console.error('Cookie yo\'q!'); process.exit(1); }

  let added = 0, failed = 0;
  for (const q of questions) {
    const body = {
      question: q.q,
      options: q.o,
      correctAnswer: q.a,
      difficulty: q.d
    };
    const r = await req('POST', '/api/restaurant/questions', body, cookie);
    if (r.status === 200 || r.status === 201) {
      added++;
      if (added % 20 === 0) console.log(`  ... ${added} ta qo'shildi`);
    } else {
      failed++;
      console.log(`✗ "${q.q}": ${r.body.substring(0, 80)}`);
    }
    await new Promise(r => setTimeout(r, 80));
  }
  console.log(`\n✅ Qo'shildi: ${added} | ✗ Xato: ${failed}`);
}

main().catch(console.error);
