const fs = require('fs');
const html = fs.readFileSync('tarnov_page.html', 'utf8');

// Unescape \" -> " (single level)
const data = html.split('\\"').join('"');

// --- Extract categories ---
const categories = {};
// Category structure: "id":"...","slug":"...","parent_id":"","image":"","description":...,"title":{"uz":"...","ru":"..."}
const catRe = /"id":"([0-9a-f-]{36})","slug":"([^"]+)","parent_id":"([^"]*)","image":"[^"]*"[^{}]{0,300}?"title":\{"uz":"([^"]+)","ru":"([^"]+)"/g;
let m;
while ((m = catRe.exec(data)) !== null) {
  if (!m[3]) { // parent_id is empty = top level category
    categories[m[1]] = { id: m[1], slug: m[2], uz: m[4], ru: m[5] };
  }
}
// Also capture categories with empty parent_id
const catRe2 = /"id":"([0-9a-f-]{36})","slug":"([^"]+)","parent_id":"","image":""[^{}]{0,300}?"title":\{"uz":"([^"]+)","ru":"([^"]+)"/g;
while ((m = catRe2.exec(data)) !== null) {
  if (!categories[m[1]]) categories[m[1]] = { id: m[1], slug: m[2], uz: m[3], ru: m[4] };
}

// Manual category mapping from what we know
const catSlugs = {
  'first': 'Birinchi taom',
  'salads': 'Salatlar',
  'second': 'Ikkinchi taom',
  'chicken': "Qiyma tovuq",
  'uyghur': "Uyg'ur taomlari",
  'steak': 'Steyk',
  'pizza': 'Pizza',
  'fish': 'Baliq taomlari',
  'plov': 'Palov va Samsa',
  'grill': 'Kabob',
  'dessert': 'Dessert',
  'drinks': 'Ichimliklar',
  'set': 'Set',
  'waffle': 'Vafel va Muzqaymoq',
  'addon': "Qo'shimcha",
  'mojito': 'Moxito'
};

console.log('Kategoriyalar topildi:', Object.keys(categories).length);
Object.values(categories).forEach(c => console.log(`  ${c.slug}: ${c.uz} / ${c.ru}`));

// --- Extract products ---
// Product structure: "out_price":42000,"currency":"UZS",...,"categories":["id"],...,"title":{"uz":"...","ru":"..."}
const products = [];
// Find product blocks: between { containing out_price ... title }
const prodRe = /"out_price":(\d+)[^{}]{0,200}"categories":\["([0-9a-f-]{36})"\][^{}]{0,500}"title":\{"uz":"([^"]+)","ru":"([^"]+)","en":"([^"]*)"\}/g;
while ((m = prodRe.exec(data)) !== null) {
  const price = parseInt(m[1]);
  const catId = m[2];
  const cat = categories[catId];
  const catSlug = cat ? cat.slug : 'other';
  const catUz = catSlugs[catSlug] || (cat ? cat.uz : 'Boshqa');
  if (price >= 1000 && price <= 5000000 && m[3] !== 'скидка на продукт') {
    products.push({
      uz: m[3],
      ru: m[4],
      price,
      category: catUz,
      catSlug
    });
  }
}

// Deduplicate
const seen = new Set();
const unique = products.filter(p => { const k=p.uz+p.price; if(seen.has(k)) return false; seen.add(k); return true; });

console.log('\n=== MAHSULOTLAR (' + unique.length + ') ===');
unique.forEach(p => console.log(`[${p.category}] ${p.uz} | ${p.ru} | ${p.price} so'm`));
fs.writeFileSync('tarnov_products.json', JSON.stringify(unique, null, 2));
console.log('\nJSON saqlandi.');
