# TalentHub: rus tili, anketa moduli, ilova — taklif (2026-10-19)

Holat: hech narsa qurilmagan, bu faqat reja. Verifix'dagi Tarnov hisobi
faqat KO'RIB CHIQILDI (anketa konstruktori, Telegram integratsiyasi,
bosqichlar), hech narsa saqlanmadi.

---

## 1. Rus tili — foydalanuvchi o'zi tanlaydi

### Hozirgi holat
- TalentHub sahifalarida (mijoz Mini App, nomzod kabineti, bot xabarlari)
  til tizimi UMUMAN YO'Q — hamma matn o'zbekcha va kod ichiga yozilgan.
- RestoOne'da `public/js/i18n.js` bor: u sahifadagi o'zbekcha matnni
  qidirib ruschasiga almashtiradi. TalentHub uchun bu usul TO'G'RI EMAS:
  - matn biroz o'zgarsa, tarjima jimgina ishlamay qoladi
  - dinamik matnlar (toast, kartalar) tushib qoladi
  - bot xabarlariga umuman ishlamaydi

### Taklif
1. **Til brauzerda emas, foydalanuvchi profilida saqlanadi**: `Client.lang`,
   `Candidate.lang` (`uz` | `ru`). Shunda bot xabarlari, Mini App va
   bildirishnomalar bir xil tilda bo'ladi.
   - Birinchi marta til Telegram'ning `language_code` qiymatidan olinadi:
     `ru` bo'lsa rus tili, qolgan hamma holatda o'zbek tili.
   - Keyin foydalanuvchi uni o'zi o'zgartiradi.
2. **Tilni tanlash joyi**:
   - botda `/start` dan keyingi birinchi savol: "Tilni tanlang / Выберите
     язык" (Verifix boti ham shunday qiladi)
   - `/til` buyrug'i
   - Mini App'da, Aloqa bo'limida UZ | RU tugmasi
3. **Bitta lug'at, matnlar kalit bo'yicha**: `src/data/i18n/uz.json` va
   `ru.json`. Frontend `t('vac.apply')`, server `t(lang, 'bot.welcome')`
   deb chaqiradi — ikkalasi bitta faylni o'qiydi. Taxminan 500–700 ta matn.
4. **AI va ma'lumotlardagi matnlar**:
   - Vakansiya: QAT'IY SHABLON maydonlarida saqlanadi, matnni server
     yig'adi. Shuning uchun u qo'shimcha ishsiz ikkala tilda chiqadi
     (AI shablon qarorining foydasi).
   - Rol, tuman va til nomlari (`roles.js`, `labels.js`): ruscha nomi
     uchun ikkinchi ustun qo'shiladi.
   - Rezyume xulosasi (summary/fitReason) hozir o'zbekcha. Endi tahlil
     paytida ikkala tilda yoziladi. Eski 742 ta yozuv bir marta, orqa
     fonda tarjima qilinadi.
   - Rezyumening asl matni (asosan ruscha) tarjima qilinmaydi.
5. **Qo'shimcha (ixtiyoriy) — o'zbek kirill yozuvi.** Lotindan kirillga
   o'girish qoidalar bilan qilinadi, lug'at kerak emas, shuning uchun arzon.
   Yoshi kattaroq nomzodlar uchun foydali; Tarnovning Verifix'dagi anketa
   nomlari ham kirillda.

### Bosqichlar
1. Til tizimi, mijoz Mini App'i va mijozga ketadigan bot xabarlari
2. Nomzod kabineti va nomzodga ketadigan bot xabarlari
3. AI matnlari ikki tilda va eski yozuvlar tarjimasi

Agentlik paneli (uni siz ishlatasiz) hozircha o'zbekcha qoladi, keyinroq
tarjima qilinadi.

---

## 2. Anketa moduli — o'z nomzod oqimi

### Verifix'da nima bor (Tarnov hisobida ko'rildi)
- **Konstruktor**: kartalar oqim ko'rinishida joylashgan. Javob
  variantidan keyingi savolga chiziq tortiladi (tarmoqlanish).
  "Проверить" va "Предпросмотр" tugmalari bor.
- **8 xil savol turi**: qisqa matn, uzun matn, son, sana, bitta tanlov,
  Ha/Yo'q, foto, fayl. Har savolni "majburiy" deb belgilash mumkin.
- **Nomzod maydonlariga bog'lash**: ism, tug'ilgan sana, jins, telefon,
  manzil, foto, rezyume, kutilgan maosh. Javob nomzod kartasiga o'zi tushadi.
