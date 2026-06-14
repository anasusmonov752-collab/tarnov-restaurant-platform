// ═══════════════════════════════════════════════════════════
//  i18n — Til tarjima tizimi (O'zbek ⇄ Rus)
//  Runtime DOM translation — mavjud kodga tegmaydi
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Apostrof / bo'shliqni normallashtirish (kalit moslashtirish uchun) ──
  function norm(s) {
    return s
      .replace(/[’ʻ‘`´]/g, "'")  // turli apostroflar → '
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── O'zbekcha → Ruscha lug'at ──
  // Kalit: o'zbekcha matn (normallashtirilgan), Qiymat: ruscha
  const UZ_RU = {
    // ─── Umumiy / Login ───
    "Restaurant HR Platform": "Платформа HR ресторана",
    "Xodimlar uchun aqlli o'quv tizimi": "Умная система обучения персонала",
    "Xodimlar uchun": "Для сотрудников",
    "aqlli o'quv": "умное обучение",
    "tizimi": "система",
    "— Restoran tanlang —": "— Выберите ресторан —",
    "— Restorani tanlang —": "— Выберите ресторан —",
    "Restoran xodimlarini o'qitish, bilimlarini baholash va KPI ni kuzatish — barchasi bitta qulay platformada.":
      "Обучение персонала ресторана, оценка знаний и отслеживание KPI — всё на одной удобной платформе.",
    "Test tizimi": "Система тестов",
    "Menyu bo'yicha bilimlarni avtomatik baholash": "Автоматическая оценка знаний по меню",
    "KPI hisoboti": "Отчёт KPI",
    "Har xodim uchun oylik ish haqi hisobi": "Расчёт зарплаты для каждого сотрудника",
    "O'quv modullar": "Учебные модули",
    "O'quv Modullar": "Учебные модули",
    "Darslar, videolar va quiz testlari": "Уроки, видео и квиз-тесты",
    "Adaptatsiya": "Адаптация",
    "Yangi xodimlarni onboarding qilish": "Онбординг новых сотрудников",
    "Xavfsiz · Tez · Ishonchli": "Безопасно · Быстро · Надёжно",
    "HR Platform": "HR Платформа",
    "HR Training Platform": "Платформа обучения HR",
    "Xush kelibsiz 👋": "Добро пожаловать 👋",
    "Xush kelibsiz": "Добро пожаловать",
    "Platformaga kirish uchun rolni tanlang": "Выберите роль для входа на платформу",
    "Super": "Супер",
    "Admin": "Админ",
    "Ofitsiant": "Официант",
    "Email manzil": "Электронная почта",
    "Parol": "Пароль",
    "Kirish": "Войти",
    "Restorani tanlang": "Выберите ресторан",
    "Restoranni tanlang": "Выберите ресторан",
    "© 2026 RestoPro · Barcha huquqlar himoyalangan": "© 2026 RestoPro · Все права защищены",
    "RestoPro — Kirish": "RestoPro — Вход",
    "RestoPro — Admin Panel": "RestoPro — Панель администратора",
    "RestoPro — Super Admin": "RestoPro — Супер админ",
    "RestoPro — Xodim": "RestoPro — Сотрудник",

    // ─── Navigatsiya / Sahifalar ───
    "Dashboard": "Панель",
    "Boshqaruv": "Управление",
    "Menyu": "Меню",
    "Menyu boshqaruvi": "Управление меню",
    "Ofitsiantlar": "Официанты",
    "Ofitsiant": "Официант",
    "Savollar": "Вопросы",
    "Test savollari": "Тестовые вопросы",
    "Test kunlari": "Дни тестов",
    "Test natijalari": "Результаты тестов",
    "E'lonlar": "Объявления",
    "Test & E'lonlar": "Тесты и объявления",
    "Xodimlar": "Сотрудники",
    "Restoranlar": "Рестораны",
    "Restoran": "Ресторан",
    "Profil": "Профиль",
    "KPI": "KPI",
    "KPI Hisoboti": "Отчёт KPI",
    "KPI Darajasi": "Уровень KPI",
    "Bosh sahifa": "Главная",
    "Test": "Тест",
    "Tarix": "История",
    "Ko'proq": "Ещё",
    "Qo'shimcha bo'limlar": "Дополнительные разделы",

    // ─── Dashboard / Statistika ───
    "Restoran boshqaruv paneli": "Панель управления рестораном",
    "Barcha restoranlar umumiy ko'rinishi": "Общий обзор всех ресторанов",
    "Barcha restoranlarni boshqarish": "Управление всеми ресторанами",
    "So'nggi e'lonlar": "Последние объявления",
    "So'nggi natijalar": "Последние результаты",
    "Menyu taomlar": "Блюда меню",
    "Faol ofitsiantlar": "Активные официанты",
    "Savollar bazasi": "База вопросов",
    "Sertifikatlar": "Сертификаты",
    "Sertifikatlar soni": "Кол-во сертификатов",
    "Sertifikat": "Сертификат",
    "Jami testlar": "Всего тестов",
    "Eng yaxshi": "Лучший",
    "Eng yaxshi natija": "Лучший результат",
    "O'rtacha": "Средний",
    "O'rtacha ball": "Средний балл",
    "O'rtacha natija": "Средний результат",
    "Bugun": "Сегодня",
    "LIVE": "LIVE",
    "Neon": "Неон",

    // ─── Menyu / Taomlar ───
    "Taom qo'shish": "Добавить блюдо",
    "Yangi taom": "Новое блюдо",
    "Yangi taom qo'shing": "Добавьте новое блюдо",
    "Taomlarni qo'shish, tahrirlash va o'chirish": "Добавление, редактирование и удаление блюд",
    "Barcha taomlar, narxlar va tarkiblar": "Все блюда, цены и составы",
    "Barcha kategoriyalar": "Все категории",
    "Taom qidirish...": "Поиск блюда...",
    "Taom topilmadi": "Блюдо не найдено",
    "Taomning qisqacha tavsifi...": "Краткое описание блюда...",
    "Tavsif": "Описание",
    "Tavsif berilmagan": "Описание не указано",
    "Tarkib": "Состав",
    "Allergiyalar": "Аллергены",
    "Allergenlar": "Аллергены",
    "Tavsiya": "Рекомендация",
    "Tavsiya iborasi": "Фраза рекомендации",
    "Narx": "Цена",
    "Rasm": "Изображение",
    "Foto": "Фото",
    "Kategoriya": "Категория",
    "Nomi": "Название",
    "Salatlar": "Салаты",
    "Sho'rvalar": "Супы",
    "Asosiy taomlar": "Основные блюда",
    "Ichimliklar": "Напитки",
    "Shirinliklar": "Десерты",
    "Non mahsulotlari": "Хлебобулочные изделия",
    "Yangi rasm yuklamasangiz, mavjud rasm saqlanadi": "Если не загрузите новое изображение, сохранится текущее",

    // ─── Ofitsiantlar ───
    "Ofitsiant qo'shish": "Добавить официанта",
    "PIN tayinlash va ofitsiantlarni boshqarish": "Назначение PIN и управление официантами",
    "Ofitsiant yo'q": "Нет официантов",
    "Ism": "Имя",
    "Ism bo'yicha qidirish": "Поиск по имени",
    "Ism qidirish...": "Поиск имени...",
    "PIN": "PIN",
    "PIN kod": "PIN код",
    "Shablon yuklab oling": "Скачать шаблон",
    "Shablon": "Шаблон",
    "CSV yuklash": "Загрузить CSV",
    "Import ko'rinishi": "Предпросмотр импорта",
    "Lavozim": "Должность",
    "Telefon": "Телефон",
    "Holat": "Статус",
    "Status": "Статус",
    "Amallar": "Действия",
    "Faol": "Активен",
    "Nofaol": "Неактивен",

    // ─── Savollar ───
    "Savol qo'shish": "Добавить вопрос",
    "Yangi savol qo'shing": "Добавьте новый вопрос",
    "Test uchun savollar bazasini boshqarish": "Управление базой вопросов для теста",
    "Savol matni...": "Текст вопроса...",
    "Savol topilmadi": "Вопрос не найден",
    "Barcha darajalar": "Все уровни",
    "Oson": "Лёгкий",
    "O'rta": "Средний",
    "Qiyin": "Сложный",
    "Daraja": "Уровень",
    "To'g'ri javob": "Правильный ответ",
    "Variant": "Вариант",
    "Maksimal 6 ta variant": "Максимум 6 вариантов",

    // ─── Test kunlari ───
    "Ofitsiantlar uchun test kunlarini belgilash": "Назначение дней тестов для официантов",
    "Hali test kuni belgilanmagan": "Дни тестов ещё не назначены",
    "Test kuni belgilandi": "День теста назначен",
    "Test kuni": "День теста",
    "Bugun test kuni — menyu yashirilgan": "Сегодня день теста — меню скрыто",
    "Bugun test kuni!": "Сегодня день теста!",
    "Menyu ofitsiantlardan yashirilgan": "Меню скрыто от официантов",
    "Menyu test kuni yashiriladi.": "Меню скрывается в день теста.",

    // ─── Test (waiter) ───
    "Test topshirish": "Пройти тест",
    "Testni boshlash": "Начать тест",
    "Test topshiring": "Пройдите тест",
    "Har savol uchun 30 soniya": "30 секунд на каждый вопрос",
    "Hali test topshirmadingiz": "Вы ещё не проходили тест",
    "Oxirgi test": "Последний тест",
    "Test soni": "Кол-во тестов",
    "Test tarixi": "История тестов",
    "Test natijasi batafsil": "Подробный результат теста",
    "Keyingisi": "Далее",
    "Ball": "Балл",
    "Sana": "Дата",
    "Reyting": "Рейтинг",
    "Reyting jadvali": "Таблица рейтинга",
    "Restoran ichidagi eng yaxshi natijalar": "Лучшие результаты в ресторане",

    // ─── E'lonlar ───
    "E'lon yuborish": "Отправить объявление",
    "Ofitsiantlarga xabar yuborish": "Отправить сообщение официантам",
    "Hali e'lon yo'q": "Пока нет объявлений",
    "E'lon sarlavhasi": "Заголовок объявления",
    "E'lon matni...": "Текст объявления...",

    // ─── Adaptatsiya ───
    "Yangi xodimlar uchun restoran ma'lumotlari": "Информация о ресторане для новых сотрудников",
    "Restoran haqida": "О ресторане",
    "Onboarding": "Онбординг",
    "Hujjatlar": "Документы",
    "Restoran tarixi": "История ресторана",
    "Bizning tarix": "Наша история",
    "Restoran qachon va qanday tashkil topgani haqida": "О том, когда и как был основан ресторан",
    "Missiya": "Миссия",
    "Bizning missiya": "Наша миссия",
    "Restoranning asosiy maqsadi va yo'nalishi": "Основная цель и направление ресторана",
    "Qadriyatlar": "Ценности",
    "Har bir qator — alohida qadriyat": "Каждая строка — отдельная ценность",
    "Boshqaruv": "Руководство",
    "Boshqaruv xodimlari": "Сотрудники руководства",
    "Hali xodim qo'shilmagan": "Сотрудники ещё не добавлены",
    "Hali hujjat qo'shilmagan": "Документы ещё не добавлены",
    "Hali bosqich qo'shilmagan": "Этапы ещё не добавлены",
    "Bosqich qo'shish": "Добавить этап",
    "Hujjat qo'shish": "Добавить документ",
    "Onboarding bosqichlari": "Этапы онбординга",
    "Hujjatlar va qoidalar": "Документы и правила",
    "Manzil": "Адрес",
    "Mazmun": "Содержание",
    "Majburiy o'qish": "Обязательное чтение",
    "MAJBURIY": "ОБЯЗАТЕЛЬНО",
    "JONLI KO'RINISH": "ЖИВОЙ ПРОСМОТР",
    "Tahrirlamoq": "Редактировать",
    "Avtomatik saqlash": "Автосохранение",
    "Keyingi: Missiya": "Далее: Миссия",
    "Keyingi: Qadriyatlar": "Далее: Ценности",
    "Orqaga": "Назад",

    // ─── O'quv modullar ───
    "Modul qo'shish": "Добавить модуль",
    "Birinchi o'quv kursini yaratib, xodimlaringizni o'qiting": "Создайте первый учебный курс и обучайте сотрудников",
    "Hali modul yo'q": "Пока нет модулей",
    "Dars qo'shish": "Добавить урок",
    "Darslar": "Уроки",
    "Mini Quiz": "Мини-квиз",
    "Mini-Quiz savollar": "Вопросы мини-квиза",
    "Quiz": "Квиз",
    "Quiz topshirib badge oling": "Пройдите квиз и получите бейдж",
    "Quiz rejimi": "Режим квиза",
    "Flashcard": "Карточки",
    "Flashcard rejimi": "Режим карточек",
    "Kartochkani bosib orqasini ko'ring": "Нажмите на карточку, чтобы увидеть обратную сторону",
    "Kartochkalar aralashtirildi!": "Карточки перемешаны!",
    "Strukturali kurslar · Video darslar · Mini-quiz testlar": "Структурированные курсы · Видеоуроки · Мини-квизы",
    "LEARNING MANAGEMENT SYSTEM": "СИСТЕМА УПРАВЛЕНИЯ ОБУЧЕНИЕМ",
    "Umumiy progress": "Общий прогресс",
    "Ofitsiantlar progressi": "Прогресс официантов",
    "Tugatdilar": "Завершили",
    "Tartib raqami": "Порядковый номер",
    "Emoji": "Эмодзи",
    "Emoji ikonka": "Эмодзи иконка",
    "Rang": "Цвет",

    // ─── KPI ───
    "Xodimlar bilim darajasi — joriy 10 kunlik davr bo'yicha": "Уровень знаний сотрудников — за текущий 10-дневный период",
    "Bir davr = bir oylik hisob": "Один период = месячный расчёт",
    "Ish haqi ta'siri": "Влияние на зарплату",
    "Batafsil tahlil": "Подробный анализ",
    "Barcha xodimlar KPI si": "KPI всех сотрудников",
    "MASTER": "МАСТЕР",
    "PRO": "ПРО",
    "YAXSHI": "ХОРОШО",
    "OGOHLANTIRISH": "ПРЕДУПРЕЖДЕНИЕ",
    "JAZO": "ШТРАФ",
    "NOMUVOFIQ": "НЕ СООТВЕТСТВУЕТ",
    "Ketma-ket past": "Подряд низкий",
    "manfiy": "отрицательный",

    // ─── Restoranlar (super-admin) ───
    "Yangi restoran": "Новый ресторан",
    "Yangi restoran qo'shish uchun tugmani bosing": "Нажмите кнопку, чтобы добавить новый ресторан",
    "Hali restoran yo'q": "Пока нет ресторанов",
    "Restoranlar ro'yxati": "Список ресторанов",
    "Admin email": "Email админа",
    "Bosh Administrator": "Главный администратор",
    "Restoran Admin": "Админ ресторана",
    "Tarif": "Тариф",
    "Tarif rejasi": "Тарифный план",
    "Basic": "Базовый",
    "Premium": "Премиум",
    "Enterprise": "Корпоративный",

    // ─── Welcome wizard ───
    "Platformadan foydalanishni boshlash uchun 3 qadam": "3 шага, чтобы начать пользоваться платформой",
    "Tizimga kirdingiz": "Вы вошли в систему",
    "PIN kod bilan muvaffaqiyatli": "Успешно с PIN-кодом",
    "Menyuni o'rganing": "Изучите меню",
    "Menyuni ko'rish": "Посмотреть меню",
    "Keyinroq": "Позже",
    "Bugun ham yaxshi xizmat ko'rsating": "Сегодня тоже хорошо обслуживайте",

    // ─── Tugmalar / Umumiy amallar ───
    "Saqlash": "Сохранить",
    "Saqlandi": "Сохранено",
    "Bekor": "Отмена",
    "Bekor qilish": "Отменить",
    "Yopish": "Закрыть",
    "Qo'shish": "Добавить",
    "Tahrirlash": "Редактировать",
    "O'chirish": "Удалить",
    "Ko'rish": "Просмотр",
    "Batafsil": "Подробнее",
    "Batafsil tahlil": "Подробный анализ",
    "Yuklash": "Загрузить",
    "Yuklab olish": "Скачать",
    "Qidirish": "Поиск",
    "Barchasi": "Все",
    "Izoh": "Комментарий",
    "Muddat": "Срок",
    "Checklist": "Чек-лист",
    "Mening checklistim": "Мой чек-лист",
    "Onboarding Checklist": "Чек-лист онбординга",
    "Vazifa qo'shish": "Добавить задачу",
    "Hali vazifa qo'shilmagan": "Задачи ещё не добавлены",
    "Yangi xodimlar uchun vazifalar ro'yxati": "Список задач для новых сотрудников",
    "Vazifa nomini kiriting": "Введите название задачи",
    "Xodim": "Сотрудник",
    "Xodim qo'shish": "Добавить сотрудника",
    "Xodim topilmadi": "Сотрудник не найден",
    "Natija topilmadi": "Результат не найден",
    "Hali natija yo'q": "Пока нет результатов",
    "Hali progress yo'q": "Пока нет прогресса",

    // ─── Toast / Xabarlar ───
    "Xatolik": "Ошибка",
    "Xatolik yuz berdi": "Произошла ошибка",
    "Server xatosi": "Ошибка сервера",
    "O'chirildi": "Удалено",
    "Restoran qo'shildi": "Ресторан добавлен",
    "Restoran yangilandi": "Ресторан обновлён",
    "Restoran o'chirildi": "Ресторан удалён",
    "Holat yangilandi": "Статус обновлён",
    "Sarlavha kiritish shart": "Необходимо ввести заголовок",
    "Sarlavha va matn majburiy": "Заголовок и текст обязательны",
    "Parol majburiy": "Пароль обязателен",
    "Ism va lavozim kiritish shart": "Необходимо ввести имя и должность",
    "Quiz saqlandi!": "Квиз сохранён!",
    "Modul nomi kiritilmagan": "Название модуля не введено",
    "Dars nomi kiritilmagan": "Название урока не введено",
    "Test kuni belgilandi": "День теста назначен",
    "PDF yuklab olindi!": "PDF скачан!",
    "Shablon yuklandi": "Шаблон загружен",
    "Iltimos .csv formatda yuklang.": "Пожалуйста, загрузите в формате .csv",
    "KPI sozlamalari saqlandi ✓": "Настройки KPI сохранены ✓",
    "KPI yuklanmadi": "KPI не загружен",
    "Sozlamalar yuklanmadi": "Настройки не загружены",
    "Checklist yuklanmadi": "Чек-лист не загружен",
    "Yangi versiya mavjud — sahifani yangilang": "Доступна новая версия — обновите страницу",

    // ─── Sertifikat ───
    "MUVAFFAQIYAT SERTIFIKATI": "СЕРТИФИКАТ ДОСТИЖЕНИЯ",
    "TARNOV RESTAURANT PLATFORM": "ПЛАТФОРМА РЕСТОРАНА TARNOV",

    // ─── Form label lar (* bilan) ───
    "Admin email *": "Email админа *",
    "Ism *": "Имя *",
    "Ism familiya *": "Имя и фамилия *",
    "Lavozim *": "Должность *",
    "Sarlavha *": "Заголовок *",
    "Davr *": "Период *",
    "Taom nomi *": "Название блюда *",
    "Kategoriya *": "Категория *",
    "4 xonali PIN *": "4-значный PIN *",
    "Restoran nomi *": "Название ресторана *",
    "Savol matni *": "Текст вопроса *",
    "Vazifa nomi *": "Название задачи *",
    "Modul nomi *": "Название модуля *",
    "Dars nomi *": "Название урока *",

    // ─── Form maydonlari ───
    "Modul nomi": "Название модуля",
    "Dars nomi": "Название урока",
    "Minimal ball (%)": "Минимальный балл (%)",
    "Oylik narx (so'm)": "Месячная цена (сум)",
    "Quiz uchun minimal ball (%)": "Минимальный балл для квиза (%)",
    "Tarkib (vergul bilan)": "Состав (через запятую)",
    "Menyu taomi (ixtiyoriy)": "Блюдо меню (необязательно)",
    "Missiya matni...": "Текст миссии...",
    "Progress": "Прогресс",
    "Savol": "Вопрос",
    "Tahrir": "Редактировать",
    "Restoran qo'shish": "Добавить ресторан",
    "Variant qo'shish": "Добавить вариант",
    "Yo'l xaritasi": "Дорожная карта",
    "Qo'shilgan": "Добавлено",
    "Sertifikat oldi": "Получил сертификат",

    // ─── Select option lar ───
    "— Taom tanlang —": "— Выберите блюдо —",
    "— Taom tanlamang —": "— Не выбирать блюдо —",
    "— Ma'lumot yo'q": "— Нет данных",
    "— Ma'lumot yo'q —": "— Нет данных —",

    // ─── Bo'sh holatlar ───
    "Hujjatlar hali qo'shilmagan": "Документы ещё не добавлены",
    "Jamoa ma'lumotlari hali qo'shilmagan": "Данные команды ещё не добавлены",
    "Ma'lumotlar hali to'ldirilmagan": "Данные ещё не заполнены",
    "Onboarding bosqichlari hali qo'shilmagan": "Этапы онбординга ещё не добавлены",
    "Hali natijalar yo'q": "Пока нет результатов",
    "Hali natijalar yo'q.": "Пока нет результатов.",
    "Admin o'quv modullar qo'shgach ko'rinadi": "Появится после добавления модулей админом",

    // ─── Test / Tabrik ───
    "Test yakunlandi!": "Тест завершён!",
    "Tabriklaymiz! Sertifikat oldingiz! 🏆": "Поздравляем! Вы получили сертификат! 🏆",
    "✓ Test uchun tayyor": "✓ Готов к тесту",
    "✕ Yetarli savol yo'q": "✕ Недостаточно вопросов",
    "⚡ Bugun TEST KUNI!": "⚡ Сегодня ДЕНЬ ТЕСТА!",
    "Testga tayyorlanish uchun vaqtingizni sarflang.": "Потратьте время на подготовку к тесту.",
    "Menyu yashirilgan. Test topshirishga tayyorlaning.": "Меню скрыто. Готовьтесь к тесту.",
    "Bugun test kuni emas. Test kunlari admin tomonidan belgilanadi.": "Сегодня не день теста. Дни тестов назначаются админом.",
    "Bugun test kuni. Testni boshlashdan oldin yaxshilab tayyorlaning!": "Сегодня день теста. Хорошо подготовьтесь перед началом!",
    "Siz bugun testni topshirdingiz! Natija:": "Вы прошли тест сегодня! Результат:",
    "Keyingi test:": "Следующий тест:",
    "menyu bo'yicha bilimlarini muvaffaqiyatli tasdiqladi": "успешно подтвердил знания по меню",

    // ─── Ofitsiantlar ───
    "Ofitsiantlar test natijalari va statistika": "Результаты тестов официантов и статистика",
    "Ofitsiantlar yo'q": "Нет официантов",
    "Yo'q": "Нет",
    "ustunlari bo'lishi kerak.": "столбцы должны быть.",
    "Joriy 10 kunlik davrdagi test natijasi asosida (1 davr = 1 test = 1 oylik hisob).": "На основе результатов теста за текущий 10-дневный период (1 период = 1 тест = месячный расчёт).",
    "Test kunlari belgilanganda ofitsiantlar menyuni ko'ra olmaydi va test topshirishi mumkin.": "В назначенные дни тестов официанты не видят меню и могут пройти тест.",

    // ─── Yordamchi matnlar ───
    "Excel/CSV formatda yuklash uchun:": "Для загрузки в формате Excel/CSV:",
    "Har bir daraja uchun minimal ball chegarasi va ish haqi ta'sirini belgilang.": "Установите минимальный балл и влияние на зарплату для каждого уровня.",
    "(har bir qator — alohida vazifa)": "(каждая строка — отдельная задача)",
    "(yangilash uchun to'ldiring)": "(заполните для обновления)",
    "💡 Har bir qator = alohida qadriyat chip": "💡 Каждая строка = отдельный чип ценности",

    // ─── PWA ───
    "Ilovani o'rnating!": "Установите приложение!",
    "Bosh ekranga qo'shing — tezroq kirish": "Добавьте на главный экран — быстрый доступ",
    "O'rnatish": "Установить",
    "Tarnov Training — telefonga qo'shing": "Tarnov Training — добавьте на телефон",
  };

  // Normallashtirib qayta indekslangan lug'at
  const INDEX = {};
  for (const k in UZ_RU) INDEX[norm(k)] = UZ_RU[k];

  let LANG = localStorage.getItem('tarnov_lang') || 'uz';

  // ── Bitta matnni tarjima qilish ──
  function tr(text) {
    if (LANG !== 'ru') return null;
    const key = norm(text);
    if (!key) return null;
    return INDEX[key] || null;
  }

  // ── Text node larni va attributelarni tarjima qilish ──
  function translateEl(root) {
    if (LANG !== 'ru') return;

    // 1) Matn node lari
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let cur;
    while ((cur = walker.nextNode())) nodes.push(cur);
    nodes.forEach(n => {
      const orig = n.nodeValue;
      const t = tr(orig);
      if (t !== null && t !== orig.trim()) {
        // asl bo'shliqlarni saqlash
        const lead = orig.match(/^\s*/)[0];
        const trail = orig.match(/\s*$/)[0];
        if (!n._i18nOrig) n._i18nOrig = orig;
        n.nodeValue = lead + t + trail;
      }
    });

    // 2) placeholder / title attributelar
    const attrEls = root.querySelectorAll('[placeholder],[title]');
    attrEls.forEach(el => {
      ['placeholder', 'title'].forEach(a => {
        const v = el.getAttribute(a);
        if (!v) return;
        const t = tr(v);
        if (t !== null && t !== v) {
          if (!el['_i18n_' + a]) el['_i18n_' + a] = v;
          el.setAttribute(a, t);
        }
      });
    });

    // 3) Element o'zi text node bo'lsa (root ham)
    if (root.nodeType === 1 && root.children.length === 0 && root.textContent.trim()) {
      const t = tr(root.textContent);
      if (t !== null && t !== root.textContent.trim()) {
        if (!root._i18nOrig) root._i18nOrig = root.textContent;
        root.textContent = t;
      }
    }
  }

  function translatePage() {
    translateEl(document.body);
    // <title> ham
    const tt = tr(document.title);
    if (tt) document.title = tt;
  }

  // ── MutationObserver — dinamik kontentni avtomatik tarjima ──
  let observer = null;
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(muts => {
      if (LANG !== 'ru') return;
      for (const m of muts) {
        m.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            translateEl(node);
          } else if (node.nodeType === 3 && node.nodeValue.trim()) {
            const t = tr(node.nodeValue);
            if (t !== null) {
              const lead = node.nodeValue.match(/^\s*/)[0];
              const trail = node.nodeValue.match(/\s*$/)[0];
              node.nodeValue = lead + t + trail;
            }
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Til o'rnatish ──
  function setLang(lang) {
    LANG = lang;
    localStorage.setItem('tarnov_lang', lang);
    updateToggleUI();
    if (lang === 'ru') {
      translatePage();
      startObserver();
    } else {
      // O'zbekchaga qaytarish — sahifani qayta yuklash eng ishonchli
      location.reload();
    }
  }

  // ── Til toggle UI ──
  function injectToggle() {
    if (document.getElementById('lang-toggle')) return;
    const wrap = document.createElement('div');
    wrap.id = 'lang-toggle';
    wrap.innerHTML = `
      <button data-lang="uz" class="lang-btn">O'ZB</button>
      <button data-lang="ru" class="lang-btn">РУС</button>`;

    const style = document.createElement('style');
    style.textContent = `
      #lang-toggle {
        display: inline-flex; gap: 2px; padding: 3px;
        background: rgba(13,21,32,0.92); backdrop-filter: blur(12px);
        border: 1px solid rgba(0,212,255,0.25); border-radius: 20px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        flex-shrink: 0;
      }
      #lang-toggle.floating {
        position: fixed; top: 12px; right: 12px; z-index: 9500;
      }
      #lang-toggle .lang-btn {
        border: none; background: transparent; cursor: pointer;
        color: rgba(255,255,255,0.55);
        font-size: 0.68rem; font-weight: 700; letter-spacing: 0.03em;
        padding: 4px 10px; border-radius: 16px; transition: all 0.18s;
        font-family: inherit; line-height: 1.2;
      }
      #lang-toggle .lang-btn.active {
        background: linear-gradient(135deg,#33DDFF,#00D4FF); color: #002;
        box-shadow: 0 2px 8px rgba(0,212,255,0.4);
      }
      @media (max-width: 900px) {
        #lang-toggle.floating { top: 9px; right: 9px; }
        #lang-toggle .lang-btn { font-size: 0.64rem; padding: 4px 8px; }
      }`;
    document.head.appendChild(style);

    // Logout tugmasi yoniga joylashtirish (admin/waiter), bo'lmasa floating (login)
    const logoutBtn = [...document.querySelectorAll('[onclick*="logout"]')]
      .find(b => b.offsetParent !== null) || document.querySelector('[onclick*="logout"]');

    if (logoutBtn && logoutBtn.parentElement) {
      wrap.style.marginRight = '8px';
      wrap.style.alignSelf = 'center';
      logoutBtn.parentElement.insertBefore(wrap, logoutBtn);
    } else {
      wrap.classList.add('floating');
      document.body.appendChild(wrap);
    }

    wrap.querySelectorAll('.lang-btn').forEach(b => {
      b.addEventListener('click', () => setLang(b.dataset.lang));
    });
    updateToggleUI();
  }

  function updateToggleUI() {
    const wrap = document.getElementById('lang-toggle');
    if (!wrap) return;
    wrap.querySelectorAll('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === LANG);
    });
  }

  // ── Init ──
  function init() {
    injectToggle();
    if (LANG === 'ru') {
      translatePage();
      startObserver();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Tashqi foydalanish uchun
  window.i18n = { setLang, tr: text => tr(text) || text, get lang() { return LANG; } };
})();
