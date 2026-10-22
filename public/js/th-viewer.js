// ── Rasmni to'liq ko'rish (iOS Photos uslubida) ──────────────
// Avatardagi rasmni bosganda — qora fonda to'liq ekran. Ikki marta
// bosish/teginish — kattalashtirish, surib ko'rish, ikki barmoq bilan
// kattalashtirish; pastga surish, ✕, Esc yoki Telegram "orqaga" — yopish.
//
// Kichik rasm (hh rezyumesidan ajratilgan) cheksiz cho'zilmaydi: ekranda
// ko'pi bilan asl o'lchamidan 2 baravar — aks holda xira/pikselli bo'lardi.
//
// Ulash: sahifaga shu faylni (defer bilan) qo'shish kifoya — rasmlarni o'zi
// ushlaydi: img[data-zoom] yoki src'da /photo yoki /logo bo'lgan rasm.
// (Izohda yopuvchi script tegini yozmang — ichki joylashtirilsa yopib qo'yadi.)
// Telegram BackButton zanjiri bo'lgan sahifa (miniapp.html) o'z
// onTgBack'ida thViewer.consumeBack() ni chaqiradi va
// window.thViewerHostBack = true qo'yadi.
(function () {
  let lastType = 'mouse', ov, img, open = false, scale = 1, tx = 0, ty = 0, baseW = 0, baseH = 0, maxScale = 1, onClose = null;
  const TG = window.Telegram && window.Telegram.WebApp;
  const ownBack = () => !window.thViewerHostBack && TG && TG.BackButton && TG.isVersionAtLeast && TG.isVersionAtLeast('6.1');

  function build() {
    ov = document.createElement('div');
    ov.className = 'thv';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Rasm');
    ov.innerHTML = '<button class="thv-x" aria-label="Yopish">&#10005;</button><img class="thv-img" alt="" draggable="false">';
    const st = document.createElement('style');
    st.textContent = `
      .thv{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.94);display:none;align-items:center;justify-content:center;
        touch-action:none;-webkit-user-select:none;user-select:none;opacity:0;transition:opacity .18s}
      .thv.on{display:flex}.thv.show{opacity:1}
      .thv-img{max-width:none;max-height:none;border-radius:4px;box-shadow:0 10px 40px rgba(0,0,0,.5);
        transform-origin:center center;transition:transform .22s cubic-bezier(.2,.8,.2,1);will-change:transform;cursor:zoom-in}
      .thv.zoomed .thv-img{cursor:grab}.thv.drag .thv-img{transition:none}
      .thv-x{position:absolute;top:calc(12px + env(safe-area-inset-top));right:12px;width:44px;height:44px;border-radius:22px;border:0;
        background:rgba(255,255,255,.14);color:#fff;font-size:18px;cursor:pointer;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}`;
    document.head.appendChild(st);
    document.body.appendChild(ov);
    img = ov.querySelector('.thv-img');
    ov.querySelector('.thv-x').onclick = close;
    ov.addEventListener('click', e => { if (e.target === ov && scale === 1) close(); });
    img.addEventListener('dblclick', e => { e.preventDefault(); if (lastType === 'mouse') toggleZoom(e.clientX, e.clientY); });   // teginishda o'zimizniki (pointerdown)
    gestures();
  }

  function fit() {
    const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
    const vw = window.innerWidth * 0.94, vh = window.innerHeight * 0.86;
    const k = Math.min(vw / nw, vh / nh, 2);        // ko'pi bilan 2x (kichik rasm xiralashmasin)
    baseW = Math.round(nw * k); baseH = Math.round(nh * k);
    img.style.width = baseW + 'px'; img.style.height = baseH + 'px';
    maxScale = Math.max(1, Math.min(4, (nw * 2) / baseW));   // kattalashtirishda ham 2x asl o'lchamdan oshmaydi
    reset();
  }
  function apply() {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    ov.classList.toggle('zoomed', scale > 1.01);
  }
  function clamp() {
    const mx = Math.max(0, (baseW * scale - window.innerWidth) / 2 + 20);
    const my = Math.max(0, (baseH * scale - window.innerHeight) / 2 + 20);
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
  }
  function reset() { scale = 1; tx = 0; ty = 0; apply(); }
  function toggleZoom(cx, cy) {
    if (scale > 1.01 || maxScale <= 1.01) return reset();
    const s = Math.min(maxScale, 2.5);
    // bosilgan nuqta atrofida kattalashtirish
    tx = (window.innerWidth / 2 - cx) * (s - 1); ty = (window.innerHeight / 2 - cy) * (s - 1);
    scale = s; clamp(); apply();
  }

  function gestures() {
    const pts = new Map();
    let start = null, lastTap = 0, swipeY = 0;
    ov.addEventListener('pointerdown', e => {
      if (e.target.closest('.thv-x')) return;
      lastType = e.pointerType || 'mouse';
      ov.setPointerCapture && ov.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        const now = Date.now();
        if (e.pointerType !== 'mouse' && now - lastTap < 300) { toggleZoom(e.clientX, e.clientY); lastTap = 0; return; }
        lastTap = now;
        start = { x: e.clientX, y: e.clientY, tx, ty, scale };
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        start = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale, tx, ty };
      }
      ov.classList.add('drag');
    });
    ov.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || !start) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && start.dist) {
        const [a, b] = [...pts.values()];
        scale = Math.max(1, Math.min(maxScale, start.scale * Math.hypot(a.x - b.x, a.y - b.y) / start.dist));
        clamp(); apply();
      } else if (pts.size === 1 && start.x != null) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (scale > 1.01) { tx = start.tx + dx; ty = start.ty + dy; clamp(); apply(); }
        else if (e.pointerType !== 'mouse') {             // pastga surib yopish
          swipeY = Math.max(0, dy);
          img.style.transform = `translate(0, ${swipeY}px) scale(${1 - Math.min(swipeY, 300) / 1200})`;
          ov.style.background = `rgba(0,0,0,${0.94 - Math.min(swipeY, 300) / 600})`;
        }
      }
    });
    const end = e => {
      pts.delete(e.pointerId);
      if (pts.size) return;
      ov.classList.remove('drag');
      if (scale <= 1.01 && swipeY > 110) { swipeY = 0; close(); return; }
      if (swipeY) { swipeY = 0; ov.style.background = ''; apply(); }
      start = null;
    };
    ov.addEventListener('pointerup', end);
    ov.addEventListener('pointercancel', end);
    ov.addEventListener('wheel', e => {                   // sichqoncha g'ildiragi — kattalashtirish (panel)
      e.preventDefault();
      scale = Math.max(1, Math.min(maxScale, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      if (scale <= 1.01) { tx = 0; ty = 0; }
      clamp(); apply();
    }, { passive: false });
  }

  const backHandler = () => close();
  function show(src, opts) {
    if (!ov) build();
    onClose = (opts && opts.onClose) || null;
    open = true;
    ov.style.background = '';
    img.onload = fit;
    img.src = src;
    if (img.complete && img.naturalWidth) fit();
    ov.classList.add('on');
    requestAnimationFrame(() => ov.classList.add('show'));
    document.addEventListener('keydown', onKey);
    try {
      if (TG && TG.HapticFeedback) TG.HapticFeedback.impactOccurred('light');
      if (TG && TG.BackButton && TG.isVersionAtLeast && TG.isVersionAtLeast('6.1')) {
        TG.BackButton.show();
        if (ownBack()) TG.BackButton.onClick(backHandler);
      }
    } catch (e) {}
  }
  function close() {
    if (!open) return;
    open = false;
    ov.classList.remove('show');
    setTimeout(() => { if (!open) { ov.classList.remove('on'); img.removeAttribute('src'); } }, 180);
    document.removeEventListener('keydown', onKey);
    try {
      if (ownBack()) { TG.BackButton.offClick(backHandler); TG.BackButton.hide(); }
      else if (typeof window.syncBack === 'function') window.syncBack();   // miniapp: zanjir o'z holatiga
    } catch (e) {}
    if (onClose) onClose();
  }
  const onKey = e => { if (e.key === 'Escape') close(); };

  // Sahifa rasmlarini ushlash: kartani ochish o'rniga rasm ko'rinadi (capture)
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('img[data-zoom], img[src*="/photo"], img[src*="/logo"]');
    if (!el || (ov && ov.contains(el)) || el.closest('[data-nozoom]')) return;
    if (!el.naturalWidth) return;                         // yuklanmagan yoki buzilgan rasm
    e.preventDefault(); e.stopPropagation();
    show(el.dataset.zoom || el.currentSrc || el.src);
  }, true);

  window.thViewer = { open: show, close, isOpen: () => open, consumeBack: () => (open ? (close(), true) : false) };
})();
