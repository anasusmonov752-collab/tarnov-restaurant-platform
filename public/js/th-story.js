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
      payout: { daily: 'maosh har kuni', weekly: 'maosh har hafta', tenday: 'maosh har 10 kunda', twice: 'maosh oyiga 2 marta', monthly: 'maosh oyiga 1 marta' },
      lines: name => name ? [name, '*jamoasiga*', "qo'shiling"] : ['Restoranga', '*xodimlar*', 'kerak'] },
    ru: { city: 'Ташкент', usd: '$ / мес', month: 'сум / мес', day: 'сум / день', shift: 'сум / смена', badge: 'Без опыта', mln: 'млн',
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
    const tiles = list.map(v => {
      const usd = v.salaryCurrency === 'usd';         // "1 000+ · $ / oy" (top lavozimlar)
      return {
        role: mainTitle(v.title),
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

    // Fon
    let g = ctx.createLinearGradient(700, 0, 380, H);
    g.addColorStop(0, '#0E2350'); g.addColorStop(.45, '#081634'); g.addColorStop(1, '#050D24');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(30, 1270, 0, 30, 1270, 450);
    g.addColorStop(0, 'rgba(47,139,255,.32)'); g.addColorStop(.65, 'rgba(47,139,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 700, 700, 1100);
    // Oltin doira (brend nuqtasi) — videoda o'sib chiqadi va sekin "nafas oladi"
    const gr = 380 * (live ? .9 + .1 * at(0, 1.1) + .015 * Math.sin(t * 1.6) : 1);
    ctx.save();
    ctx.shadowColor = 'rgba(255,197,61,.30)'; ctx.shadowBlur = 180;
    g = ctx.createRadialGradient(924, 196, 20, 1000, 120, gr);
    g.addColorStop(0, '#FFD36B'); g.addColorStop(.4, '#FFC53D'); g.addColorStop(1, '#E9A21C');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(1000, 120, gr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Brend birinchi kadrdanoq turadi: yozuvchi ~0.5 s kech boshlaydi — video bo'sh ekran bilan boshlanmasin
    brand(ctx, d, F);
    const y0 = headline(ctx, d, F, show, at);
    tilesBlock(ctx, d, F, show, at, y0, t, live);
    show(at(2.5, .55), { dy: 140 }, () => cta(ctx, d, F, t, live));
  }

  function brand(ctx, d, F) {
    let g;
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
    ctx.textBaseline = 'alphabetic';
  }

  // Sarlavha, ostki qator, filiallar — qatorma-qator pastdan chiqadi. Plitkalar boshlanadigan y ni qaytaradi.
  function headline(ctx, d, F, show, at) {
    ctx.textBaseline = 'alphabetic';
    const lines = (d.lines || []).filter(Boolean).slice(0, 4);
    let hs = 118;
    for (const l of lines) hs = Math.min(hs, fit(ctx, l.replace(/\*/g, ''), F(800, '{s}'), 118, W - PAD * 2, -0.038));
    let y = 338 + hs * .82;
    lines.forEach((l, i) => {
      const yy = y;
      show(at(i * .2, .5), { dy: 56 }, () => {
        ctx.font = F(800, hs); ctx.letterSpacing = (-0.038 * hs) + 'px';
        ctx.fillStyle = /^\*.*\*$/.test(l.trim()) ? '#FFC53D' : '#fff';
        ctx.fillText(l.replace(/\*/g, ''), PAD, yy);
      });
      y += hs * .98;
    });
    y += -hs * .98 + 44 + 34 * .9;                    // pastki chiziqli harflar (g, y) sarlavhaga tegmasin
    if (d.sub) {
      const yy = y;
      show(at(.85, .45), { dy: 30 }, () => {
        ctx.letterSpacing = '0px'; fit(ctx, d.sub, F(600, '{s}'), 34, W - PAD * 2);
        ctx.fillStyle = '#C9D7F2'; ctx.fillText(d.sub, PAD, yy);
      });
      y += 48;
    }
    if (d.loc) {
      const yy = y;
      show(at(1.0, .45), { dy: 30 }, () => {
        ctx.letterSpacing = '0px'; fit(ctx, d.loc, F(500, '{s}'), 27, W - PAD * 2);
        ctx.fillStyle = '#7F96C2'; ctx.fillText(d.loc, PAD, yy);
      });
      y += 10;
    }
    return y;
  }

  // Plitkalar 2 ustun — navbatma-navbat "ochiladi"; eng ko'p to'lanadigani keyin sekin yonib turadi
  function tilesBlock(ctx, d, F, show, at, y, t, live) {
    let g;
    const tiles = (d.tiles || []).slice(0, 4);
    const tw = (W - PAD * 2 - 20) / 2, th = 232;
    let ty = y + 62;
    tiles.forEach((tl, i) => {
      const x = PAD + (i % 2) * (tw + 20), yy = ty + Math.floor(i / 2) * (th + 20);
      show(at(1.2 + i * .22, .5), { dy: 40, s: .9, ox: x + tw / 2, oy: yy + th / 2 }, () => {
      if (tl.hot) {
        g = ctx.createLinearGradient(x, yy, x + tw, yy + th);
        g.addColorStop(0, 'rgba(47,139,255,.38)'); g.addColorStop(1, 'rgba(0,80,200,.22)');
        ctx.fillStyle = g; rr(ctx, x, yy, tw, th, 32); ctx.fill();
        // Videoda: 3 s dan keyin chegara sekin yonib-o'chadi (ko'z shunga tushsin)
        const glow = live && t > 3 ? .45 + .35 * (0.5 + 0.5 * Math.sin((t - 3) * 3)) : .45;
        ctx.strokeStyle = `rgba(111,174,255,${glow.toFixed(3)})`;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,.07)'; rr(ctx, x, yy, tw, th, 32); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.10)';
      }
      ctx.lineWidth = tl.hot && live && t > 3 ? 3 : 1.5; ctx.stroke();
      let bw = 0;
      if (tl.badge) {
        ctx.font = F(700, 21); ctx.letterSpacing = '0px';
        bw = ctx.measureText(tl.badge).width + 28;
        ctx.fillStyle = '#FFC53D'; rr(ctx, x + tw - 24 - bw, yy + 26, bw, 38, 19); ctx.fill();
        ctx.fillStyle = '#1A1300'; ctx.textBaseline = 'middle'; ctx.fillText(tl.badge, x + tw - 24 - bw + 14, yy + 46); ctx.textBaseline = 'alphabetic';
      }
      fit(ctx, tl.role, F(600, '{s}'), 32, tw - 64 - (bw ? bw + 12 : 0));
      ctx.fillStyle = '#C9D7F2'; ctx.fillText(tl.role, x + 32, yy + 38 + 30);
      fit(ctx, tl.pay, F(800, '{s}'), 62, tw - 64, -0.032);
      ctx.fillStyle = '#fff'; ctx.fillText(tl.pay, x + 32, yy + 38 + 30 + 18 + 56);
      ctx.font = F(500, 25); ctx.letterSpacing = '0px'; ctx.fillStyle = '#8FA6CF';
      ctx.fillText(tl.unit || '', x + 32, yy + 38 + 30 + 18 + 56 + 40);
      });
    });
  }

  // CTA — oq blok (pastda havola stikeri uchun joy qoladi); videoda o'q tugmasi "chaqiradi"
  function cta(ctx, d, F, t, live) {
    let g;
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
    const ax = cx + cW - 66, ay = cy + 80;
    // 3.2 s dan keyin: doira atrofida to'lqin va o'q o'ngga "itariladi" (har 1.4 s)
    const ph = live && t > 3.2 ? ((t - 3.2) % 1.4) / 1.4 : -1;
    if (ph >= 0) {
      ctx.save(); ctx.globalAlpha *= (1 - ph) * .6;
      ctx.strokeStyle = '#3A92FF'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ax, ay, 32 + ph * 26, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    const nudge = ph >= 0 ? 7 * Math.sin(Math.min(ph * 2, 1) * Math.PI) : 0;
    ctx.fillStyle = '#EEF4FF'; ctx.beginPath(); ctx.arc(ax, ay, 32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0050C8'; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
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

  window.thStory = { render, renderVideo, videoType, paint, fromVacancies, money, TXT, W, H, VIDEO_SECONDS };
})();