- **Savollar ikki tilda** (RU | UZ).
- **Telegram**:
  - har filialga alohida bot ulanadi
  - lavozim, filial va vakansiya nomlari uchun tarjima jadvali bor
  - nomzod botda filtr orqali vakansiya tanlaydi
- **Tarnovdagi anketalar**: 8 ta, har birida 9–14 savol. Lavozimlar:
  ofitsiant, xostess, runner, zal menejeri, shashlikchi, salatchi,
  call-operator, kamera nazoratchisi.
- **Ofitsiant anketasidagi savollar**:
  - ism, tug'ilgan sana, jins
  - telefon (qo'lda yoziladi), manzil
  - filial, o'qiydimi
  - ish tajribasi, kutilgan maosh oralig'i
  - rus tili darajasi, foto
  - vakansiyani qayerdan bilgani, smena
- **Bosqichlar**: Yangi → Tel. intervyu → Suhbat → 2-suhbat → Stajirovka →
  Taklif → Qabul qildi | Rezerv | Rad.
- **Bazada 2171 nomzod**: 626 yangi, 363 rezervda, 1164 rad etilgan.

**Muhim:** Verifix'dagi 2171 nomzod TARNOVNIKI. Ularni Tarnovning ruxsati
va nomzodlarning roziligisiz TalentHub'ga ko'chirib bo'lmaydi (hh bilan
ham xuddi shu masala).

### Bizda qanday bo'ladi
Oqim:
1. E'lon chiqadi: Telegram kanal, Instagram, OLX yoki restoran
   eshigidagi QR kod.
2. Nomzod havolani bosadi: `t.me/TalentHubUzBot?start=v_<vakansiya>_<manba>`.
3. Til tanlanadi.
4. Anketa Mini App'da to'ldiriladi: har ekranda bitta savol, tepada
   progress chizig'i.
5. Nomzod bazaga SHABLON bo'yicha yoziladi.
6. Unga mos vakansiyalar va profili darhol ochiladi.

Nega bot chatida emas, Mini App'da: foto yuklash, "orqaga" qaytish, tanlov
tugmalari va javobni tekshirish qulay. 13 ta savolni chatda to'ldirish
nomzodni charchatadi.

### Verifix'dan yaxshiroq qiladigan qo'shimchalar
1. **Telefon "Kontaktni ulashish" tugmasi bilan olinadi.** Telegram
   haqiqiy, tasdiqlangan raqamni beradi, qo'lda yozish kerak bo'lmaydi.
   Bu bizdagi eng katta uchta muammoni yopadi:
   - noto'g'ri yozilgan telefon
   - dublikat nomzodlar (phoneKey)
   - arizadan kontakt ochishdagi telefon sharti
2. **Rozilik — alohida qadam**: "Ma'lumotlarimni qayta ishlash va ish
   beruvchilarga ko'rsatishga roziman".
   - Agentlik modeli uchun bu shart.
   - Anketa to'ldirilgan sana rozilik sanasi bo'ladi (14 kunlik qoida
     shunga tayanadi).
3. **Manba avtomatik aniqlanadi.** U havoladagi `_<manba>` qismidan
   olinadi, shuning uchun "Qayerdan bildingiz?" savoli kerak emas va
   ma'lumot aniqroq bo'ladi. Har kanaldan nechta nomzod kelgani va
   nechtasi ishga olingani ko'rinadi — reklamaga qayerda pul sarflashni
   bilasiz.
4. **Ovozli javob** (xostess, ofitsiant, menejer uchun): "O'zingiz haqida
   30 soniya gapiring (rus tilida)". AI ovozni matnga o'giradi va rus tili
   darajasini baholaydi. Bu nomzodning "rus tilim yaxshi" deb belgilashidan
   ishonchliroq.
