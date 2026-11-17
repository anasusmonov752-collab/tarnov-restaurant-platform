// ── Nomzod rezyumesi — HAR QANDAY panel oynasida (Anas, 2026-11-16) ──────
// "Har bir nomzodning rezyumesini ko'rsa bo'lishi kerak, istalgan oynada."
// Ilgari faqat Nomzodlar bazasida ochilardi — Arizalar, Taklif navbati va
// boshqalardan "Bazada ochish" orqali qidiruvga o'tish kerak edi.
//
// Ulash: sahifaga shu faylni (defer bilan) qo'shish va nomzod elementiga
// data-resume="<nomzod id>" qo'yish kifoya — bosilganda o'ngdan oyna
// (telefonda butun ekran). Qo'lda: thResume.open(id).
// Rasm th-viewer bilan kattalashadi (src'da /photo bor). Ma'lumot —
// GET /api/recruitment/:id (panel guard'i), asl fayl — /:id/file.
(function () {
  if (window.thResume) return;                         // ikki marta ulansa — bitta tinglovchi
  const ROLES = { ofitsiant: 'Ofitsiant', barmen: 'Barmen', xostess: 'Xostess', oshpaz: 'Oshpaz', kassir: 'Kassir',
    menejer: 'Menejer', operator: 'Call-markaz operatori' };
  const SRC = { hh: 'hh.uz', anketa: 'Anketa', upload: 'Yuklangan', manual: "Qo'lda" };
  const DUR = { m0_6: '6 oygacha', m6_12: '6 oy – 1 yil', y1_3: '1–3 yil', y3_5: '3–5 yil', y5p: '5+ yil' };
  // Anketa javoblarida takrorlanmaydigan savollar (yuqorida alohida ko'rsatiladi)
  const ANK_SKIP = /^(Ism va familiyangiz|Telefon raqamingiz|Rasmingiz|Rozilik|Qayerda ishlagansiz)/i;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let ov, box, curId = null, prevFocus = null;
  // Nomzodning Telegram chati: username bo'lsa — t.me/<username>, aks holda
  // raqam bo'yicha t.me/+998... (raqami Telegramda bo'lmasa Telegram o'zi aytadi)
  const TG_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>';
  function tgHref(c) {
    if (c.tgUsername) return 'https://t.me/' + String(c.tgUsername).replace(/^@/, '');
    let d = String(c.phone || '').replace(/\D/g, '');
    if (d.length === 9) d = '998' + d;
    return d.length >= 11 ? 'https://t.me/+' + d : '';
  }

  function build() {
    const st = document.createElement('style');
    st.textContent = `
      .thr{position:fixed;inset:0;z-index:9000;display:none;background:rgba(0,0,0,.32);opacity:0;transition:opacity .18s}
      .thr.on{display:block}.thr.show{opacity:1}
      .thr-p{position:absolute;top:0;right:0;bottom:0;width:min(560px,100%);background:var(--th-bg,#F2F2F7);color:var(--th-ink,#000);
        font-family:var(--th-font,system-ui);overflow-y:auto;-webkit-overflow-scrolling:touch;box-shadow:var(--th-shadow-2,0 10px 30px rgba(0,0,0,.1));
        transform:translateX(24px);transition:transform .22s cubic-bezier(.2,.8,.2,1)}
      .thr.show .thr-p{transform:none}
      .thr-bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:12px 16px;
        background:var(--th-glass,rgba(255,255,255,.72));-webkit-backdrop-filter:var(--th-blur);backdrop-filter:var(--th-blur);
        border-bottom:1px solid var(--th-line,rgba(60,60,67,.18))}
      .thr-bar b{flex:1;font-size:17px;font-weight:600}
      .thr-x{width:36px;height:36px;border-radius:18px;border:0;background:var(--th-fill);color:var(--th-ink);font-size:16px;cursor:pointer}
      .thr-in{padding:16px 16px 40px}
      .thr-hd{display:flex;gap:14px;align-items:flex-start}
      .thr-ph{flex:0 0 auto;width:96px;height:120px;border-radius:14px;overflow:hidden;background:var(--th-fill);display:flex;
        align-items:center;justify-content:center;font-size:28px;font-weight:600;color:var(--th-muted)}
      .thr-ph img{width:100%;height:100%;object-fit:cover;cursor:zoom-in;display:block}
      .thr-nm{font-size:21px;font-weight:var(--th-fw-b,700);line-height:1.25;word-break:break-word}
      .thr-sb{color:var(--th-muted);font-size:14px;margin-top:4px;line-height:1.4}
      .thr-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
      .thr-tag{font-size:12.5px;padding:4px 10px;border-radius:999px;background:var(--th-fill);color:var(--th-ink-2)}
      .thr-tag.ok{background:var(--th-ok-soft);color:var(--th-ok)}
      .thr-acts{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 4px}
      .thr-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:999px;border:0;font:inherit;font-size:15px;
        font-weight:600;text-decoration:none;cursor:pointer;background:var(--th-fill);color:var(--th-link)}
      .thr-btn.p{background:var(--th-brand);color:#fff}
      .thr-btn.tg{background:#229ED9;color:#fff}
      .thr-sec{margin-top:18px}
      .thr-h{font-size:13px;color:var(--th-muted);text-transform:uppercase;letter-spacing:.3px;margin:0 4px 6px}
      .thr-card{background:var(--th-surface,#fff);border-radius:14px;padding:4px 14px}
      .thr-row{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--th-line);font-size:15px;line-height:1.4}
      .thr-row:last-child{border-bottom:0}
      .thr-k{flex:0 0 38%;color:var(--th-muted)}
      .thr-v{flex:1;min-width:0;word-break:break-word}
      .thr-wh{padding:11px 0;border-bottom:1px solid var(--th-line)}
      .thr-wh:last-child{border-bottom:0}
      .thr-wp{font-weight:600;font-size:15px}
      .thr-wc{color:var(--th-muted);font-size:13.5px;margin-top:2px}
      .thr-wd{font-size:14px;margin-top:6px;line-height:1.5;white-space:pre-wrap;color:var(--th-ink-2)}
      .thr-txt{font-size:14px;line-height:1.55;white-space:pre-wrap;padding:12px 0;color:var(--th-ink-2)}
      .thr-raw summary{cursor:pointer;padding:12px 0;color:var(--th-link);font-size:15px}
      .thr-msg{padding:40px 0;text-align:center;color:var(--th-muted)}
      [data-resume]{cursor:pointer}
      @media (max-width:600px){ .thr-p{width:100%} }`;
    document.head.appendChild(st);
    ov = document.createElement('div');
    ov.className = 'thr';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Rezyume');
    ov.innerHTML = '<div class="thr-p"><div class="thr-bar"><b>Rezyume</b><button class="thr-x" aria-label="Yopish">&#10005;</button></div><div class="thr-in"></div></div>';
    document.body.appendChild(ov);
    box = ov.querySelector('.thr-in');
    ov.querySelector('.thr-x').onclick = close;
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', e => {
      // Rasm oynasi ochiq bo'lsa Esc avval uni yopadi
      if (e.key === 'Escape' && curId && !document.querySelector('.thv.on')) close();
    });
  }

  const row = (k, v) => v ? `<div class="thr-row"><div class="thr-k">${esc(k)}</div><div class="thr-v">${v}</div></div>` : '';
  const sec = (h, body) => body ? `<div class="thr-sec"><div class="thr-h">${esc(h)}</div><div class="thr-card">${body}</div></div>` : '';
  const date = d => d ? new Date(d).toLocaleDateString('ru-RU') : '';
  const hasAge = n => /\d+\s*(год|года|лет|yosh)/i.test(n || '');

  // Anketa nomzodi: rawText — "Savol: javob" qatorlari (survey.toFields)
  function answers(c) {
    return String(c.rawText || '').split('\n').map(l => {
      const k = l.indexOf(': ');
      return k > 0 ? [l.slice(0, k).trim().replace(/\?$/, ''), l.slice(k + 2).trim()] : null;
    }).filter(x => x && x[1] && !ANK_SKIP.test(x[0]))
      .map(([q, a]) => [q, /^\d{4}-\d{2}-\d{2}$/.test(a) ? a.split('-').reverse().join('.') : a]);
  }

  function render(c) {
    const ank = c.source === 'anketa';
    const role = c.desiredPosition || ROLES[c.role] || '';
    const tel = c.phone ? String(c.phone).replace(/[^\d+]/g, '') : '';
    const ph = c.hasPhoto
      ? `<img src="/api/recruitment/${encodeURIComponent(c.id)}/photo?v=${encodeURIComponent(c.photoAt || c.updatedAt || '')}" alt="" data-zoom>`
      : esc((c.fullName || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase());
    const exp = c.experienceYears ? c.experienceYears + ' yil tajriba'
      : c.experienceMonths ? c.experienceMonths + ' oy tajriba' : 'Tajribasiz';
    const wh = (c.workHistory || []).map(w => `<div class="thr-wh">
        <div class="thr-wp">${esc(w.position || '—')}</div>
        <div class="thr-wc">${esc([w.company, DUR[w.period] || w.period].filter(Boolean).join(' · '))}</div>
        ${w.description ? `<div class="thr-wd">${esc(w.description)}</div>` : ''}
      </div>`).join('');
    const ans = ank ? answers(c) : [];
    const list = a => (a || []).filter(Boolean).map(esc).join(', ');

    box.innerHTML = `
      <div class="thr-hd">
        <div class="thr-ph">${ph}</div>
        <div style="min-width:0;flex:1">
          <div class="thr-nm">${esc(c.fullName || 'Nomsiz')}${c.age && !hasAge(c.fullName) ? `, ${c.age} yosh` : ''}</div>
          <div class="thr-sb">${esc([role, exp, c.location].filter(Boolean).join(' · '))}</div>
          <div class="thr-tags">
            <span class="thr-tag">${esc(SRC[c.source] || c.source || '')}</span>
            ${c.salaryExpectation ? `<span class="thr-tag">${esc(c.salaryExpectation)}</span>` : ''}
            ${c.phoneVerifiedAt ? '<span class="thr-tag ok">Telefon tasdiqlangan</span>' : ''}
            ${c.tgState === 'linked' ? '<span class="thr-tag ok">Telegramda</span>' : ''}
            ${c.publicCode ? `<span class="thr-tag">${esc(c.publicCode)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="thr-acts">
        ${tel ? `<a class="thr-btn p" href="tel:${esc(tel)}">Qo'ng'iroq</a>` : ''}
        ${tgHref(c) ? `<a class="thr-btn tg" href="${esc(tgHref(c))}" target="_blank" rel="noopener">${TG_SVG} Telegram</a>` : ''}
        ${c.hasFile ? `<a class="thr-btn" href="/api/recruitment/${encodeURIComponent(c.id)}/file" target="_blank" rel="noopener">Asl rezyume (PDF)</a>` : ''}
        ${c.hhUrl ? `<a class="thr-btn" href="${esc(c.hhUrl)}" target="_blank" rel="noopener">hh.uz'da ochish</a>` : ''}
        <a class="thr-btn" href="/recruitment.html?${ank ? 'src=anketa&' : ''}q=${encodeURIComponent(c.publicCode || c.fullName || '')}">Bazada ochish</a>
      </div>
      ${sec('Kontaktlar', row('Telefon', tel ? `<a href="tel:${esc(tel)}" style="color:var(--th-link)">${esc(c.phone)}</a>` : '')
        + row('Telegram', c.tgUsername ? '@' + esc(c.tgUsername) : '') + row('Email', esc(c.email || '')))}
      ${c.summary ? sec(ank ? "O'zi haqida" : 'Qisqacha', `<div class="thr-txt">${esc(c.summary)}</div>`) : ''}
      ${sec('Ish tajribasi', wh || (c.experienceSummary ? `<div class="thr-txt">${esc(c.experienceSummary)}</div>` : ''))}
      ${sec("Ma'lumot", row('Lavozim', esc(role)) + row('Kutilgan maosh', esc(c.salaryExpectation || ''))
        + row("Ta'lim", esc(c.education || '')) + row('Tillar', list(c.languages)) + row("Ko'nikmalar", list(c.skills))
        + row('Ishga chiqa oladi', date(c.availableFrom)) + row("Qo'shildi", date(c.createdAt)))}
      ${ans.length ? sec('Anketa javoblari', ans.map(([q, a]) => row(q, esc(a))).join('')) : ''}
      ${(c.extraAnswers || []).length ? sec("Qo'shimcha savollar", c.extraAnswers.map(x => row(x.q, esc(x.a))).join('')) : ''}
      ${!ank && c.rawText && !c.hasFile ? sec('Rezyume matni', `<details class="thr-raw"><summary>To'liq matnni ko'rsatish</summary><div class="thr-txt">${esc(c.rawText)}</div></details>`) : ''}`;
  }

  async function open(id) {
    if (!id) return;
    if (!ov) build();
    curId = id;
    prevFocus = document.activeElement;
    box.innerHTML = '<div class="thr-msg">Yuklanmoqda…</div>';
    ov.querySelector('.thr-p').scrollTop = 0;
    ov.classList.add('on');
    requestAnimationFrame(() => ov.classList.add('show'));
    try {
      const r = await fetch('/api/recruitment/' + encodeURIComponent(id), { credentials: 'same-origin' });
      const c = await r.json().catch(() => ({}));
      if (curId !== id) return;                          // boshqasi ochildi
      if (!r.ok) throw new Error(c.error || 'Rezyume ochilmadi');
      render(c);
    } catch (e) {
      if (curId === id) box.innerHTML = `<div class="thr-msg">${esc(e.message || 'Rezyume ochilmadi')}</div>`;
    }
  }
  function close() {
    if (!ov) return;
    curId = null;
    ov.classList.remove('show');
    setTimeout(() => { if (!curId) ov.classList.remove('on'); }, 180);
    if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (_) {}
  }

  // data-resume — istalgan sahifada. Rasm (th-viewer) o'z bosishini o'zi oladi.
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-resume]');
    if (!el || e.target.closest('a[href]:not([data-resume]), button:not([data-resume])')) return;
    e.preventDefault();
    open(el.getAttribute('data-resume'));
  });

  window.thResume = { open, close, tgHref, TG_SVG };
})();
