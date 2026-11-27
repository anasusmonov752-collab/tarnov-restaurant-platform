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
      lines: name => name ? [name, '*jamoasiga*', "qo'shiling"] : ['Restoranga', '*xodimlar*', 'kerak'] },
    ru: { city: 'Ташкент', usd: '$ / мес', month: 'сум / мес', day: 'сум / день', shift: 'сум / смена', badge: 'Без опыта', mln: 'млн',
      cta: 'Отклик — 2 минуты, без резюме',
      // Падеж названия не склоняем ("ищет шашлычника" не собрать) — "Требуется / *Шашлычник*"
      one: (name, role) => name ? [name + ':', 'требуется', `*${role}*`] : ['Требуется', `*${role}*`],
      branches: n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'филиал' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'филиала' : 'филиалов'}`,
      payout: { daily: 'зарплата каждый день', weekly: 'зарплата каждую неделю', tenday: 'зарплата каждые 10 дней', twice: 'зарплата 2 раза в месяц', monthly: 'зарплата раз в месяц' },
      lines: name => name ? ['Команда', `*${name}*`, 'ждёт вас'] : ['В ресторан', '*нужны*', 'сотрудники'] }
  };
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
  function fromVacancies(rows, { lang = 'uz', name = '' } = {}) {
    const T = TXT[lang] || TXT.uz;
    const list = rows.filter(v => v.salaryFrom || v.salaryTo).slice(0, 4);
    const titleOf = v => (lang === 'ru' && v.ru && v.ru.title) || v.title;
    const tiles = list.map(v => {
      const usd = v.salaryCurrency === 'usd';         // "1 000+ · $ / oy" (top lavozimlar)
      return {
        role: mainTitle(titleOf(v)), full: String(titleOf(v) || '').trim(), roleKey: v.role || '',
        pay: usd ? sp(v.salaryFrom || v.salaryTo) + (v.salaryTo && v.salaryTo !== v.salaryFrom ? '–' + sp(v.salaryTo) : (v.salaryFrom && !v.salaryTo ? '+' : '')) : money(v.salaryFrom, v.salaryTo, lang),
        unit: usd ? T.usd : T[v.salaryPeriod === 'day' ? 'day' : v.salaryPeriod === 'shift' ? 'shift' : 'month'],
        badge: (v.perks || []).includes('tajribasiz') ? T.badge : '',
        // Faqat tartib uchun (ko'rsatilmaydi): dollar taxminan so'mga
        _v: (usd ? 12000 : 1) * (v.salaryPeriod === 'month' || !v.salaryPeriod ? 1 : 26) * (v.salaryTo || v.salaryFrom || 0)
      };
    });
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
    return { lang, lines, sub, loc: locTxt, tiles, perks, cta: T.cta, city: T.city, bot: 'TalentHubUzBot' };
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
    ctx.letterSpacing = '0px'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    const F = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`;

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
      fit(ctx, tl.pay, F(800, '{s}'), 150, cw - 96, -0.035);
      ctx.fillStyle = C.hotPay || C.tilePay; ctx.fillText(tl.pay, x + 48, yy + 78 + 170);
      ctx.font = F(500, 32); ctx.letterSpacing = '0px'; ctx.fillStyle = C.hotUnit || C.tileUnit;
      ctx.fillText(tl.unit || '', x + 48, yy + 78 + 170 + 66);
    });
    // Afzalliklar — kapsulalar, kerak bo'lsa ikkinchi qatorga o'tadi
    const perks = (d.perks || []).slice(0, 3);
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
      fit(ctx, tl.pay, F(800, '{s}'), 62, tw - 64, -0.032);
      ctx.fillStyle = hot('Pay'); ctx.fillText(tl.pay, x + 32, yy + 38 + 30 + 18 + 56);
      ctx.font = F(500, 25); ctx.letterSpacing = '0px'; ctx.fillStyle = hot('Unit');
      ctx.fillText(tl.unit || '', x + 32, yy + 38 + 30 + 18 + 56 + 40);
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

  window.thStory = { render, renderVideo, videoType, paint, fromVacancies, money, TXT, THEMES, LIB, photoGroup, photoUrl, loadPhoto, W, H, VIDEO_SECONDS };
})();