5. **Dumaloq video** (Telegram'dagi video-xabar) — xostessning tashqi
   ko'rinishi va muomalasini ko'rish uchun.
6. **Sanitar kitobcha haqida savol.** Bizda bu maydon bor, Verifix'da yo'q.
7. **Ballar va saralash shartlari.**
   - Har javob variantiga ball qo'yiladi.
   - Ayrim javoblarda anketa to'xtaydi (masalan, 18 yoshdan kichik):
     nomzodga muloyim rad javobi beriladi va u rezervga tushadi.
   - Yig'ilgan ball fitScore'ga yoziladi, AI esa xulosani qat'iy shablon
     bo'yicha yozadi.
8. **Bir nechta variantni tanlash** (masalan, bir nechta smena yoki tuman).
   Verifix'da faqat bittasini tanlash mumkin.
9. **Tugatilmagan anketa haqida eslatma.** Nomzod botni ishga tushirgan
   bo'ladi, shuning uchun 2 soatdan keyin bot unga "anketangiz chala
   qoldi" deb yoza oladi.
10. **Nomzodlar qaysi savolda anketani tashlab ketayotganini ko'rsatadigan
    statistika.** Uzun anketani qayerdan qisqartirishni shu ko'rsatadi.
11. **Dublikat bo'lsa, mavjud yozuv yangilanadi.** Telefon bazada bor
    bo'lsa, yangi yozuv ochilmaydi (hozirgi `candidateKeys` orqali).
12. **Lavozimlar uchun tayyor shablonlar.** `roles.js`dagi har rol uchun
    boshlang'ich anketa tayyor turadi, siz faqat o'zgartirasiz.

**Konstruktor ko'rinishi.** Verifix'dagi oqim xaritasi o'rniga oddiy savollar
ro'yxati va "agar ... bo'lsa ko'rsat" sharti. Sabab: anketalarning deyarli
hammasi to'g'ri chiziqli, ko'pi bilan 1–2 ta tarmog'i bor. Xarita qurish
ko'p vaqt oladi va telefonda ishlamaydi.

### Bosqichlar
1. Ma'lumotlar modeli:
   - `Survey` — savollar (ikki tilda), nomzod maydoniga bog'lanish, ball, shart
   - `SurveyResponse` — javoblar, ball, manba, nomzod qaysi savolda to'xtagani
2. Nomzod anketasi Mini App'da, kontaktni ulashish va rozilik bilan
3. Bot havolalari, manbani aniqlash, eslatma
4. Agentlik panelida konstruktor (savollar ro'yxati va ko'rib chiqish)
5. AI xulosa va ball, ovozli javob, statistika

Tartib: avval til tizimi qilinadi (1-bo'lim, 1-bosqich), chunki anketa
birinchi kundanoq ikki tilda bo'lishi kerak.

---

## 3. Ilova ko'rinishi

### Variantlar
| Variant | Nima | Narx | Kamchilik |
|---|---|---|---|
| A. PWA | Sayt telefonga ikonka bilan "o'rnatiladi" va to'liq ekranda ochiladi | Deyarli bepul, mavjud kod ishlatiladi | Play Market va App Store'da bo'lmaydi; iPhone'da bildirishnoma faqat sayt o'rnatilgandan keyin keladi |
| B. Capacitor | Mavjud HTML sahifalar Play Market va App Store ilovasiga o'raladi | Google — bir marta $25, Apple — yiliga $99 | Apple "oddiy sayt o'ramasi"ni rad etishi mumkin: ilovada bildirishnoma, kamera kabi telefon funksiyalari bo'lishi kerak |
| C. To'liq native (Flutter) | Ilova noldan qayta yoziladi | Eng qimmati, bir necha oy | Ikkita alohida kod bazasini yuritish kerak bo'ladi |

### Tavsiyam
- **Nomzod va mijoz uchun Telegram Mini App QOLADI.** Ofitsiantlikka
  ariza beradigan odam buning uchun alohida ilova o'rnatmaydi, u
  Telegramda. Verifix ham nomzodlarni aynan Telegram bot orqali yig'adi.
  Hozir alohida ilova qilish ortiqcha xarajat.
- **Agentlik paneli (siz va rekruterlar uchun) PWA bo'ladi.**
  - Kompyuterda ham, telefonda ham ikonka bilan ochiladi.
  - Yangi ariza kelganda bildirishnoma keladi.
  - Ishi kam: hozirgi `manifest.json` va `sw.js` RestoOne (Tarnov) nomida,
    TalentHub uchun alohida manifest kerak.
- **Play Market / App Store ilovasini (B variant) keyinroq**, haqiqiy sabab
  paydo bo'lganda qilamiz: mijozlar ko'payib, Telegramdan tashqarida
  ishlashni so'rasa.
- **Agar "ilova" deganda RestoOne'ni (ofitsiantlar o'qishi) nazarda
  tutgan bo'lsangiz**, u yerda ilova mantiqliroq, chunki uni har kuni
  ishlatishadi. PWA u yerda qisman bor, B variant birinchi navbatda o'sha
  uchun.

---

## Umumiy tartib
1. Til tizimi va mijoz Mini App'ining ruscha varianti
2. Anketa: model, nomzod Mini App'i, kontaktni ulashish, rozilik, manba
3. Nomzod tomonining ruscha varianti, bot ikki tilda
4. Anketa konstruktori, ovozli javob, statistika
5. Agentlik paneli PWA sifatida
