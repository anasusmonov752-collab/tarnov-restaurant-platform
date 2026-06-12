/* ═══════════════════════════════════════════════════
   Tarnov Platform — Creative Features
   ═══════════════════════════════════════════════════ */

// ─── 1. SLOT MACHINE SCORE ───────────────────────
function slotMachineScore(el, finalScore, doneCallback) {
  const TOTAL = 1800;
  const SLOT_PHASE = 0.65;
  const start = performance.now();
  let lastRandom = -1;

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / TOTAL, 1);

    if (progress < SLOT_PHASE) {
      const slotProgress = progress / SLOT_PHASE;
      const interval = Math.max(1, Math.round((1 - slotProgress) * 8));
      const frameNum = Math.floor(elapsed / (interval * 16));
      const prevFrameNum = Math.floor((elapsed - 16) / (interval * 16));
      if (frameNum !== prevFrameNum) {
        let r;
        do { r = Math.floor(Math.random() * 100); } while (r === lastRandom);
        lastRandom = r;
        el.textContent = r + '%';
        el.style.transform = `scaleY(${0.85 + Math.random() * 0.3})`;
        el.style.opacity = 0.4 + Math.random() * 0.6;
        el.style.filter = `blur(${(1 - slotProgress) * 1.5}px)`;
      }
    } else {
      const t = (progress - SLOT_PHASE) / (1 - SLOT_PHASE);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = Math.round(eased * finalScore) + '%';
      el.style.transform = 'scaleY(1)';
      el.style.opacity = 1;
      el.style.filter = 'none';
    }

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = finalScore + '%';
      el.style.transform = 'scaleY(1)';
      el.style.opacity = 1;
      el.style.filter = 'none';
      if (doneCallback) doneCallback();
    }
  }
  requestAnimationFrame(tick);
}

