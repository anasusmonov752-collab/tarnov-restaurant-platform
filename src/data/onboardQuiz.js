// ── BIRINCHI KUN TESTI (services/onboard) ────────────────────
// Yangi xodimga botda 5 ta savol — xizmat standartlari. Maqsad imtihon
// emas: birinchi kundan oldin asosiy qoidalarni eslatish va mijozga
// "xodim tayyor" signalini berish. Ikki to'plam: zal (ofitsiant, xostess,
// barmen, kassir, menejer) va oshxona (oshpaz). c — to'g'ri variant indeksi.

const q = (uz, ru, opts, c) => ({ uz, ru, opts, c });
const o = (uz, ru) => ({ uz, ru });

const HALL = [
  q('Mehmon kirganda uni qachon kutib olish kerak?', 'Когда нужно встретить вошедшего гостя?',
    [o('3 soniya ichida', 'В течение 3 секунд'), o('Bir daqiqa ichida', 'В течение минуты'), o('Mehmon chaqirganda', 'Когда гость позовёт')], 0),
  q('Buyurtmani qabul qilgach nima qilasiz?', 'Что вы делаете после приёма заказа?',
    [o('Darhol oshxonaga ketaman', 'Сразу иду на кухню'), o('Mehmonga takrorlab, tasdiqlataman', 'Повторяю гостю и уточняю'), o('Hech narsa', 'Ничего')], 1),
  q('Mehmon taomdan norozi bo\'lsa?', 'Гость недоволен блюдом?',
    [o('Bahslashaman', 'Спорю'), o('E\'tibor bermayman', 'Не обращаю внимания'), o('Kechirim so\'rayman, menejerga aytaman, almashtirishni taklif qilaman', 'Извиняюсь, сообщаю менеджеру, предлагаю замену')], 2),
  q('Qo\'shimcha sotuv (upsell) nima?', 'Что такое допродажа (upsell)?',
    [o('Taomga mos ichimlik yoki desert taklif qilish', 'Предложить напиток или десерт к блюду'), o('Qimmat taomni majburlash', 'Навязать дорогое блюдо'), o('Hisobga qo\'shib yozish', 'Дописать в счёт')], 0),
  q('Smenaga qachon kelish kerak?', 'Когда нужно приходить на смену?',
    [o('Aynan smena boshlanganda', 'Ровно к началу смены'), o('10–15 daqiqa oldin, formada', 'За 10–15 минут, в форме'), o('Mehmonlar kelganda', 'Когда придут гости')], 1)
];

const KITCHEN = [
  q('Xom go\'sht va tayyor mahsulot uchun qanday taxta?', 'Какие доски для сырого мяса и готовых продуктов?',
    [o('Alohida taxta va pichoq', 'Отдельные доски и ножи'), o('Bitta taxta, yuvib ishlatiladi', 'Одна доска, моем между'), o('Farqi yo\'q', 'Без разницы')], 0),
  q('Qo\'lni qachon yuvish kerak?', 'Когда нужно мыть руки?',
    [o('Faqat smena boshida', 'Только в начале смены'), o('Ishni boshlashda va xom mahsulotdan keyin', 'В начале работы и после сырых продуктов'), o('Iflos bo\'lsagina', 'Только если грязные')], 1),
  q('Muzlatgichdagi mahsulot qanday saqlanadi?', 'Как хранить продукты в холодильнике?',
    [o('Ochiq holda', 'В открытом виде'), o('Belgisiz idishda', 'В таре без маркировки'), o('Yopiq, nomi va sanasi yozilgan', 'Закрыто, с названием и датой')], 2),
  q('Taom yerga tushib ketsa?', 'Блюдо упало на пол?',
    [o('Tashlab yuboriladi', 'Выбрасывается'), o('Yuvib, beriladi', 'Промывается и подаётся'), o('Mehmon bilmasa — beriladi', 'Подаётся, если гость не видел')], 0),
  q('Smenaga qachon kelish kerak?', 'Когда нужно приходить на смену?',
    [o('Aynan smena boshlanganda', 'Ровно к началу смены'), o('10–15 daqiqa oldin, formada', 'За 10–15 минут, в форме'), o('Buyurtmalar kelganda', 'Когда пойдут заказы')], 1)
];

const forRole = role => role === 'oshpaz' ? KITCHEN : HALL;

module.exports = { HALL, KITCHEN, forRole };
