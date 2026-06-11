// IIKO dan faqat "Меню" kategoriyasini import qilish
const XLSX = require('xlsx');
const fs = require('fs');

const wb = XLSX.readFile('C:/Users/user/Desktop/iiko_menu2.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, {header:1});

let headerRow = -1;
for(let i=0;i<data.length;i++){
  if(data[i]&&data[i].indexOf('Название')>=0){headerRow=i;break;}
}

const headers = data[headerRow];
const typeIdx = headers.indexOf('Тип');
const priceIdx = headers.findIndex(h=>h&&h.toString().includes('Цена'));

const allRows = data.slice(headerRow+1).filter(r=>r&&r.length>2);

// Faqat "Меню" ichidagi taomlarni olish
let inMenu = false;
let cats = ['','','',''];
const menu = [];

for(const row of allRows){
  if(!row||row.every(v=>v===null||v===undefined||v==='')) continue;
  const type = row[typeIdx];

  if(type==='Группа'){
    // Top-level guruhni aniqlash
    for(let d=0;d<=1;d++){
      if(row[d]!==null&&row[d]!==undefined&&row[d]!==''){
        const name = String(row[d]);
        if(name==='Меню') { inMenu=true; cats=['Меню','','','']; }
        else if(name==='Бар А'||name==='Меню Доставка') { inMenu=false; }
        for(let k=d+1;k<=3;k++) cats[k]='';
        break;
      }
    }
    // Sub-kategoriyalar
    if(inMenu){
      for(let d=2;d<=3;d++){
        if(row[d]!==null&&row[d]!==undefined&&row[d]!==''){
          cats[d]=String(row[d]);
          for(let k=d+1;k<=3;k++) cats[k]='';
          break;
        }
      }
      // Level-1 sub-kategoriyalar (Меню ichidagi)
      if(row[1]!==null&&row[1]!==undefined&&row[1]!==''&&String(row[1])!=='Меню'){
        cats[1]=String(row[1]); cats[2]=''; cats[3]='';
      }
    }
  } else if(type==='Блюдо'&&inMenu){
    let name='';
    for(let d=3;d>=0;d--){
      if(row[d]!==null&&row[d]!==undefined&&row[d]!==''){name=String(row[d]);break;}
    }
    const price = row[priceIdx];
    let cat='';
    for(let d=3;d>=0;d--){ if(cats[d]){cat=cats[d];break;} }

    if(name&&price>0){
      menu.push({
        name: name.trim(),
        category: cat.trim(),
        price: Math.round(Number(price))
      });
    }
  }
}

// Kategoriyalar statistikasi
const catList = [...new Set(menu.map(m=>m.category))];
console.log(`\n✅ Jami: ${menu.length} ta taom, ${catList.length} ta kategoriya`);
catList.forEach(c=>{
  const items = menu.filter(m=>m.category===c);
  console.log(`  ${c}: ${items.length} ta | Namuna: ${items[0].name} (${items[0].price.toLocaleString()} UZS)`);
});

fs.writeFileSync('iiko_clean_menu.json', JSON.stringify(menu, null, 2), 'utf8');
console.log('\n✅ iiko_clean_menu.json saqlandi');