// ─── 2. LIQUID BACKGROUND ────────────────────────
function startLiquidBg() {
  stopLiquidBg();
  const isLavender = document.body.classList.contains('neon-mode-2');
  const wrap = document.createElement('div');
  wrap.id = 'neon-liquid-wrap';
  wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden';
  const blobs = isLavender ? [
    { color: 'rgba(200,85,255,0.08)',  size: '65vmax', top: '-20%',  left: '-10%',   anim: 'liquidFlow1 14s ease-in-out infinite' },
    { color: 'rgba(120,0,255,0.06)',   size: '55vmax', bottom: '-15%', right: '-10%', anim: 'liquidFlow2 18s ease-in-out infinite' },
    { color: 'rgba(180,50,255,0.05)',  size: '45vmax', top: '40%',   left: '35%',    anim: 'liquidFlow3 11s ease-in-out infinite' },
  ] : [
    { color: 'rgba(0,245,255,0.07)',   size: '65vmax', top: '-20%',  left: '-10%',   anim: 'liquidFlow1 14s ease-in-out infinite' },
    { color: 'rgba(160,0,255,0.05)',   size: '55vmax', bottom: '-15%', right: '-10%', anim: 'liquidFlow2 18s ease-in-out infinite' },
    { color: 'rgba(0,180,255,0.045)', size: '45vmax', top: '40%',   left: '35%',    anim: 'liquidFlow3 11s ease-in-out infinite' },
  ];
  blobs.forEach(b => {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;border-radius:50%;filter:blur(70px);
      background:radial-gradient(circle,${b.color} 0%,transparent 70%);
      width:${b.size};height:${b.size};
      ${b.top ? 'top:'+b.top+';' : ''}${b.bottom ? 'bottom:'+b.bottom+';' : ''}
      ${b.left ? 'left:'+b.left+';' : ''}${b.right ? 'right:'+b.right+';' : ''}
      animation:${b.anim};will-change:transform`;
    wrap.appendChild(el);
  });
  document.body.prepend(wrap);
}

function stopLiquidBg() {
  document.getElementById('neon-liquid-wrap')?.remove();
}

// ─── 3. TYPING EFFECT ────────────────────────────
function typeText(el, text, speed, onDone) {
  if (!el) return;
  speed = speed || 30;
  el.textContent = '';
  const cursor = document.createElement('span');
  cursor.className = 'typing-cursor';
  el.appendChild(cursor);
  let i = 0;
  function type() {
    if (i < text.length) {
      cursor.insertAdjacentText('beforebegin', text[i++]);
      setTimeout(type, speed + Math.random() * 18);
    } else {
      setTimeout(() => cursor.remove(), 500);
      if (onDone) onDone();
    }
  }
  setTimeout(type, 80);
}

// ─── 4. STREAK TRACKER ───────────────────────────
function getStreakData() {
  try { return JSON.parse(localStorage.getItem('tarnov_streak') || '{"last":"","count":0}'); }
  catch { return { last: '', count: 0 }; }
}

function updateStreak() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 864e5).toISOString().split('T')[0];
  const d = getStreakData();
  if (d.last === today) return d.count;
  d.count = (d.last === yesterday) ? d.count + 1 : 1;
  d.last = today;
  localStorage.setItem('tarnov_streak', JSON.stringify(d));
  return d.count;
}

function getCurrentStreak() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 864e5).toISOString().split('T')[0];
  const d = getStreakData();
  return (d.last === today || d.last === yesterday) ? d.count : 0;
}

function streakEmoji(n) {
  if (n >= 30) return '🔥🔥🔥';
  if (n >= 14) return '🔥🔥';
  return '🔥';
}

// ─── 5. CONFETTI ─────────────────────────────────
function launchConfetti() {
  let canvas = document.getElementById('confetti-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = ['#00D4FF','#FFD700','#00F5FF','#FF4DA6','#7FFF00','#FF6B35','#B8FF4A','#FF1E8E','#FFF700','#00FF88'];
  const particles = Array.from({ length: 220 }, () => ({
    x: Math.random() * canvas.width,
    y: -30 - Math.random() * 150,
    vx: (Math.random() - 0.5) * 9,
    vy: Math.random() * 4 + 1.5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    w: Math.random() * 12 + 5,
    h: Math.random() * 7 + 3,
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.22,
    gravity: 0.07 + Math.random() * 0.06,
    drag: 0.992
  }));

  let frame = 0;
  const FRAMES = 260;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fade = Math.max(0, 1 - Math.max(0, frame - 190) / 70);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += p.gravity; p.vx *= p.drag;
      p.rot += p.rotV;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (++frame < FRAMES) requestAnimationFrame(draw);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.remove(); }
  }
  requestAnimationFrame(draw);
}

// ─── 6. CURSOR TRAIL ─────────────────────────────
let _trailCanvas = null, _trailRAF = null, _trailPoints = [], _trailMouseHandler = null;

function startCursorTrail() {
  if (_trailCanvas) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'cursor-trail-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9990';
  document.body.appendChild(canvas);
  _trailCanvas = canvas;

  const ctx = canvas.getContext('2d');
  const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize);

  _trailMouseHandler = e => {
    _trailPoints.push({ x: e.clientX, y: e.clientY, t: Date.now() });
  };
  document.addEventListener('mousemove', _trailMouseHandler);

  const COLORS = ['#00F5FF', '#40FFFF', '#80FFFF', '#00CCDD'];

  function draw() {
    if (!_trailCanvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = Date.now();
    _trailPoints = _trailPoints.filter(p => now - p.t < 550);

    _trailPoints.forEach((p, i) => {
      const age = (now - p.t) / 550;
      const ratio = i / Math.max(_trailPoints.length, 1);
      const alpha = (1 - age) * ratio * 0.85;
      const size = (1 - age * 0.6) * (ratio * 5 + 1.5);
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[Math.floor(ratio * COLORS.length)];
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#00F5FF';
      ctx.fill();
      ctx.restore();
    });
    _trailRAF = requestAnimationFrame(draw);
  }
  draw();
}

function stopCursorTrail() {
  if (_trailMouseHandler) { document.removeEventListener('mousemove', _trailMouseHandler); _trailMouseHandler = null; }
  if (_trailRAF) { cancelAnimationFrame(_trailRAF); _trailRAF = null; }
  if (_trailCanvas) { _trailCanvas.remove(); _trailCanvas = null; }
  _trailPoints = [];
}

// ─── 7. ANIMATED COUNTER ─────────────────────────
function animateCounter(el, target, duration) {
  if (!el || typeof target !== 'number') return;
  duration = duration || 1200;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = Math.round(eased * target);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = target;
  }
  el.textContent = '0';
  requestAnimationFrame(tick);
}

function animateDashCounters() {
  document.querySelectorAll('.stat-value[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    if (!isNaN(target)) animateCounter(el, target);
  });
}

// ─── 8. RAINBOW AVATAR ───────────────────────────
function renderWaiterAvatar(name) {
  const letter = (name || '?')[0].toUpperCase();
  return `<span class="waiter-avatar-letter" title="${name}">${letter}</span>`;
}

