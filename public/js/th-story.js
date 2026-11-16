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
    uz: { city: 'Toshkent', month: "so'm / oy", day: "so'm / kun", shift: "so'm / smena", badge: 'Tajribasiz', mln: 'mln',
      cta: 'Ariza — 2 daqiqa, rezyume shart emas', branches: n => `${n} ta filial`,
      payout: { daily: 'maosh har kuni', weekly: 'maosh har hafta', tenday: 'maosh har 10 kunda', twice: 'maosh oyiga 2 marta', monthly: 'maosh oyiga 1 marta' },
      lines: name => name ? [name, '*jamoasiga*', "qo'shiling"] : ['Restoranga', '*xodimlar*', 'kerak'] },
    ru: { city: 'Ташкент', month: 'сум / мес', day: 'сум / день', shift: 'сум / смена', badge: 'Без опыта', mln: 'млн',
      cta: 'Отклик — 2 минуты, без резюме', branches: n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'филиал' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'филиала' : 'филиалов'}`,
      payout: { daily: 'зарплата каждый день', weekly: 'зарплата каждую неделю', tenday: 'зарплата каждые 10 дней', twice: 'зарплата 2 раза в месяц', monthly: 'зарплата раз в месяц' },
      lines: name => name ? ['Команда', `*${name}*`, 'ждёт вас'] : ['В ресторан', '*нужны*', 'сотрудники'] }
  };
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
    const tiles = list.map(v => ({
      role: mainTitle(v.title),
      pay: money(v.salaryFrom, v.salaryTo, lang),
      unit: T[v.salaryPeriod === 'day' ? 'day' : v.salaryPeriod === 'shift' ? 'shift' : 'month'],
      badge: (v.perks || []).includes('tajribasiz') ? T.badge : '',
      _v: (v.salaryPeriod === 'month' ? 1 : 26) * (v.salaryTo || v.salaryFrom || 0)
    }));
    // Eng ko'p to'lanadigani birinchi va ko'k (ko'z birinchi shunga tushadi)
    tiles.sort((a, b) => b._v - a._v);
    if (tiles[0]) tiles[0].hot = true;
    const locs = [...new Set(rows.flatMap(v => String(v.location || '').split(/\s*[,;·]\s*/)).map(s => s.trim()).filter(Boolean))];
    const locTxt = locs.map(s => lang === 'ru' ? (RU_PLACE[s.toLowerCase()] || s) : s).join(' · ');
    const payouts = [...new Set(rows.map(v => v.payout).filter(Boolean))];
    const sub = [locs.length > 1 ? T.branches(locs.length) : '', payouts.length === 1 ? T.payout[payouts[0]] || '' : ''].filter(Boolean).join(' · ');
    return { lang, lines: T.lines(name), sub, loc: locs.length > 1 ? locTxt : locTxt, tiles, cta: T.cta, city: T.city, bot: 'TalentHubUzBot' };
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

  async function render(d) {
    await fonts();
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const F = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`;

    // Fon
    let g = ctx.createLinearGradient(700, 0, 380, H);
    g.addColorStop(0, '#0E2350'); g.addColorStop(.45, '#081634'); g.addColorStop(1, '#050D24');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(30, 1270, 0, 30, 1270, 450);
    g.addColorStop(0, 'rgba(47,139,255,.32)'); g.addColorStop(.65, 'rgba(47,139,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 700, 700, 1100);
    // Oltin doira (brend nuqtasi)
    ctx.save();
    ctx.shadowColor = 'rgba(255,197,61,.30)'; ctx.shadowBlur = 180;
    g = ctx.createRadialGradient(924, 196, 20, 1000, 120, 380);
    g.addColorStop(0, '#FFD36B'); g.addColorStop(.4, '#FFC53D'); g.addColorStop(1, '#E9A21C');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(1000, 120, 380, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Brend
    const bx = PAD, by = 128;
    g = ctx.createLinearGradient(0, by, 0, by + 60); g.addColorStop(0, '#3A92FF'); g.addColorStop(1, '#0050C8');
    ctx.fillStyle = g; rr(ctx, bx, by, 60, 60, 15); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx + 15.75, by + 21); ctx.lineTo(bx + 39, by + 21); ctx.moveTo(bx + 27.4, by + 21); ctx.lineTo(bx + 27.4, by + 44.25); ctx.stroke();
    ctx.fillStyle = '#FFC53D'; ctx.beginPath(); ctx.arc(bx + 44.25, by + 21, 5.85, 0, Math.PI * 2); ctx.fill();
    ctx.font = F(700, 38); ctx.letterSpacing = '-0.5px'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText('Talent', bx + 76, by + 31);
    ctx.fillStyle = '#6FAEFF'; ctx.fillText('Hub', bx + 76 + ctx.measureText('Talent').width, by + 31);
    // Shahar
    ctx.font = F(600, 26); ctx.letterSpacing = '1px';
    const cw = ctx.measureText(d.city).width + 44;
    ctx.fillStyle = 'rgba(8,22,52,.78)'; rr(ctx, W - PAD - cw, by + 2, cw, 56, 28); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(d.city, W - PAD - cw + 22, by + 31);

    // Sarlavha — eng uzun qatorga qarab o'lcham
    ctx.textBaseline = 'alphabetic';
    const lines = (d.lines || []).filter(Boolean).slice(0, 4);
    let hs = 118;
    for (const l of lines) hs = Math.min(hs, fit(ctx, l.replace(/\*/g, ''), F(800, '{s}'), 118, W - PAD * 2, -0.038));
    ctx.font = F(800, hs); ctx.letterSpacing = (-0.038 * hs) + 'px';
    let y = 338 + hs * .82;
    for (const l of lines) {
      const gold = /^\*.*\*$/.test(l.trim());
      ctx.fillStyle = gold ? '#FFC53D' : '#fff';
      ctx.fillText(l.replace(/\*/g, ''), PAD, y);
      y += hs * .98;
    }
    y += -hs * .98 + 44 + 34 * .9;                    // pastki chiziqli harflar (g, y) sarlavhaga tegmasin
    if (d.sub) { ctx.font = F(600, 34); ctx.letterSpacing = '0px'; ctx.fillStyle = '#C9D7F2'; fit(ctx, d.sub, F(600, '{s}'), 34, W - PAD * 2); ctx.fillText(d.sub, PAD, y); y += 48; }
    if (d.loc) { fit(ctx, d.loc, F(500, '{s}'), 27, W - PAD * 2); ctx.fillStyle = '#7F96C2'; ctx.fillText(d.loc, PAD, y); y += 10; }

    // Plitkalar 2 ustun
    const tiles = (d.tiles || []).slice(0, 4);
    const tw = (W - PAD * 2 - 20) / 2, th = 232;
    let ty = y + 62;
    tiles.forEach((t, i) => {
      const x = PAD + (i % 2) * (tw + 20), yy = ty + Math.floor(i / 2) * (th + 20);
      if (t.hot) {
        g = ctx.createLinearGradient(x, yy, x + tw, yy + th);
        g.addColorStop(0, 'rgba(47,139,255,.38)'); g.addColorStop(1, 'rgba(0,80,200,.22)');
        ctx.fillStyle = g; rr(ctx, x, yy, tw, th, 32); ctx.fill();
        ctx.strokeStyle = 'rgba(111,174,255,.45)';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,.07)'; rr(ctx, x, yy, tw, th, 32); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.10)';
      }
      ctx.lineWidth = 1.5; ctx.stroke();
      let bw = 0;
      if (t.badge) {
        ctx.font = F(700, 21); ctx.letterSpacing = '0px';
        bw = ctx.measureText(t.badge).width + 28;
        ctx.fillStyle = '#FFC53D'; rr(ctx, x + tw - 24 - bw, yy + 26, bw, 38, 19); ctx.fill();
        ctx.fillStyle = '#1A1300'; ctx.textBaseline = 'middle'; ctx.fillText(t.badge, x + tw - 24 - bw + 14, yy + 46); ctx.textBaseline = 'alphabetic';
      }
      fit(ctx, t.role, F(600, '{s}'), 32, tw - 64 - (bw ? bw + 12 : 0));
      ctx.fillStyle = '#C9D7F2'; ctx.fillText(t.role, x + 32, yy + 38 + 30);
      fit(ctx, t.pay, F(800, '{s}'), 62, tw - 64, -0.032);
      ctx.fillStyle = '#fff'; ctx.fillText(t.pay, x + 32, yy + 38 + 30 + 18 + 56);
      ctx.font = F(500, 25); ctx.letterSpacing = '0px'; ctx.fillStyle = '#8FA6CF';
      ctx.fillText(t.unit || '', x + 32, yy + 38 + 30 + 18 + 56 + 40);
    });

    // CTA — oq blok (pastda havola stikeri uchun joy qoladi)
    const cy = H - 236 - 160, cx = PAD, cW = W - PAD * 2;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 80; ctx.shadowOffsetY = 30;
    ctx.fillStyle = '#fff'; rr(ctx, cx, cy, cW, 160, 36); ctx.fill(); ctx.restore();
    g = ctx.createLinearGradient(cx + 34, cy + 32, cx + 130, cy + 128); g.addColorStop(0, '#3A92FF'); g.addColorStop(1, '#0050C8');
    ctx.fillStyle = g; rr(ctx, cx + 34, cy + 32, 96, 96, 28); ctx.fill();
    ctx.save(); ctx.translate(cx + 34 + 20, cy + 32 + 20); ctx.scale(56 / 24, 56 / 24); ctx.fillStyle = '#fff'; ctx.fill(new Path2D(PLANE)); ctx.restore();
    fit(ctx, d.cta || '', F(600, '{s}'), 26, cW - 300);
    ctx.fillStyle = '#4A5D80'; ctx.fillText(d.cta || '', cx + 156, cy + 66);
    fit(ctx, '@' + d.bot, F(800, '{s}'), 54, cW - 290, -0.028);
    ctx.fillStyle = '#0050C8'; ctx.fillText('@' + d.bot, cx + 156, cy + 124);
    ctx.fillStyle = '#EEF4FF'; ctx.beginPath(); ctx.arc(cx + cW - 66, cy + 80, 32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0050C8'; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx + cW - 80, cy + 80); ctx.lineTo(cx + cW - 52, cy + 80); ctx.moveTo(cx + cW - 64, cy + 68); ctx.lineTo(cx + cW - 52, cy + 80); ctx.lineTo(cx + cW - 64, cy + 92); ctx.stroke();
    return cv;
  }

  window.thStory = { render, fromVacancies, money, TXT };
})();
