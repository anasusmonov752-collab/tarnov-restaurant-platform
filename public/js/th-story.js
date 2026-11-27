// ── Story/post rasmi — vakansiyalardan (Anas, 2026-11-16) ─────────────────
// "Shu dizaynda platformani ham" — 1080×1920 story rasmini panelning o'zi
// chizadi: maosh, filial, lavozim BAZADAN (to'qima raqam yo'q). Canvas 2D —
// tashqi kutubxona yo'q, natija PNG. Ishlatish:
//   const cv = await thStory.render({ lang, lines, sub, loc, tiles, cta, city, bot })
//   lines: ['Tarnov', '*jamoasiga*', "qo'shiling"]  (* — oltin so'z)
//   tiles: [{ role, pay, unit, badge, hot }] (ko'pi bilan 4)
//   thStory.fromVacancies(rows, { lang, name }) — standart matn va plitkalar
(function () {
  const W = 1080, H = 1920, PAD = 88;
  const PLANE = 'M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z';
  const TXT = {
    uz: { city: 'Toshkent', usd: '$ / oy', month: "so'm / oy", day: "so'm / kun", shift: "so'm / smena", badge: 'Tajribasiz', mln: 'mln',
      cta: 'Ariza — 2 daqiqa, rezyume shart emas', branches: n => `${n} ta filial`,
      // Bitta lavozim: "Tarnovga / *shashlikchi* / kerak"
      one: (name, role) => name ? [name + 'ga', `*${role.toLowerCase()}*`, 'kerak'] : [`*${role}*`, 'kerak'],
      payout: { daily: 'maosh har kuni', weekly: 'maosh har hafta', tenday: 'maosh har 10 kunda', twice: 'maosh oyiga 2 marta', monthly: 'maosh oyiga 1 marta' },
      lines: name => name ? [name, '*jamoasiga*', "qo'shiling"] : ['Restoranga', '*xodimlar*', 'kerak'],
      // Uslublar va maosh yashirilganda (2026-11-27)
      payTalk: 'Maosh — suhbatda', noExp: 'Tajribasiz ham', ctaShort: 'Ariza — 2 daqiqa',
      shift: { kunduzgi: 'Kunduzgi smena', kechki: 'Kechki smena', ikkalasi: 'Smenani tanlaysiz' },
      payoutShort: { daily: 'har kuni', weekly: 'har hafta', tenday: 'har 10 kunda', twice: 'oyiga 2 marta', monthly: 'oyiga 1 marta' },
      vac: 'Vakansiya', ticket: 'Ishga chipta', payLbl: 'Maosh', terms: 'Shartlar', empLbl: 'Ish beruvchi', cityLbl: 'Shahar',
      payoutLbl: "Maosh to'lovi", branchLbl: 'Filiallar', expLbl: 'Tajriba', expNo: 'shart emas', nRoles: n => `${n} ta lavozim`,
      chatAsk: 'Assalomu alaykum! Ish bormi?', chatYes: name => name ? `Bor! ${name}ga kerak:` : 'Bor! Hozir kerak:',
      chatYesOne: (name, role) => name ? `Bor! ${name}ga ${role.toLowerCase()} kerak.` : `Bor! ${role} kerak.`,
      chatAsk2: 'Rezyume kerakmi?', chatNo: "Yo'q. Anketa — 2 daqiqa, shu yerning o'zida.", chatBtn: 'Ariza berish', botWord: 'bot' },
    ru: { city: 'Ташкент', usd: '$ / мес', month: 'сум / мес', day: 'сум / день', shift: 'сум / смена', badge: 'Без опыта', mln: 'млн',
      cta: 'Отклик — 2 минуты, без резюме',
      // Падеж названия не склоняем ("ищет шашлычника" не собрать) — "Требуется / *Шашлычник*"
      one: (name, role) => name ? [name + ':', 'требуется', `*${role}*`] : ['Требуется', `*${role}*`],
      branches: n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'филиал' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'филиала' : 'филиалов'}`,
      payout: { daily: 'зарплата каждый день', weekly: 'зарплата каждую неделю', tenday: 'зарплата каждые 10 дней', twice: 'зарплата 2 раза в месяц', monthly: 'зарплата раз в месяц' },
      lines: name => name ? ['Команда', `*${name}*`, 'ждёт вас'] : ['В ресторан', '*нужны*', 'сотрудники'],
      payTalk: 'Зарплата — на собеседовании', noExp: 'Можно без опыта', ctaShort: 'Отклик — 2 минуты',
      shift: { kunduzgi: 'Дневная смена', kechki: 'Вечерняя смена', ikkalasi: 'Смена на выбор' },
      payoutShort: { daily: 'каждый день', weekly: 'каждую неделю', tenday: 'каждые 10 дней', twice: '2 раза в месяц', monthly: 'раз в месяц' },
      vac: 'Вакансия', ticket: 'Билет на работу', payLbl: 'Зарплата', terms: 'Условия', empLbl: 'Работодатель', cityLbl: 'Город',
      payoutLbl: 'Выплата', branchLbl: 'Филиалы', expLbl: 'Опыт', expNo: 'не нужен',
      nRoles: n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'должность' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'должности' : 'должностей'}`,
      chatAsk: 'Здравствуйте! Есть работа?', chatYes: name => name ? `Есть! ${name} ищет:` : 'Есть! Сейчас ищут:',
      chatYesOne: (name, role) => name ? `Есть! ${name}: требуется ${role.toLowerCase()}.` : `Есть! Требуется ${role.toLowerCase()}.`,
      chatAsk2: 'Нужно резюме?', chatNo: 'Нет. Анкета — 2 минуты, прямо здесь.', chatBtn: 'Откликнуться', botWord: 'бот' }
  };
  // ── Uslublar (Anas, 2026-11-27: "faqat rang emas, uslub ham — yangicha yondashuv") ──
  // Har biri o'z kompozitsiyasi va shrift ierarxiyasi; ranglari ichida qat'iy (erkin rang yo'q).
  // 'klassik' — eski maket, rangini THEMES tanlaydi.
  const STYLES = { klassik: 'Klassik', afisha: 'Afisha', chipta: 'Chipta', blok: 'Blok', chat: 'Chat' };
  // ── Mavzular (Anas, 2026-11-27: "dizaynni o'zim tanlay olsam") ──
  // Erkin rang tanlash YO'Q — har safar boshqa rang brendni bachkana qiladi; 4 ta tayyor mavzu.
  // Barcha ranglar shu yerda: paint() hech qayerda rangni qattiq yozmaydi.
  const THEMES = {
    tungi: { label: 'Tungi', bg: ['#0E2350', '#081634', '#050D24'], glow: 'rgba(47,139,255,.32)',
      orb: ['#FFD36B', '#FFC53D', '#E9A21C'], orbShadow: 'rgba(255,197,61,.30)', orbR: 270,
      ink: '#fff', accent: '#FFC53D', sub: '#C9D7F2', loc: '#7F96C2', brandHub: '#6FAEFF',
      chip: 'rgba(8,22,52,.78)', chipLine: 'rgba(255,255,255,.22)', chipInk: '#fff',
      tile: 'rgba(255,255,255,.07)', tileLine: 'rgba(255,255,255,.10)', tileRole: '#C9D7F2', tilePay: '#fff', tileUnit: '#8FA6CF',
      hot: ['rgba(47,139,255,.38)', 'rgba(0,80,200,.22)'], hotLine: '111,174,255',
      badge: '#FFC53D', badgeInk: '#1A1300', perk: 'rgba(255,255,255,.10)', perkInk: '#E6EEFF',
      cta: '#fff', ctaSub: '#4A5D80', ctaBot: '#0050C8', arrowBg: '#EEF4FF', arrow: '#0050C8', ctaShadow: 'rgba(0,0,0,.35)' },
    oq: { label: 'Oq', bg: ['#FFFFFF', '#F6F8FC', '#EDF1F8'], glow: 'rgba(10,91,216,.07)',
      orb: null, ink: '#0B1630', accent: '#0A5BD8', sub: '#3D4B66', loc: '#7A869C', brandHub: '#0A5BD8', brandTalent: '#0B1630',
      chip: '#fff', chipLine: '#DCE2EC', chipInk: '#0B1630',
      tile: '#fff', tileLine: '#E2E7F0', tileRole: '#4A5873', tilePay: '#0B1630', tileUnit: '#7A869C', tileShadow: 'rgba(16,32,72,.08)',
      hot: ['#0A5BD8', '#0846AC'], hotLine: '10,91,216', hotRole: 'rgba(255,255,255,.82)', hotPay: '#fff', hotUnit: 'rgba(255,255,255,.72)',
      badge: '#FFC53D', badgeInk: '#1A1300', perk: '#fff', perkInk: '#0B1630', perkLine: '#DCE2EC',
      cta: '#0B1630', ctaSub: 'rgba(255,255,255,.66)', ctaBot: '#fff', arrowBg: 'rgba(255,255,255,.12)', arrow: '#fff', ctaShadow: 'rgba(16,32,72,.22)' },
    issiq: { label: 'Issiq', bg: ['#2A1A12', '#1A110C', '#0E0907'], glow: 'rgba(255,110,40,.26)',
      orb: ['#FFB05C', '#FF8A3D', '#D9541A'], orbShadow: 'rgba(255,120,50,.32)', orbR: 270,
      ink: '#fff', accent: '#FFA14A', sub: '#EBD9CC', loc: '#A88F80', brandHub: '#FFA14A',
      chip: 'rgba(30,18,12,.78)', chipLine: 'rgba(255,255,255,.20)', chipInk: '#fff',
      tile: 'rgba(255,255,255,.07)', tileLine: 'rgba(255,255,255,.10)', tileRole: '#EBD9CC', tilePay: '#fff', tileUnit: '#BFA597',
      hot: ['rgba(255,128,52,.40)', 'rgba(200,70,20,.24)'], hotLine: '255,160,90',
      badge: '#FFA14A', badgeInk: '#2A1205', perk: 'rgba(255,255,255,.10)', perkInk: '#FBEDE3',
      cta: '#fff', ctaSub: '#7A5A48', ctaBot: '#C2410C', arrowBg: '#FFF1E6', arrow: '#C2410C', ctaShadow: 'rgba(0,0,0,.40)' },
    // O'z rasmi: rasm butun fonni egallaydi, ustidan qoraytirish (matn har qanday rasmda o'qilsin)
    rasm: { label: 'Rasm', photo: true, bg: ['#141821', '#0D1017', '#07090D'], glow: null, orb: null,
      ink: '#fff', accent: '#FFC53D', sub: '#E6EAF2', loc: '#B5BDCC', brandHub: '#8EC0FF',
      chip: 'rgba(0,0,0,.45)', chipLine: 'rgba(255,255,255,.28)', chipInk: '#fff',
      tile: 'rgba(8,10,16,.58)', tileLine: 'rgba(255,255,255,.16)', tileRole: '#E6EAF2', tilePay: '#fff', tileUnit: '#B5BDCC',
      hot: ['rgba(10,91,216,.72)', 'rgba(8,60,150,.62)'], hotLine: '142,192,255',
      badge: '#FFC53D', badgeInk: '#1A1300', perk: 'rgba(8,10,16,.58)', perkInk: '#fff', perkLine: 'rgba(255,255,255,.18)',
      cta: '#fff', ctaSub: '#4A5D80', ctaBot: '#0050C8', arrowBg: '#EEF4FF', arrow: '#0050C8', ctaShadow: 'rgba(0,0,0,.45)' }
  };
  const theme = d => THEMES[d && d.theme] || THEMES.tungi;

  // ── Fon rasmlari kutubxonasi (public/images/story, 2026-11-27) ──
  // Pexels litsenziyasi (tijoriy, imzosiz). Repo OCHIQ — asl rasm emas, 540×960 va blur berilgan
  // nusxa saqlanadi (asl nusxani tarqatish taqiqlangan; yuz tanilmasin — "bu bizning xodim" emas).
  // Manba ID'lari — docs/tarix.md. Tarnovning o'z rasmlari kelsa shu ro'yxatga qo'shiladi.
  const LIB = { shashlik: 3, oshpaz: 2, ofitsiant: 2, xostess: 2, barmen: 2, kassir: 2, konditer: 2, zal: 2 };
  const GROUPS = [
    ['shashlik', /shashl|mangal|kabob|шашл|мангал|кебаб|кабоб/i],
    ['konditer', /konditer|кондитер|desert|десерт|pishiriq/i],
    ['barmen', /barm|бармен|barist|бариста/i],
    ['kassir', /kass|касс/i],
    ['xostess', /xost|host|хост|menej|менедж|administr|админ/i],
    ['ofitsiant', /ofits|офиц|ranner|runner|раннер/i],
    ['oshpaz', /oshpaz|ошпаз|povar|повар|shef|chef|salat|салат|oshxona|кухн/i]
  ];
  // Bitta lavozim — o'z guruhi; bir nechta — umumiy zal (har biriga bitta rasm to'g'ri kelmaydi)
  function photoGroup(d) {
    const tl = d && d.tiles || [];
    if (tl.length !== 1) return 'zal';
    const s = (tl[0].full || tl[0].role || '') + ' ' + (tl[0].roleKey || '');
    return (GROUPS.find(([, re]) => re.test(s)) || ['zal'])[0];
  }
  const photoUrl = (g, i) => `/images/story/${g}-${((i % LIB[g]) + LIB[g]) % LIB[g] + 1}.jpg`;
  const imgCache = {};
  function loadPhoto(url) {
    return imgCache[url] || (imgCache[url] = new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = () => { delete imgCache[url]; rej(new Error('Rasm yuklanmadi')); }; im.src = url;
    }));
  }

  // Lotin -> kirill filial nomlari (ruscha rasm uchun; bilmagani o'zicha qoladi)
  const RU_PLACE = { sebzor: 'Себзор', drujba: 'Дружба', chorsu: 'Чорсу', keles: 'Келес', istirohat: 'Истирохат', chilonzor: 'Чиланзар',
    yunusobod: 'Юнусабад', toshkent: 'Ташкент', sergeli: 'Сергели', olmazor: 'Алмазар', mirobod: 'Мирабад', yakkasaroy: 'Яккасарай' };

  const sp = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function money(from, to, lang) {
    const T = TXT[lang] || TXT.uz;
    const m = x => (x / 1e6).toFixed(x % 1e6 ? 1 : 0).replace(/\.0$/, '').replace('.', ',');
    if (from >= 1e6 || to >= 1e6) {
      if (from && to && to !== from) return `${m(from)}–${m(to)} ${T.mln}`;
      return `${m(from || to)}${!to && from ? '+' : ''} ${T.mln}`;
    }
    if (from && to && to !== from) return `${sp(from)}–${sp(to)}`;
    return sp(from || to) + (from && !to ? '+' : '');
  }
  const mainTitle = t => String(t || '').replace(/\s*\(.*\)\s*$/, '').trim();

  /** Ochiq vakansiyalardan standart story ma'lumoti */
  // Maosh o'rnini bosadigan FAKTLAR — faqat bazadan (to'qima yo'q): tajriba, to'lov tartibi, smena, jadval, afzalliklar
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  function factsOf(v, lang) {
    const T = TXT[lang] || TXT.uz;
    const I = typeof window !== 'undefined' && window.THI18N;
    const sched = String((lang === 'ru' && v.ru && v.ru.schedule) || v.schedule || '').trim();
    return [
      v.payout && T.payout[v.payout] ? cap(T.payout[v.payout]) : '',
      T.shift[v.shift] || '',
      sched && sched.length <= 26 ? sched : '',
      ...(v.perks || []).filter(k => k !== 'tajribasiz').map(k => (I ? I.t(lang, 'perk.' + k) : k))
    ].filter(Boolean);
  }

  function fromVacancies(rows, { lang = 'uz', name = '', hidePay = false } = {}) {
    const T = TXT[lang] || TXT.uz;
    // Maosh yashirilsa — maoshsiz vakansiya ham chiqa oladi
    const list = (hidePay ? rows : rows.filter(v => v.salaryFrom || v.salaryTo)).slice(0, 4);
    const titleOf = v => (lang === 'ru' && v.ru && v.ru.title) || v.title;
    const tiles = list.map(v => {
      const usd = v.salaryCurrency === 'usd';         // "1 000+ · $ / oy" (top lavozimlar)
      const has = v.salaryFrom || v.salaryTo;
      return {
        role: mainTitle(titleOf(v)), full: String(titleOf(v) || '').trim(), roleKey: v.role || '',
        pay: !has ? '' : usd ? sp(v.salaryFrom || v.salaryTo) + (v.salaryTo && v.salaryTo !== v.salaryFrom ? '–' + sp(v.salaryTo) : (v.salaryFrom && !v.salaryTo ? '+' : '')) : money(v.salaryFrom, v.salaryTo, lang),
        unit: usd ? T.usd : T[v.salaryPeriod === 'day' ? 'day' : v.salaryPeriod === 'shift' ? 'shift' : 'month'],
        badge: (v.perks || []).includes('tajribasiz') ? T.badge : '',
        alt: factsOf(v, lang)[0] || T.payTalk,       // maosh yashirilganda plitkadagi qator
        // Faqat tartib uchun (ko'rsatilmaydi): dollar taxminan so'mga
        _v: (usd ? 12000 : 1) * (v.salaryPeriod === 'month' || !v.salaryPeriod ? 1 : 26) * (v.salaryTo || v.salaryFrom || 0)
      };
    });
    // Maosh yashirilganda plitka qatori — shu vakansiyaga XOS fakt (hammasida bir xil "maosh har 10 kunda"
    // takror bo'lmasin; u ostki qatorda bor)
    if (list.length > 1) {
      const fs = list.map(v => factsOf(v, lang));
      const freq = {}; fs.forEach(f => new Set(f).forEach(x => { freq[x] = (freq[x] || 0) + 1; }));
      const used = new Set();
      // Eng kam uchraydigan, boshqa plitkada ishlatilmagan fakt (tartib — factsOf ustuvorligi)
      fs.forEach((f, i) => {
        const own = f.filter(x => freq[x] < fs.length).sort((a, b) => freq[a] - freq[b]);
        const pick = own.find(x => !used.has(x)) || own[0] || f[0] || T.payTalk;
        used.add(pick); tiles[i].alt = pick;
      });
    }
    // Eng ko'p to'lanadigani birinchi va ko'k (ko'z birinchi shunga tushadi)
    tiles.sort((a, b) => b._v - a._v);
    if (tiles[0]) tiles[0].hot = true;
    const locs = [...new Set(rows.flatMap(v => String(v.location || '').split(/\s*[,;·]\s*/)).map(s => s.trim()).filter(Boolean))];
    const locTxt = locs.map(s => lang === 'ru' ? (RU_PLACE[s.toLowerCase()] || s) : s).join(' · ');
    const payouts = [...new Set(rows.map(v => v.payout).filter(Boolean))];
    const sub = [locs.length > 1 ? T.branches(locs.length) : '', payouts.length === 1 ? T.payout[payouts[0]] || '' : ''].filter(Boolean).join(' · ');
    // Bitta lavozim — boshqa kompozitsiya: katta maosh va shu vakansiyaning afzalliklari (bazadan)
    let perks = [];
    if (tiles.length === 1) {
      const I = typeof window !== 'undefined' && window.THI18N;
      perks = (list[0].perks || []).filter(k => k !== 'tajribasiz')
        .map(k => (I ? I.t(lang, 'perk.' + k) : k)).filter(Boolean).slice(0, 3);
    }
    const lines = tiles.length === 1 ? T.one(name, tiles[0].role) : T.lines(name);
    return { lang, lines, sub, loc: locTxt, tiles, perks, cta: T.cta, city: T.city, bot: 'TalentHubUzBot',
      name, hidePay: !!hidePay, facts: list.length === 1 ? factsOf(list[0], lang) : [],
      payout: payouts.length === 1 ? payouts[0] : '', branches: locs.length, noExp: tiles.some(x => x.badge) };
  }

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function fit(ctx, text, font, size, maxW, ls) {
    let s = size;
    for (; s > 20; s -= 2) { ctx.font = font.replace('{s}', s); ctx.letterSpacing = (ls ? ls * s : 0) + 'px'; if (ctx.measureText(text).width <= maxW) break; }
    return s;
  }

  async function fonts() {
    if (!document.fonts) return;
    // th.css'da Inter @font-face bor (Android uchun) — shu yerda kerakli qalinliklar yuklanadi
    await Promise.all(['400', '500', '600', '700', '800'].map(w => document.fonts.load(`${w} 40px Inter`, 'AaЖж')));
  }

  // ── Animatsiya (video uchun) ──
  // paint(ctx, d, t): t — soniya. t = Infinity — yakuniy kadr (PNG aynan shu).
  // Bitta chizish funksiyasi: rasm va video dizayni hech qachon ajralmaydi.
  const clamp = x => Math.max(0, Math.min(1, x));
  const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
  const VIDEO_SECONDS = 9;

  async function render(d) {
    await fonts();
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    paint(cv.getContext('2d'), d, Infinity);
    return cv;
  }

  function paint(ctx, d, t) {
    const live = Number.isFinite(t);
    const at = (start, dur) => live ? easeOut((t - start) / dur) : 1;
    // Element paydo bo'lishi: shaffoflik + siljish (+ kattalashish)
    const show = (a, { dx = 0, dy = 0, s = 1, ox = 0, oy = 0 } = {}, fn) => {
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a;
      ctx.translate(dx * (1 - a), dy * (1 - a));
      if (s !== 1) { const k = s + (1 - s) * a; ctx.translate(ox, oy); ctx.scale(k, k); ctx.translate(-ox, -oy); }
      fn(); ctx.restore();
    };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.letterSpacing = '0px'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    const F = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`;
    const styleFn = STYLE_FN[d && d.style];
    if (styleFn) { styleFn(ctx, d, F, { show, at, live, t }); return; }

    const C = theme(d);
    // Fon
    let g = ctx.createLinearGradient(700, 0, 380, H);
    g.addColorStop(0, C.bg[0]); g.addColorStop(.45, C.bg[1]); g.addColorStop(1, C.bg[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (C.photo && d.photo) photoBg(ctx, d.photo, live ? 1.06 - .06 * at(0, VIDEO_SECONDS) : 1);
    if (C.glow) {
      g = ctx.createRadialGradient(30, 1270, 0, 30, 1270, 450);
      g.addColorStop(0, C.glow); g.addColorStop(.65, C.glow.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = g; ctx.fillRect(0, 700, 700, 1100);
    }
    // Doira (brend nuqtasi) — burchakda, matnga tegmaydi; videoda o'sib chiqadi va sekin "nafas oladi"
    if (C.orb) {
      const gr = C.orbR * (live ? .9 + .1 * at(0, 1.1) + .015 * Math.sin(t * 1.6) : 1);
      ctx.save();
      ctx.shadowColor = C.orbShadow; ctx.shadowBlur = 160;
      g = ctx.createRadialGradient(990, 150, 20, 1040, 80, gr);
      g.addColorStop(0, C.orb[0]); g.addColorStop(.4, C.orb[1]); g.addColorStop(1, C.orb[2]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(1040, 80, gr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Brend birinchi kadrdanoq turadi: yozuvchi ~0.5 s kech boshlaydi — video bo'sh ekran bilan boshlanmasin
    brand(ctx, d, F, C);
    const y0 = headline(ctx, d, F, show, at, C);
    if ((d.tiles || []).length === 1) oneBlock(ctx, d, F, show, at, y0, t, live, C);
    else tilesBlock(ctx, d, F, show, at, y0, t, live, C);
    show(at(2.5, .55), { dy: 140 }, () => cta(ctx, d, F, t, live, C));
  }

  // Rasm fonini "cover" qilib chizadi + qoraytirish: tepada (brend) va pastda (plitkalar, CTA) quyuqroq
  function photoBg(ctx, img, zoom) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const k = Math.max(W / iw, H / ih) * zoom, w = iw * k, h = ih * k;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(.2, 'rgba(0,0,0,.26)');
    g.addColorStop(.5, 'rgba(0,0,0,.40)'); g.addColorStop(1, 'rgba(0,0,0,.84)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // Bitta lavozim: to'liq kenglikdagi katta karta (maosh — asosiy), ostida afzalliklar
  function oneBlock(ctx, d, F, show, at, y, t, live, C) {
    const tl = d.tiles[0];
    const x = PAD, cw = W - PAD * 2, ch = 400, yy = y + 62;
    show(at(1.2, .55), { dy: 40, s: .94, ox: x + cw / 2, oy: yy + ch / 2 }, () => {
      const g = ctx.createLinearGradient(x, yy, x + cw, yy + ch);
      g.addColorStop(0, C.hot[0]); g.addColorStop(1, C.hot[1]);
      ctx.save();
      if (C.tileShadow) { ctx.shadowColor = C.tileShadow; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18; }
      ctx.fillStyle = g; rr(ctx, x, yy, cw, ch, 40); ctx.fill(); ctx.restore();
      const glow = live && t > 3 ? .45 + .35 * (0.5 + 0.5 * Math.sin((t - 3) * 3)) : .45;
      ctx.strokeStyle = `rgba(${C.hotLine},${glow.toFixed(3)})`; ctx.lineWidth = live && t > 3 ? 3 : 1.5;
      rr(ctx, x, yy, cw, ch, 40); ctx.stroke();
      let bw = 0;
      if (tl.badge) {
        ctx.font = F(700, 26); ctx.letterSpacing = '0px';
        bw = ctx.measureText(tl.badge).width + 36;
        ctx.fillStyle = C.badge; rr(ctx, x + cw - 40 - bw, yy + 40, bw, 48, 24); ctx.fill();
        ctx.fillStyle = C.badgeInk; ctx.textBaseline = 'middle'; ctx.fillText(tl.badge, x + cw - 40 - bw + 18, yy + 65); ctx.textBaseline = 'alphabetic';
      }
      const role = tl.full || tl.role;
      fit(ctx, role, F(600, '{s}'), 38, cw - 96 - (bw ? bw + 16 : 0));
      ctx.fillStyle = C.hotRole || C.tileRole; ctx.fillText(role, x + 48, yy + 78);
      if (d.hidePay || !tl.pay) {
        // Maosh yashirilgan: kartada shu vakansiyaning faktlari (bazadan), bo'lmasa "Maosh — suhbatda"
        const T = TXT[d.lang] || TXT.uz;
        const fs = ((d.facts || []).length ? d.facts : [T.payTalk]).slice(0, 3);
        fs.forEach((f, i) => {
          fit(ctx, f, F(800, '{s}'), 58, cw - 96, -0.02);
          ctx.fillStyle = C.hotPay || C.tilePay; ctx.fillText(f, x + 48, yy + 168 + i * 82);
        });
        return;
      }
      fit(ctx, tl.pay, F(800, '{s}'), 150, cw - 96, -0.035);
      ctx.fillStyle = C.hotPay || C.tilePay; ctx.fillText(tl.pay, x + 48, yy + 78 + 170);
      ctx.font = F(500, 32); ctx.letterSpacing = '0px'; ctx.fillStyle = C.hotUnit || C.tileUnit;
      ctx.fillText(tl.unit || '', x + 48, yy + 78 + 170 + 66);
    });
    // Afzalliklar — kapsulalar, kerak bo'lsa ikkinchi qatorga o'tadi
    const perks = d.hidePay || !tl.pay ? [] : (d.perks || []).slice(0, 3);   // yashirilganda faktlar kartaning o'zida
    let px = x, py = yy + ch + 28;
    perks.forEach((p, i) => {
      ctx.font = F(600, 30); ctx.letterSpacing = '0px';
      const pw = Math.min(ctx.measureText(p).width + 52, cw);
      if (px + pw > x + cw) { px = x; py += 80; }
      const X = px, Y = py;
      show(at(1.7 + i * .15, .45), { dy: 24 }, () => {
        ctx.fillStyle = C.perk; rr(ctx, X, Y, pw, 64, 32); ctx.fill();
        if (C.perkLine) { ctx.strokeStyle = C.perkLine; ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.font = F(600, 30); ctx.fillStyle = C.perkInk; ctx.textBaseline = 'middle';
        ctx.fillText(p, X + 26, Y + 33); ctx.textBaseline = 'alphabetic';
      });
      px += pw + 14;
    });
  }

  function brand(ctx, d, F, C) {
    let g;
    const bx = PAD, by = 128;
    g = ctx.createLinearGradient(0, by, 0, by + 60); g.addColorStop(0, '#3A92FF'); g.addColorStop(1, '#0050C8');
    ctx.fillStyle = g; rr(ctx, bx, by, 60, 60, 15); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx + 15.75, by + 21); ctx.lineTo(bx + 39, by + 21); ctx.moveTo(bx + 27.4, by + 21); ctx.lineTo(bx + 27.4, by + 44.25); ctx.stroke();
    ctx.fillStyle = '#FFC53D'; ctx.beginPath(); ctx.arc(bx + 44.25, by + 21, 5.85, 0, Math.PI * 2); ctx.fill();
    ctx.font = F(700, 38); ctx.letterSpacing = '-0.5px'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.brandTalent || C.ink; ctx.fillText('Talent', bx + 76, by + 31);
    ctx.fillStyle = C.brandHub; ctx.fillText('Hub', bx + 76 + ctx.measureText('Talent').width, by + 31);
    // Shahar
    ctx.font = F(600, 26); ctx.letterSpacing = '1px';
    const cw = ctx.measureText(d.city).width + 44;
    ctx.fillStyle = C.chip; rr(ctx, W - PAD - cw, by + 2, cw, 56, 28); ctx.fill();
    ctx.strokeStyle = C.chipLine; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = C.chipInk; ctx.fillText(d.city, W - PAD - cw + 22, by + 31);
    ctx.textBaseline = 'alphabetic';
  }

  // Sarlavha, ostki qator, filiallar — qatorma-qator pastdan chiqadi. Plitkalar boshlanadigan y ni qaytaradi.
  function headline(ctx, d, F, show, at, C) {
    ctx.textBaseline = 'alphabetic';
    const lines = (d.lines || []).filter(Boolean).slice(0, 4);
    let hs = 118;
    for (const l of lines) hs = Math.min(hs, fit(ctx, l.replace(/\*/g, ''), F(800, '{s}'), 118, W - PAD * 2, -0.038));
    let y = 338 + hs * .82;
    lines.forEach((l, i) => {
      const yy = y;
      show(at(i * .2, .5), { dy: 56 }, () => {
        ctx.font = F(800, hs); ctx.letterSpacing = (-0.038 * hs) + 'px';
        ctx.fillStyle = /^\*.*\*$/.test(l.trim()) ? C.accent : C.ink;
        ctx.fillText(l.replace(/\*/g, ''), PAD, yy);
      });
      y += hs * .98;
    });
    y += -hs * .98 + 44 + 34 * .9;                    // pastki chiziqli harflar (g, y) sarlavhaga tegmasin
    if (d.sub) {
      const yy = y;
      show(at(.85, .45), { dy: 30 }, () => {
        ctx.letterSpacing = '0px'; fit(ctx, d.sub, F(600, '{s}'), 34, W - PAD * 2);
        ctx.fillStyle = C.sub; ctx.fillText(d.sub, PAD, yy);
      });
      y += 48;
    }
    if (d.loc) {
      const yy = y;
      show(at(1.0, .45), { dy: 30 }, () => {
        ctx.letterSpacing = '0px'; fit(ctx, d.loc, F(500, '{s}'), 27, W - PAD * 2);
        ctx.fillStyle = C.loc; ctx.fillText(d.loc, PAD, yy);
      });
      y += 10;
    }
    return y;
  }

  // Plitkalar 2 ustun — navbatma-navbat "ochiladi"; eng ko'p to'lanadigani keyin sekin yonib turadi
  function tilesBlock(ctx, d, F, show, at, y, t, live, C) {
    let g;
    const tiles = (d.tiles || []).slice(0, 4);
    const tw = (W - PAD * 2 - 20) / 2, th = 232;
    let ty = y + 62;
    tiles.forEach((tl, i) => {
      const x = PAD + (i % 2) * (tw + 20), yy = ty + Math.floor(i / 2) * (th + 20);
      show(at(1.2 + i * .22, .5), { dy: 40, s: .9, ox: x + tw / 2, oy: yy + th / 2 }, () => {
      ctx.save();
      if (C.tileShadow) { ctx.shadowColor = C.tileShadow; ctx.shadowBlur = 36; ctx.shadowOffsetY = 12; }
      if (tl.hot) {
        g = ctx.createLinearGradient(x, yy, x + tw, yy + th);
        g.addColorStop(0, C.hot[0]); g.addColorStop(1, C.hot[1]);
        ctx.fillStyle = g;
      } else ctx.fillStyle = C.tile;
      rr(ctx, x, yy, tw, th, 32); ctx.fill(); ctx.restore();
      // Videoda: 3 s dan keyin chegara sekin yonib-o'chadi (ko'z shunga tushsin)
      const glow = live && t > 3 ? .45 + .35 * (0.5 + 0.5 * Math.sin((t - 3) * 3)) : .45;
      ctx.strokeStyle = tl.hot ? `rgba(${C.hotLine},${glow.toFixed(3)})` : C.tileLine;
      ctx.lineWidth = tl.hot && live && t > 3 ? 3 : 1.5; rr(ctx, x, yy, tw, th, 32); ctx.stroke();
      const hot = k => (tl.hot && C['hot' + k]) || C['tile' + k];
      let bw = 0;
      if (tl.badge) {
        ctx.font = F(700, 21); ctx.letterSpacing = '0px';
        bw = ctx.measureText(tl.badge).width + 28;
        ctx.fillStyle = C.badge; rr(ctx, x + tw - 24 - bw, yy + 26, bw, 38, 19); ctx.fill();
        ctx.fillStyle = C.badgeInk; ctx.textBaseline = 'middle'; ctx.fillText(tl.badge, x + tw - 24 - bw + 14, yy + 46); ctx.textBaseline = 'alphabetic';
      }
      fit(ctx, tl.role, F(600, '{s}'), 32, tw - 64 - (bw ? bw + 12 : 0));
      ctx.fillStyle = hot('Role'); ctx.fillText(tl.role, x + 32, yy + 38 + 30);
      if (d.hidePay || !tl.pay) {
        // Maosh o'rnida — shu vakansiyaning birinchi fakti, ikki qatorgacha
        ctx.font = F(700, 38); ctx.letterSpacing = '0px';
        const ls = wrap(ctx, tl.alt || '', tw - 64).slice(0, 2);
        ctx.fillStyle = hot('Pay');
        ls.forEach((l, k) => { fit(ctx, l, F(700, '{s}'), 38, tw - 64); ctx.fillText(l, x + 32, yy + 38 + 30 + 18 + 46 + k * 46); });
      } else {
        fit(ctx, tl.pay, F(800, '{s}'), 62, tw - 64, -0.032);
        ctx.fillStyle = hot('Pay'); ctx.fillText(tl.pay, x + 32, yy + 38 + 30 + 18 + 56);
        ctx.font = F(500, 25); ctx.letterSpacing = '0px'; ctx.fillStyle = hot('Unit');
        ctx.fillText(tl.unit || '', x + 32, yy + 38 + 30 + 18 + 56 + 40);
      }
      });
    });
  }

  // CTA — oq blok (pastda havola stikeri uchun joy qoladi); videoda o'q tugmasi "chaqiradi"
  function cta(ctx, d, F, t, live, C) {
    let g;
    const cy = H - 236 - 160, cx = PAD, cW = W - PAD * 2;
    ctx.save(); ctx.shadowColor = C.ctaShadow; ctx.shadowBlur = 80; ctx.shadowOffsetY = 30;
    ctx.fillStyle = C.cta; rr(ctx, cx, cy, cW, 160, 36); ctx.fill(); ctx.restore();
    g = ctx.createLinearGradient(cx + 34, cy + 32, cx + 130, cy + 128); g.addColorStop(0, '#3A92FF'); g.addColorStop(1, '#0050C8');
    ctx.fillStyle = g; rr(ctx, cx + 34, cy + 32, 96, 96, 28); ctx.fill();
    ctx.save(); ctx.translate(cx + 34 + 20, cy + 32 + 20); ctx.scale(56 / 24, 56 / 24); ctx.fillStyle = '#fff'; ctx.fill(new Path2D(PLANE)); ctx.restore();
    fit(ctx, d.cta || '', F(600, '{s}'), 26, cW - 300);
    ctx.fillStyle = C.ctaSub; ctx.fillText(d.cta || '', cx + 156, cy + 66);
    fit(ctx, '@' + d.bot, F(800, '{s}'), 54, cW - 290, -0.028);
    ctx.fillStyle = C.ctaBot; ctx.fillText('@' + d.bot, cx + 156, cy + 124);
    const ax = cx + cW - 66, ay = cy + 80;
    // 3.2 s dan keyin: doira atrofida to'lqin va o'q o'ngga "itariladi" (har 1.4 s)
    const ph = live && t > 3.2 ? ((t - 3.2) % 1.4) / 1.4 : -1;
    if (ph >= 0) {
      ctx.save(); ctx.globalAlpha *= (1 - ph) * .6;
      ctx.strokeStyle = C.arrow; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ax, ay, 32 + ph * 26, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    const nudge = ph >= 0 ? 7 * Math.sin(Math.min(ph * 2, 1) * Math.PI) : 0;
    ctx.fillStyle = C.arrowBg; ctx.beginPath(); ctx.arc(ax, ay, 32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.arrow; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(ax - 14 + nudge, ay); ctx.lineTo(ax + 14 + nudge, ay); ctx.moveTo(ax + 2 + nudge, ay - 12); ctx.lineTo(ax + 14 + nudge, ay); ctx.lineTo(ax + 2 + nudge, ay + 12); ctx.stroke();
  }

  // ══ USLUBLAR ════════════════════════════════════════════════════════════
  // Umumiy: Telegram story xavfsiz maydoni — tepada ~120 px (progress, avatar), pastda 236 px
  // havola stikeri uchun bo'sh. Mazmun CTA'dan yuqorida tugaydi; sig'masa qatorlar zichlashadi.
  const CTA_Y = H - 236;                               // stiker zonasi boshlanishi
  function wrap(ctx, s, maxW) {
    const out = []; let cur = '';
    for (const w of String(s || '').split(/\s+/).filter(Boolean)) {
      const tt = cur ? cur + ' ' + w : w;
      if (cur && ctx.measureText(tt).width > maxW) { out.push(cur); cur = w; } else cur = tt;
    }
    if (cur) out.push(cur);
    return out;
  }
  function put(ctx, s, x, y, font, color, { ls = 0, align = 'left', base = 'alphabetic' } = {}) {
    ctx.font = font; ctx.letterSpacing = ls + 'px'; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
    ctx.fillText(s, x, y); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = '0px';
  }
  // fit + chizish (o'ngga tekislash mumkin); kenglikni qaytaradi
  function fitPut(ctx, s, x, y, F, w, size, maxW, color, ls = 0, align = 'left') {
    fit(ctx, s, F(w, '{s}'), size, maxW, ls);
    const width = ctx.measureText(s).width;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); ctx.textAlign = 'left'; ctx.letterSpacing = '0px';
    return width;
  }
  function mark(ctx, bx, by, s) {
    const k = s / 60;
    const g = ctx.createLinearGradient(0, by, 0, by + s); g.addColorStop(0, '#3A92FF'); g.addColorStop(1, '#0050C8');
    ctx.fillStyle = g; rr(ctx, bx, by, s, s, 15 * k); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6.3 * k; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx + 15.75 * k, by + 21 * k); ctx.lineTo(bx + 39 * k, by + 21 * k);
    ctx.moveTo(bx + 27.4 * k, by + 21 * k); ctx.lineTo(bx + 27.4 * k, by + 44.25 * k); ctx.stroke();
    ctx.fillStyle = '#FFC53D'; ctx.beginPath(); ctx.arc(bx + 44.25 * k, by + 21 * k, 5.85 * k, 0, Math.PI * 2); ctx.fill();
  }
  function wordmark(ctx, F, x, y, s, talent, hub) {
    mark(ctx, x, y, s);
    ctx.font = F(700, Math.round(s * .63)); ctx.letterSpacing = '-0.5px'; ctx.textBaseline = 'middle';
    ctx.fillStyle = talent; ctx.fillText('Talent', x + s * 1.27, y + s * .53);
    ctx.fillStyle = hub; ctx.fillText('Hub', x + s * 1.27 + ctx.measureText('Talent').width, y + s * .53);
    ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = '0px';
  }
  function arrowIn(ctx, cx, cy, r, bg, fg, nudge = 0) {
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    const a = r * .42;
    ctx.strokeStyle = fg; ctx.lineWidth = r * .13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx - a + nudge, cy); ctx.lineTo(cx + a + nudge, cy);
    ctx.moveTo(cx + a * .1 + nudge, cy - a * .85); ctx.lineTo(cx + a + nudge, cy); ctx.lineTo(cx + a * .1 + nudge, cy + a * .85); ctx.stroke();
  }
  // Videoda o'q har 1.4 s da "itariladi"
  const nudgeAt = A => A.live && A.t > 3.2 ? 8 * Math.sin(Math.min((((A.t - 3.2) % 1.4) / 1.4) * 2, 1) * Math.PI) : 0;
  // Sarlavha qatorlari (* — ajratilgan). Qaytaradi: oxirgi qator tagidan keyingi y
  function heads(ctx, d, F, A, { y, maxS, ink, accent, x = PAD, maxW = W - PAD * 2, lh = .94, ls = -0.045, delay = .15, mark: hl }) {
    const lines = (d.lines || []).filter(Boolean).slice(0, 4);
    let hs = maxS;
    for (const l of lines) hs = Math.min(hs, fit(ctx, l.replace(/\*/g, ''), F(800, '{s}'), maxS, maxW - (hl ? 40 : 0), ls));
    let yy = y + hs * .82;
    lines.forEach((l, i) => {
      const ly = yy, acc = /^\*.*\*$/.test(l.trim()), s = l.replace(/\*/g, '');
      A.show(A.at(delay + i * .15, .5), { dy: 50 }, () => {
        ctx.font = F(800, hs); ctx.letterSpacing = (ls * hs) + 'px';
        if (acc && hl) {                               // Blok: ajratilgan so'z to'q plashka ichida
          const w = ctx.measureText(s).width;
          ctx.fillStyle = hl; rr(ctx, x - 6, ly - hs * .80, w + 44, hs * 1.0, 14); ctx.fill();
          ctx.fillStyle = accent; ctx.fillText(s, x + 16, ly);
        } else { ctx.fillStyle = acc ? accent : ink; ctx.fillText(s, x, ly); }
        ctx.letterSpacing = '0px';
      });
      yy += hs * lh;
    });
    return yy - hs * lh + hs * .22;
  }

  // ── 1. AFISHA — tahririy plakat: och qog'oz, qora shrift, raqamlangan qatorlar, chiziqlar ──
  function afisha(ctx, d, F, A) {
    const T = TXT[d.lang] || TXT.uz, P = PAD;
    const INK = '#141414', MUTED = '#6E6A62', BLUE = '#0047E0', RULE = '#141414';
    ctx.fillStyle = '#F2EEE5'; ctx.fillRect(0, 0, W, H);
    // qog'oz donadorligi o'rniga — juda och vertikal to'r (plakat panjarasi)
    ctx.fillStyle = 'rgba(20,20,20,.035)';
    for (let gx = P; gx <= W - P; gx += (W - 2 * P) / 6) ctx.fillRect(Math.round(gx), 236, 1, CTA_Y - 236 - 170);
    wordmark(ctx, F, P, 136, 56, INK, BLUE);
    put(ctx, d.city.toUpperCase(), W - P, 166, F(700, 24), MUTED, { ls: 5, align: 'right', base: 'middle' });
    ctx.fillStyle = RULE; ctx.fillRect(P, 236, W - 2 * P, 5);
    const tiles = d.tiles || [], one = tiles.length === 1;
    A.show(A.at(0, .45), { dy: 16 }, () => {
      put(ctx, T.vac.toUpperCase(), P, 300, F(800, 26), BLUE, { ls: 7 });
      put(ctx, T.nRoles(tiles.length), W - P, 300, F(600, 26), MUTED, { align: 'right' });
    });
    let y = heads(ctx, d, F, A, { y: 334, maxS: one ? 138 : 128, ink: INK, accent: BLUE });
    if (d.sub) { y += 40; const yy = y; A.show(A.at(.7, .4), { dy: 20 }, () => fitPut(ctx, d.sub, P, yy, F, 500, 32, W - 2 * P, MUTED)); }
    y += 56;
    const cy = CTA_Y - 150, bottom = cy - (d.loc ? 92 : 56);
    if (!one) {
      const rh = Math.min(148, Math.floor((bottom - y) / Math.max(tiles.length, 1)));
      tiles.forEach((tl, i) => {
        const yy = y + i * rh, mid = yy + rh / 2;
        A.show(A.at(1.0 + i * .18, .45), { dx: -40 }, () => {
          ctx.fillStyle = RULE; ctx.fillRect(P, yy, W - 2 * P, 2);
          put(ctx, String(i + 1).padStart(2, '0'), P, mid + 12, F(700, 26), BLUE);
          let rw;
          if (!d.hidePay && tl.pay) {
            rw = fitPut(ctx, tl.pay, W - P, mid + 14, F, 800, 60, 430, INK, -0.03, 'right');
            put(ctx, tl.unit || '', W - P, mid + 50, F(500, 24), MUTED, { align: 'right' });
          } else rw = fitPut(ctx, tl.alt, W - P, mid + 12, F, 600, 32, 420, INK, 0, 'right');
          fitPut(ctx, tl.role, P + 72, tl.badge ? mid + 4 : mid + 14, F, 700, 44, W - 2 * P - 72 - rw - 36, INK, -0.02);
          if (tl.badge) put(ctx, tl.badge, P + 72, mid + 44, F(600, 24), BLUE);
        });
      });
      A.show(A.at(1.0 + tiles.length * .18, .4), {}, () => { ctx.fillStyle = RULE; ctx.fillRect(P, y + tiles.length * rh, W - 2 * P, 2); });
    } else {
      const tl = tiles[0], showPay = !d.hidePay && tl.pay;
      let yy = y;
      A.show(A.at(1.0, .5), { dy: 30 }, () => {
        ctx.fillStyle = RULE; ctx.fillRect(P, yy, W - 2 * P, 2);
        put(ctx, (showPay ? T.payLbl : T.terms).toUpperCase(), P, yy + 56, F(800, 24), BLUE, { ls: 6 });
        if (tl.badge) put(ctx, tl.badge, W - P, yy + 56, F(600, 26), BLUE, { align: 'right' });
        if (showPay) {
          fitPut(ctx, tl.pay, P - 6, yy + 56 + 196, F, 800, 210, W - 2 * P, INK, -0.05);
          put(ctx, tl.unit || '', P, yy + 56 + 196 + 56, F(500, 34), MUTED);
        }
      });
      yy += showPay ? 56 + 196 + 56 + 44 : 84;
      let list = showPay ? (d.perks || []) : (d.facts || []);
      if (!showPay && !list.length) list = [T.payTalk];
      const fh = showPay ? 84 : 100;
      list = list.slice(0, Math.max(0, Math.floor((bottom - yy) / fh)));
      list.forEach((f, i) => {
        const ry = yy + i * fh;
        A.show(A.at(1.5 + i * .15, .4), { dx: -30 }, () => {
          ctx.fillStyle = 'rgba(20,20,20,.18)'; ctx.fillRect(P, ry, W - 2 * P, 2);
          put(ctx, '→', P, ry + fh / 2 + 14, F(700, showPay ? 34 : 40), BLUE);
          fitPut(ctx, f, P + 64, ry + fh / 2 + 14, F, showPay ? 600 : 700, showPay ? 38 : 48, W - 2 * P - 64, INK, -0.01);
        });
      });
    }
    A.show(A.at(2.4, .5), { dy: 60 }, () => {
      if (d.loc) fitPut(ctx, d.loc, P, cy - 34, F, 500, 26, W - 2 * P, MUTED);
      ctx.fillStyle = INK; rr(ctx, P, cy, W - 2 * P, 150, 6); ctx.fill();
      fitPut(ctx, d.cta || '', P + 48, cy + 58, F, 500, 26, W - 2 * P - 230, '#BDB8AE');
      fitPut(ctx, '@' + d.bot, P + 48, cy + 118, F, 800, 54, W - 2 * P - 230, '#fff', -0.028);
      arrowIn(ctx, W - P - 82, cy + 75, 46, BLUE, '#fff', nudgeAt(A));
    });
  }

  // ── 2. CHIPTA — "ishga chipta": ko'k fonda oq bilet, teshik chiziq, shtrix-kod ──
  function chipta(ctx, d, F, A) {
    const T = TXT[d.lang] || TXT.uz, P = PAD;
    const NAVY = '#0B1630', BLUE = '#0050C8', GREY = '#8A94A6', LINE = '#E9EDF4';
    const bg = ctx.createLinearGradient(0, 0, W * .35, H);
    bg.addColorStop(0, '#2272FF'); bg.addColorStop(.5, '#0B4FD0'); bg.addColorStop(1, '#062E86');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2;
    for (const r of [200, 300, 400]) { ctx.beginPath(); ctx.arc(W + 30, 60, r, 0, Math.PI * 2); ctx.stroke(); }
    wordmark(ctx, F, P, 136, 56, '#fff', '#FFC53D');
    const tl0 = T.ticket.toUpperCase();
    ctx.font = F(700, 23); ctx.letterSpacing = '3px';
    const lw = ctx.measureText(tl0).width + 48; ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(255,255,255,.14)'; rr(ctx, W - P - lw, 138, lw, 52, 26); ctx.fill();
    put(ctx, tl0, W - P - lw + 24, 165, F(700, 23), '#fff', { ls: 3, base: 'middle' });

    const tiles = d.tiles || [], one = tiles.length === 1, showPay = one && !d.hidePay && tiles[0].pay;
    const y = heads(ctx, d, F, A, { y: 290, maxS: one ? 104 : 96, ink: '#fff', accent: '#FFC53D' });
    // Bilet o'lchami: sig'masa qatorlar zichlashadi
    const top = y + 54, head = 150, perf = 40, stub = 268, maxBottom = CTA_Y - 40;
    let facts = one && !showPay ? ((d.facts || []).length ? d.facts : [T.payTalk]) : [];
    let rowH = 112, body;
    const room = maxBottom - top - head - perf - stub;
    if (one) {
      if (showPay) body = 330;
      else { facts = facts.slice(0, Math.max(1, Math.floor((room - 150) / 78))); body = 150 + facts.length * 78; }
    } else { rowH = Math.max(84, Math.min(112, Math.floor(room / tiles.length))); body = tiles.length * rowH + 10; }
    const ch = head + body + perf + stub, cx = P, cw = W - 2 * P;
    A.show(A.at(.9, .6), { dy: 90, s: .96, ox: W / 2, oy: top + ch / 2 }, () => {
      ctx.save(); ctx.shadowColor = 'rgba(0,12,48,.38)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 26;
      ctx.fillStyle = '#fff'; rr(ctx, cx, top, cw, ch, 40); ctx.fill(); ctx.restore();
      // Tepasi: ish beruvchi va shahar
      const L = cx + 56, R = cx + cw - 56;
      put(ctx, (d.name ? T.empLbl : T.vac).toUpperCase(), L, top + 66, F(700, 21), GREY, { ls: 3 });
      fitPut(ctx, d.name || T.nRoles(tiles.length), L, top + 114, F, 800, 42, cw / 2 - 40, NAVY, -0.02);
      put(ctx, T.cityLbl.toUpperCase(), R, top + 66, F(700, 21), GREY, { ls: 3, align: 'right' });
      fitPut(ctx, d.city, R, top + 114, F, 800, 42, cw / 2 - 80, NAVY, -0.02, 'right');
      ctx.fillStyle = LINE; ctx.fillRect(L, top + head, cw - 112, 2);
      const by = top + head;
      if (!one) {
        tiles.forEach((tl, i) => {
          const ry = by + 5 + i * rowH, mid = ry + rowH / 2;
          if (i) { ctx.fillStyle = '#F1F3F8'; ctx.fillRect(L, ry, cw - 112, 2); }
          let rw;
          if (!d.hidePay && tl.pay) {
            rw = fitPut(ctx, tl.pay, R, mid + 6, F, 800, 46, 400, BLUE, -0.025, 'right');
            put(ctx, tl.unit || '', R, mid + 38, F(500, 21), GREY, { align: 'right' });
          } else rw = fitPut(ctx, tl.alt, R, mid + 11, F, 600, 30, 400, BLUE, 0, 'right');
          fitPut(ctx, tl.role, L, tl.badge ? mid + 2 : mid + 13, F, 700, 40, cw - 112 - rw - 30, NAVY, -0.015);
          if (tl.badge) put(ctx, tl.badge, L, mid + 36, F(600, 22), '#B7791F');
        });
      } else {
        const tl = tiles[0];
        put(ctx, (showPay ? T.payLbl : T.terms).toUpperCase(), L, by + 62, F(700, 21), GREY, { ls: 3 });
        if (tl.badge) put(ctx, tl.badge, R, by + 62, F(700, 24), '#B7791F', { align: 'right' });
        if (showPay) {
          const pw = fitPut(ctx, tl.pay, L - 4, by + 200, F, 800, 132, cw - 112, BLUE, -0.045);
          put(ctx, tl.unit || '', L, by + 262, F(600, 32), GREY);
          void pw;
          (d.perks || []).slice(0, 3).reduce((px, p) => {
            ctx.font = F(600, 26); ctx.letterSpacing = '0px'; const w = ctx.measureText(p).width + 40;
            if (px + w > R) return px;
            ctx.fillStyle = '#EEF4FF'; rr(ctx, px, by + 284, w, 46, 23); ctx.fill();
            put(ctx, p, px + 20, by + 308, F(600, 26), BLUE, { base: 'middle' });
            return px + w + 12;
          }, L);
        } else {
          facts.forEach((f, i) => {
            const fy = by + 128 + i * 78;
            ctx.fillStyle = '#EEF4FF'; ctx.beginPath(); ctx.arc(L + 22, fy - 14, 22, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = BLUE; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.moveTo(L + 12, fy - 14); ctx.lineTo(L + 19, fy - 6); ctx.lineTo(L + 33, fy - 22); ctx.stroke();
            fitPut(ctx, f, L + 64, fy, F, 700, 42, cw - 112 - 64, NAVY, -0.015);
          });
        }
      }
      // Teshik chiziq: ikki chetida yarim doira (fonning o'zi bilan "o'yilgan")
      const py = top + head + body + perf / 2;
      ctx.setLineDash([14, 12]); ctx.strokeStyle = '#D3DAE6'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx + 48, py); ctx.lineTo(cx + cw - 48, py); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, py, 30, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + cw, py, 30, 0, Math.PI * 2); ctx.fill();
      // Dumi: faqat bazadagi faktlar ustunlari
      let cols = [[T.payoutLbl, d.payout ? T.payoutShort[d.payout] : ''], [T.branchLbl, d.branches > 1 ? String(d.branches) : ''],
        [T.expLbl, d.noExp ? T.expNo : '']].filter(c => c[1]);
      if (!cols.length) cols = [[T.cityLbl, d.city]];
      const colW = (cw - 112) / cols.length, sy = py + perf / 2;
      cols.forEach(([lb, v], i) => {
        const x = L + i * colW;
        put(ctx, lb.toUpperCase(), x, sy + 52, F(700, 20), GREY, { ls: 2.5 });
        fitPut(ctx, v, x, sy + 98, F, 800, 36, colW - 24, NAVY, -0.015);
      });
      // Shtrix-kod (bezak, bot nomidan — har safar bir xil)
      let bx = L; const code = d.bot + d.bot;
      for (let i = 0; bx < L + 330 && i < 200; i++) {
        const w = 3 + (code.charCodeAt(i % code.length) % 4) * 2;
        if (i % 2 === 0) { ctx.fillStyle = NAVY; ctx.fillRect(bx, sy + 138, w, 84); }
        bx += w + 2 + (code.charCodeAt((i * 7) % code.length) % 3);
      }
      fitPut(ctx, '@' + d.bot, R, sy + 186, F, 800, 44, cw - 112 - 370, BLUE, -0.02, 'right');
      fitPut(ctx, T.ctaShort, R, sy + 222, F, 500, 24, cw - 112 - 370, GREY, 0, 'right');
    });
  }

  // ── 3. BLOK — oltin tepa, to'q varaq pastda; ajratilgan so'z to'q plashkada ──
  function blok(ctx, d, F, A) {
    const T = TXT[d.lang] || TXT.uz, P = PAD;
    const GOLD = '#FFC53D', NAVY = '#0B1630', SOFT = '#AEB9D2';
    ctx.fillStyle = GOLD; ctx.fillRect(0, 0, W, H);
    wordmark(ctx, F, P, 136, 56, NAVY, '#0050C8');
    ctx.font = F(700, 24); ctx.letterSpacing = '2px';
    const cwid = ctx.measureText(d.city.toUpperCase()).width + 44; ctx.letterSpacing = '0px';
    ctx.strokeStyle = NAVY; ctx.lineWidth = 2.5; rr(ctx, W - P - cwid, 138, cwid, 54, 27); ctx.stroke();
    put(ctx, d.city.toUpperCase(), W - P - cwid + 22, 166, F(700, 24), NAVY, { ls: 2, base: 'middle' });
    const tiles = d.tiles || [], one = tiles.length === 1, showPay = one && !d.hidePay && tiles[0].pay;
    let y = heads(ctx, d, F, A, { y: 300, maxS: one ? 138 : 124, ink: NAVY, accent: GOLD, mark: NAVY, lh: 1.02 });
    if (d.sub) { y += 42; const yy = y; A.show(A.at(.7, .4), { dy: 20 }, () => fitPut(ctx, d.sub, P, yy, F, 600, 32, W - 2 * P, 'rgba(11,22,48,.72)')); }
    const split = y + 64, cy = CTA_Y - 140, bottom = cy - 92;
    A.show(A.at(.55, .6), { dy: 260 }, () => {
      ctx.fillStyle = NAVY; ctx.beginPath(); ctx.roundRect(0, split, W, H - split + 100, [72, 72, 0, 0]); ctx.fill();
    });
    if (!one) {
      const cols = tiles.length === 1 ? 1 : 2, rows = Math.ceil(tiles.length / cols);
      const cw2 = (W - 2 * P - 48) / cols, cellH = Math.min(260, Math.floor((bottom - split - 64) / rows));
      tiles.forEach((tl, i) => {
        const x = P + (i % cols) * (cw2 + 48), yy = split + 64 + Math.floor(i / cols) * cellH;
        A.show(A.at(1.1 + i * .18, .45), { dy: 40 }, () => {
          if (i % cols) { ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(x - 24, yy + 10, 2, cellH - 40); }
          if (i >= cols) { ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(x, yy - 6, cw2, 2); }
          let bw = 0;
          if (tl.badge) {
            ctx.font = F(700, 20); ctx.letterSpacing = '0px'; bw = ctx.measureText(tl.badge).width + 26;
            ctx.fillStyle = GOLD; rr(ctx, x + cw2 - bw, yy + 22, bw, 36, 18); ctx.fill();
            put(ctx, tl.badge, x + cw2 - bw + 13, yy + 41, F(700, 20), NAVY, { base: 'middle' });
          }
          fitPut(ctx, tl.role, x, yy + 52, F, 600, 32, cw2 - (bw ? bw + 12 : 0), SOFT);
          if (!d.hidePay && tl.pay) {
            fitPut(ctx, tl.pay, x, yy + 52 + 84, F, 800, 72, cw2, '#fff', -0.035);
            put(ctx, tl.unit || '', x, yy + 52 + 84 + 44, F(600, 24), GOLD);
          } else {
            ctx.font = F(700, 38);
            wrap(ctx, tl.alt, cw2).slice(0, 2).forEach((l, k) => fitPut(ctx, l, x, yy + 52 + 64 + k * 46, F, 700, 38, cw2, '#fff', -0.01));
          }
        });
      });
    } else {
      const tl = tiles[0];
      let yy = split + 70;
      A.show(A.at(1.1, .5), { dy: 40 }, () => {
        put(ctx, (showPay ? T.payLbl : T.terms).toUpperCase(), P, yy + 30, F(700, 24), GOLD, { ls: 5 });
        if (tl.badge) put(ctx, tl.badge, W - P, yy + 30, F(700, 26), GOLD, { align: 'right' });
        if (showPay) {
          fitPut(ctx, tl.pay, P - 4, yy + 30 + 190, F, 800, 196, W - 2 * P, '#fff', -0.05);
          put(ctx, tl.unit || '', P, yy + 30 + 190 + 56, F(600, 34), GOLD);
        }
      });
      yy += showPay ? 30 + 190 + 56 + 50 : 78;
      if (showPay) {
        let px = P;
        (d.perks || []).slice(0, 3).forEach((p, i) => {
          ctx.font = F(600, 30); ctx.letterSpacing = '0px'; const w = ctx.measureText(p).width + 52;
          if (px + w > W - P) return;
          const X = px;
          A.show(A.at(1.6 + i * .15, .4), { dy: 20 }, () => {
            ctx.strokeStyle = 'rgba(255,197,61,.7)'; ctx.lineWidth = 2; rr(ctx, X, yy, w, 62, 31); ctx.stroke();
            put(ctx, p, X + 26, yy + 32, F(600, 30), GOLD, { base: 'middle' });
          });
          px += w + 14;
        });
      } else {
        let fs = (d.facts || []).length ? d.facts : [T.payTalk];
        fs = fs.slice(0, Math.max(1, Math.floor((bottom - yy) / 96)));
        fs.forEach((f, i) => A.show(A.at(1.5 + i * .15, .4), { dx: -30 }, () => {
          ctx.fillStyle = GOLD; ctx.fillRect(P, yy + i * 96 + 18, 34, 6);
          fitPut(ctx, f, P + 60, yy + i * 96 + 38, F, 800, 54, W - 2 * P - 60, '#fff', -0.02);
        }));
      }
    }
    A.show(A.at(2.4, .5), { dy: 60 }, () => {
      fitPut(ctx, d.cta || '', P, cy - 36, F, 500, 27, W - 2 * P, SOFT);
      ctx.fillStyle = GOLD; rr(ctx, P, cy, W - 2 * P, 140, 70); ctx.fill();
      fitPut(ctx, '@' + d.bot, P + 60, cy + 90, F, 800, 56, W - 2 * P - 220, NAVY, -0.03);
      arrowIn(ctx, W - P - 76, cy + 70, 46, NAVY, GOLD, nudgeAt(A));
    });
  }

  // ── 4. CHAT — Telegram suhbati: nomzod so'raydi, bot javob beradi (botdagi haqiqiy oqim) ──
  function chat(ctx, d, F, A) {
    const T = TXT[d.lang] || TXT.uz, P = PAD - 24;
    const NAVY = '#0B1630', BLUE = '#0A5BD8', GREY = '#8A94A6', OUT = '#E6F7D4';
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#C6DCEF'); bg.addColorStop(.55, '#D3E3E6'); bg.addColorStop(1, '#DCE8CF');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.30)';             // fon naqshi — mayda nuqtalar
    for (let yy = 40, r = 0; yy < H; yy += 70, r++) for (let xx = (r % 2) * 35 + 20; xx < W; xx += 70) { ctx.beginPath(); ctx.arc(xx, yy, 3, 0, Math.PI * 2); ctx.fill(); }
    // Sarlavha paneli
    ctx.save(); ctx.shadowColor = 'rgba(20,40,70,.10)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
    ctx.fillStyle = 'rgba(255,255,255,.94)'; rr(ctx, P, 118, W - 2 * P, 132, 40); ctx.fill(); ctx.restore();
    mark(ctx, P + 30, 144, 80);
    put(ctx, 'TalentHub', P + 134, 180, F(700, 38), NAVY, { ls: -0.5 });
    put(ctx, T.botWord, P + 134, 222, F(500, 27), GREY);
    put(ctx, d.city, W - P - 36, 184, F(600, 27), GREY, { align: 'right', base: 'middle' });

    const tiles = d.tiles || [], one = tiles.length === 1, maxW = W - 2 * P;
    const inW = maxW - 90, padX = 40;
    // Har pufak oldindan o'lchanadi — sig'masa 3-4-pufak tushib qoladi
    const textBubble = (s, w, size) => { ctx.font = F(500, size); const ls = wrap(ctx, s, w - padX * 2 - 70); return { ls, h: 40 + ls.length * (size * 1.32) + 16 }; };
    const b1 = textBubble(T.chatAsk, maxW - 160, 38);
    ctx.font = F(700, 38);
    const yesTxt = one ? T.chatYesOne(d.name, tiles[0].role) : T.chatYes(d.name);
    const yesL = wrap(ctx, yesTxt, inW - padX * 2);
    const showPay1 = one && !d.hidePay && tiles[0].pay;
    let oneList = one ? (showPay1 ? (d.perks || []) : ((d.facts || []).length ? d.facts : [T.payTalk])) : [];
    const rowH = 100;
    const bodyH = one ? (showPay1 ? 150 : 0) + oneList.length * 60 + 10 : tiles.length * rowH;
    let b2h = 40 + yesL.length * 50 + 18 + bodyH + 56;     // pastida vaqt uchun joy
    const b3 = textBubble(T.chatAsk2, maxW - 160, 38), b4 = textBubble(T.chatNo, inW, 38);
    const footY = CTA_Y - 130, gap = 26, btnH = 100;
    let y = 290;
    const fits = () => y + b1.h + gap + b2h + gap + b3.h + gap + b4.h + 14 + btnH <= footY - 30;
    if (!fits() && one && oneList.length > 2) { b2h -= (oneList.length - 2) * 60; oneList = oneList.slice(0, 2); }
    const withQ = fits();
    const timeOf = i => `10:0${2 + i}`;
    const bubble = (x, yy, w, h, out) => {
      ctx.save(); ctx.shadowColor = 'rgba(20,40,70,.10)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
      ctx.fillStyle = out ? OUT : '#fff'; ctx.beginPath(); ctx.roundRect(x, yy, w, h, out ? [34, 34, 8, 34] : [34, 34, 34, 8]); ctx.fill(); ctx.restore();
    };
    const outBubble = (b, yy, delay, i) => {
      ctx.font = F(500, 38); const tw = Math.max(...b.ls.map(l => ctx.measureText(l).width));
      const w = tw + padX * 2 + 76, x = W - P - w;
      A.show(A.at(delay, .35), { dx: 50 }, () => {
        bubble(x, yy, w, b.h, true);
        b.ls.forEach((l, k) => put(ctx, l, x + padX, yy + 62 + k * 50, F(500, 38), NAVY));
        put(ctx, timeOf(i), x + w - 26, yy + b.h - 22, F(500, 22), '#6FA05A', { align: 'right' });
      });
    };
    // 1. Nomzod
    outBubble(b1, y, .2, 0); y += b1.h + gap;
    // "yozmoqda..." — faqat videoda, bot javobidan oldin
    if (A.live && A.t > .6 && A.t < 1.25) {
      bubble(P, y, 150, 84, false);
      for (let k = 0; k < 3; k++) { ctx.fillStyle = `rgba(138,148,166,${.35 + .65 * (0.5 + 0.5 * Math.sin(A.t * 9 - k))})`; ctx.beginPath(); ctx.arc(P + 46 + k * 30, y + 42, 9, 0, Math.PI * 2); ctx.fill(); }
    }
    // 2. Bot: ishlar
    const y2 = y;
    A.show(A.at(1.3, .45), { dx: -50 }, () => {
      bubble(P, y2, inW, b2h, false);
      const L = P + padX, R = P + inW - padX;
      yesL.forEach((l, k) => put(ctx, l, L, y2 + 64 + k * 50, F(700, 38), NAVY));
      let by = y2 + 40 + yesL.length * 50 + 18;
      if (!one) {
        tiles.forEach((tl, i) => {
          const ry = by + i * rowH, mid = ry + rowH / 2;
          ctx.fillStyle = '#EEF1F6'; ctx.fillRect(L, ry, R - L, 2);
          let rw;
          if (!d.hidePay && tl.pay) {
            rw = fitPut(ctx, tl.pay, R, mid + 6, F, 800, 42, 380, BLUE, -0.02, 'right');
            put(ctx, tl.unit || '', R, mid + 36, F(500, 21), GREY, { align: 'right' });
          } else rw = fitPut(ctx, tl.alt, R, mid + 11, F, 600, 30, 380, BLUE, 0, 'right');
          fitPut(ctx, tl.role, L, tl.badge ? mid + 2 : mid + 13, F, 600, 37, R - L - rw - 28, NAVY);
          if (tl.badge) put(ctx, tl.badge, L, mid + 34, F(600, 21), '#B7791F');
        });
      } else {
        if (showPay1) {
          const pw = fitPut(ctx, tiles[0].pay, L - 2, by + 104, F, 800, 104, R - L - 160, BLUE, -0.04);
          put(ctx, tiles[0].unit || '', L + pw + 18, by + 104, F(600, 28), GREY);
          by += 150;
        }
        oneList.forEach((f, i) => {
          ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(L + 8, by + 30 + i * 60 - 11, 6, 0, Math.PI * 2); ctx.fill();
          fitPut(ctx, f, L + 32, by + 30 + i * 60, F, 500, 34, R - L - 32, NAVY);
        });
      }
      put(ctx, timeOf(1), R + padX - 26, y2 + b2h - 20, F(500, 22), GREY, { align: 'right' });
    });
    y += b2h + gap;
    let lastIn = y2, lastInH = b2h;
    if (withQ) {
      outBubble(b3, y, 2.1, 2); y += b3.h + gap;
      const y4 = y;
      A.show(A.at(2.6, .35), { dx: -50 }, () => {
        bubble(P, y4, inW, b4.h, false);
        b4.ls.forEach((l, k) => put(ctx, l, P + padX, y4 + 62 + k * 50, F(500, 38), NAVY));
        put(ctx, timeOf(3), P + inW - 26, y4 + b4.h - 22, F(500, 22), GREY, { align: 'right' });
      });
      lastIn = y4; lastInH = b4.h;
    }
    // Inline tugma — pufak tagida, Telegramdagidek shaffof
    const yb = lastIn + lastInH + 14;
    A.show(A.at(withQ ? 3.0 : 2.0, .4), { dy: 20 }, () => {
      ctx.fillStyle = BLUE; rr(ctx, P, yb, inW, btnH, 26); ctx.fill();
      put(ctx, T.chatBtn, P + inW / 2, yb + btnH / 2 + 2, F(600, 36), '#fff', { align: 'center', base: 'middle' });
      ctx.save(); ctx.translate(P + inW - 50, yb + 22); ctx.scale(1.1, 1.1);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(22, 0); ctx.lineTo(22, 12); ctx.moveTo(22, 0); ctx.lineTo(8, 14); ctx.stroke(); ctx.restore();
    });
    // Pastda — bot manzili
    A.show(A.at(withQ ? 3.3 : 2.3, .45), { dy: 40 }, () => {
      ctx.save(); ctx.shadowColor = 'rgba(20,40,70,.16)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
      ctx.fillStyle = '#fff'; rr(ctx, P, footY, maxW, 112, 56); ctx.fill(); ctx.restore();
      const g = ctx.createLinearGradient(P + 18, footY + 14, P + 102, footY + 98); g.addColorStop(0, '#3A92FF'); g.addColorStop(1, '#0050C8');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P + 62, footY + 56, 40, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(P + 62 - 22, footY + 56 - 22); ctx.scale(44 / 24, 44 / 24); ctx.fillStyle = '#fff'; ctx.fill(new Path2D(PLANE)); ctx.restore();
      fitPut(ctx, '@' + d.bot, P + 126, footY + 74, F, 800, 48, maxW - 126 - 150, BLUE, -0.02);
      arrowIn(ctx, W - P - 62, footY + 56, 36, '#EEF4FF', BLUE, nudgeAt(A));
    });
  }

  const STYLE_FN = { afisha, chipta, blok, chat };

  // ── Video: 1080×1920, ~9 s, brauzerning o'zi yozadi (MediaRecorder) ──
  // Server va tashqi kutubxona yo'q. Chrome 126+ va Safari — MP4 (H.264) — Telegram va
  // Instagram story to'g'ridan-to'g'ri qabul qiladi; eski brauzerda WebM (ogohlantirish bilan).
  // Real vaqtda yoziladi: shu 9 s davomida varaq ochiq tursin (fonda kadrlar to'xtaydi).
  const VIDEO_TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.4d0028', 'video/mp4;codecs=avc1', 'video/mp4',
    'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  function videoType() {
    if (typeof MediaRecorder === 'undefined') return '';
    return VIDEO_TYPES.find(x => MediaRecorder.isTypeSupported(x)) || '';
  }

  async function renderVideo(d, { seconds = VIDEO_SECONDS, fps = 30, onProgress } = {}) {
    const type = videoType();
    if (!type) throw new Error('Bu brauzer video yoza olmaydi — Chrome yoki Safari kerak');
    await fonts();
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    paint(ctx, d, 0);
    const stream = cv.captureStream(fps);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(res => { rec.onstop = res; });
    let startedAt = 0;
    rec.onstart = () => { startedAt = performance.now(); };
    rec.start(250);
    // Yozuvchi kech "uyg'onadi" — animatsiya boshi tushib qolmasin: birinchi kadrni
    // chizib turamiz (yozuvchi kadr kelgandagina ishga tushadi — kutib o'tirsak qotadi),
    // ishga tushgach yana 0.15 s, keyin soat boshlanadi. Eng ko'pi 2 s.
    // Taymer — requestAnimationFrame EMAS: u yashirin/fondagi varaqda butunlay to'xtaydi
    // (video abadiy "yozilmoqda" bo'lib qotardi — sinovda o'lchandi). setTimeout fonda
    // sekinlashadi, lekin to'xtamaydi.
    const tick = 1000 / fps;
    await new Promise(done => {
      const h0 = performance.now();
      const hold = () => {
        paint(ctx, d, 0);
        const now = performance.now();
        if ((startedAt && now - startedAt >= 150) || now - h0 >= 2000) return done();
        setTimeout(hold, tick);
      };
      hold();
    });
    const t0 = performance.now();
    await new Promise(done => {
      const frame = () => {
        const t = (performance.now() - t0) / 1000;
        paint(ctx, d, Math.min(t, seconds));
        if (onProgress) onProgress(Math.min(1, t / seconds));
        if (t >= seconds) return done();
        setTimeout(frame, tick);
      };
      frame();
    });
    // Oxirgi kadr ham yozilsin
    await new Promise(r => setTimeout(r, 120));
    rec.stop();
    await stopped;
    stream.getTracks().forEach(tr => tr.stop());
    const mp4 = type.startsWith('video/mp4');
    return { blob: new Blob(chunks, { type: mp4 ? 'video/mp4' : 'video/webm' }), ext: mp4 ? 'mp4' : 'webm', mp4 };
  }

  window.thStory = { render, renderVideo, videoType, paint, fromVacancies, money, TXT, THEMES, STYLES, LIB, photoGroup, photoUrl, loadPhoto, W, H, VIDEO_SECONDS };
})();
