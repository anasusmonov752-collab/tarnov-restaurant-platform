// ── TalentHub panel qobig'i ──────────────────────────────────
// Har agentlik sahifasiga bitta chap menyu qo'yadi (ilgari har sahifada
// boshqa tugmalar qatori va "← Admin" bor edi). Sahifaning o'z mazmuni
// .th-page ichiga ko'chadi; eski topbar'dagi bo'limlararo havolalar
// yashiriladi — ular endi menyuda.
// Ulash: <head> ichida /css/th.css va /css/th-app.css stillari hamda
// shu fayl (defer bilan). Izohda yopuvchi script tegini yozmang — sahifaga
// ichki joylashtirilsa skriptni yopib qo'yadi.
(function () {
  const I = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4"/>',
    briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    form: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'
  };
  const svg = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

  const NAV = [
    { g: '', items: [{ href: '/talenthub.html', l: 'Bugun', ic: 'sun' }] },
    { g: 'Ish', items: [
      // Bitta ro'yxat: ariza + anketa, natija bir bosishda (services/callQueue)
      { href: '/qongiroq.html', l: 'Qo\'ng\'iroqlar', ic: 'phone', n: 'callsDue', nTitle: 'qo\'ng\'iroq kutayotgan nomzodlar', hot: true },
      // Nomzodlar manba bo'yicha ikki bo'lim (baza bitta — recruitment.html ?src=)
      { href: '/recruitment.html?src=anketa', also: ['/recruitment-kanban.html?src=anketa'], l: 'Anketadan', ic: 'inbox',
        n: 'anketaUnseen', nTitle: 'ko\'rilmagan anketalar', hot: true },
      { href: '/recruitment.html', also: ['/recruitment-kanban.html'], l: 'hh.uz bazasi', ic: 'users', n: 'baseWeek', nTitle: 'shu hafta qo\'shilgan' },
      { href: '/mijozlar.html', l: 'Mijozlar va tanlovlar', ic: 'building', n: 'waitingShortlists', nTitle: 'sizni kutayotgan tanlovlar' },
      { href: '/arizalar.html', l: 'Arizalar', ic: 'send', n: 'appsUnseen', nTitle: 'ko\'rilmagan arizalar', hot: true },
      { href: '/tolovlar.html', l: 'To\'lovlar', ic: 'card', n: 'ordersPending', nTitle: 'tasdiq kutayotgan tarif so\'rovlari', hot: true },
      { href: '/vakansiyalar.html', l: 'Vakansiyalar', ic: 'briefcase',
        n: 'staleJobs', nTitle: 'tasdiqlanmagan \u2014 nomzodga ko\'rinmaydi', hot: true },
      { href: '/taklif.html', l: 'Taklif navbati', ic: 'send' },
      { href: '/analitika.html', l: 'Analitika', ic: 'chart' },
      { href: '/suhbatlar.html', l: 'Suhbatlar', ic: 'chat', n: 'unreadChats', nTitle: 'o\'qilmagan xabarlar' }
    ] },
    { g: 'Sozlash', items: [{ href: '/anketalar.html', l: 'Anketalar', ic: 'form' }] }
  ];
  const ALL = NAV.flatMap(g => g.items);
  const path = location.pathname === '/' ? '/talenthub.html' : location.pathname;
  // Nomzodlar bo'limi ?src= bilan ajraladi — solishtirishda u ham hisobga olinadi
  const cur = path + (new URLSearchParams(location.search).get('src') === 'anketa' ? '?src=anketa' : '');
  const isOn = it => it.href === cur || (it.also || []).includes(cur);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function mount() {
    const b = document.body;
    if (b.classList.contains('th-app')) return;
    b.classList.add('th', 'th-app');

    const page = document.createElement('div');
    page.className = 'th-page';
    while (b.firstChild) page.appendChild(b.firstChild);

    const side = document.createElement('aside');
    side.className = 'th-side';
    side.setAttribute('aria-label', 'Bo\'limlar');
    side.innerHTML = `
      <a class="th-logo" href="/talenthub.html" aria-label="TalentHub — bosh sahifa">
        <img src="/img/talenthub-mark.svg" width="28" height="28" alt=""><span class="wt">Talent<span>Hub</span></span></a>
      ${NAV.map(g => `${g.g ? `<div class="th-nav-g">${g.g}</div>` : ''}${g.items.map(it =>
        `<a class="th-nav-a ${isOn(it) ? 'on' : ''}" href="${it.href}" ${isOn(it) ? 'aria-current="page"' : ''}>
           ${svg(it.ic)}<span>${it.l}</span>${it.n ? `<span class="n ${it.hot ? 'hot' : ''}" data-n="${it.n}" title="${esc(it.nTitle || '')}"></span>` : ''}</a>`).join('')}`).join('')}
      <div class="th-side-foot">
        <div class="who"><b id="thWho">TalentHub</b><small>Agentlik paneli</small></div>
        <button class="th-icon-btn" id="thOut" title="Chiqish" aria-label="Chiqish">${svg('out')}</button>
      </div>`;

    const scrim = document.createElement('div');
    scrim.className = 'th-scrim';
    b.append(side, page, scrim);

    // Eski topbar: bo'limlararo havolalar endi menyuda. Nomzodlar
    // sahifasidagi Ro'yxat/Kanban almashtirgich qoladi.
    const onRec = path.startsWith('/recruitment');
    page.querySelectorAll('.topbar a').forEach(a => {
      const h = (a.getAttribute('href') || '').split('#')[0];
      if (h === '/restaurant-admin.html' || h === '/admin.html') { a.hidden = true; return; }
      const it = ALL.find(x => x.href === h || (x.also || []).includes(h));
      if (it && !(onRec && h.startsWith('/recruitment'))) a.hidden = true;
    });
    page.querySelectorAll('.topbar .tb-mark').forEach(el => { el.hidden = true; });

    // Telefon: menyu tugmasi
    const top = page.querySelector('.topbar');
    const burger = document.createElement('button');
    burger.className = 'th-icon-btn th-burger';
    burger.setAttribute('aria-label', 'Menyu');
    burger.innerHTML = svg('menu');
    if (top) top.prepend(burger); else page.prepend(burger);
    const toggle = open => { side.classList.toggle('open', open); scrim.classList.toggle('on', open); };
    burger.onclick = () => toggle(true);
    scrim.onclick = () => toggle(false);

    side.querySelector('#thOut').onclick = () => {
      if (typeof logout === 'function') return logout();
      fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).finally(() => { location.href = '/'; });
    };

    // Telefonda jadval -> kartalar: har katakka ustun nomi (data-label).
    // Jadvallar innerHTML bilan qayta chiziladi — kuzatuvchi har safar yozadi.
    const labelTables = () => page.querySelectorAll('table').forEach(tb => {
      const heads = [...tb.querySelectorAll('thead th')].map(th => th.textContent.trim());
      if (!heads.length) return;
      tb.classList.add('th-stack');
      tb.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => {
        if (!td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i] || '');
      }));
    });
    let lt = 0;
    new MutationObserver(() => { cancelAnimationFrame(lt); lt = requestAnimationFrame(labelTables); })
      .observe(page, { childList: true, subtree: true });
    labelTables();

    fetch('/api/auth/me', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(u => {
      if (u && u.restaurantName) side.querySelector('#thWho').textContent = u.restaurantName;
    }).catch(() => {});
    refreshCounts();
  }

  function refreshCounts() {
    fetch('/api/agency/today', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      document.querySelectorAll('.th-side [data-n]').forEach(el => {
        const v = d[el.dataset.n] || 0;
        el.textContent = v > 999 ? '999+' : (v || '');
      });
    }).catch(() => {});
  }
  window.thShell = { refreshCounts };

  // Rezyume oynasi (th-resume) va rasm oynasi (th-viewer) — HAMMA panel
  // sahifasida: nomzod ismi qayerda bo'lsa ham data-resume bilan ochiladi
  [['thResume', '/js/th-resume.js?v=1'], ['thViewer', '/js/th-viewer.js?v=2']].forEach(([g, src]) => {
    if (window[g] || document.querySelector(`script[src^="${src.split('?')[0]}"]`)) return;
    const s = document.createElement('script'); s.src = src; s.defer = true; document.head.appendChild(s);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
