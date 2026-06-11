// IIKO Excel dan menyu import qilish
const XLSX = require('xlsx');
const https = require('https');

const wb = XLSX.readFile('C:/Users/user/Desktop/iiko_menu.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, {header:1});

// Sarlavha qatorini topish
let headerRow = -1;
for(let i=0;i<data.length;i++){
  if(data[i] && data[i].indexOf('Название')>=0){headerRow=i;break;}
}

const headers = data[headerRow];
const typeIdx = headers.indexOf('Тип');
const priceIdx = headers.findIndex(h=>h&&h.toString().includes('Цена'));

// Taomlarni guruhlar bilan ajratish
const allRows = data.slice(headerRow+1).filter(r=>r && r.length > 2);

let currentCategory = 'Boshqa';
const menu = [];

// Indentatsiya darajasiga qarab kategoriyani aniqlash
// Guruh: index 1 da nom (1 bo'sh ustun)
// Kichik guruh: index 2 da nom (2 bo'sh ustun)
// Taom: index 3 da nom (3 bo'sh ustun)

const categoryStack = [];

for(const row of allRows){
  if(!row || row.every(v => v === null || v === undefined || v === '')) continue;

  const type = row[typeIdx];

  if(type === 'Группа'){
    // Qaysi indent darajasida?
    if(row[1] !== null && row[1] !== undefined){
      // Top level guruh
      currentCategory = row[1];
      categoryStack.length = 0;
      categoryStack.push(row[1]);
    } else if(row[2] !== null && row[2] !== undefined){
      // 2-daraja
      currentCategory = row[2];
      categoryStack[1] = row[2];
    } else if(row[3] !== null && row[3] !== undefined){
      currentCategory = row[3];
    }
  } else if(type === 'Блюдо'){
    // Taom nomi index 3 da
    const name = row[3] || row[2] || row[1];
    const price = row[priceIdx];

    if(name && price){
      // Top level guruh "Бар А" dan "Меню" ga o'tish
      const topGroup = categoryStack[0];
      // Kategoriyani tozalash
      let category = currentCategory;
      if(topGroup === 'Бар А') category = 'Bar';

      menu.push({
        name: String(name).trim(),
        category: String(category).trim(),
        price: Math.round(Number(price))
      });
    }
  }
}

console.log(`Jami ${menu.length} ta taom topildi`);

// Kategoriyalar ro'yxati
const cats = [...new Set(menu.map(m=>m.category))];
console.log('\nKategoriyalar:', cats.length, 'ta:');
cats.forEach(c=>{
  const count = menu.filter(m=>m.category===c).length;
  console.log(` - ${c}: ${count} ta taom`);
});

console.log('\nNamuna (birinchi 5 ta):');
menu.slice(0,5).forEach(m=>console.log(` ${m.name} | ${m.category} | ${m.price.toLocaleString()} UZS`));

// Faylga saqlaymiz
const fs = require('fs');
fs.writeFileSync('C:/Users/user/tarnov-platform/iiko_menu_parsed.json', JSON.stringify(menu, null, 2), 'utf8');
console.log('\nJSON saqlandi: iiko_menu_parsed.json');
