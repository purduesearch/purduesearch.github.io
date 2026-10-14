// One canvas and RAF for all task bursts. Positions/physics use CSS pixels and
// an exact fractional-frame integrator, independent of display refresh rate.
let canvas, context, raf = 0, lastTime = 0;
let particles = [];
const pages = new Set();
const colors = ['#19e3c3', '#ffb020', '#8f8cff', '#ff6a6f', '#5ee07a', '#ffffff'];

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function advanceParticle(p, dt) {
  const frames = dt / (1000 / 60);
  const drag = Math.pow(.97, frames);
  const distance = .97 * (1 - drag) / .03;
  const terminal = .28 / .03;
  p.x += p.vx * distance;
  p.y += (p.vy - terminal) * distance + terminal * frames;
  p.vx *= drag;
  p.vy = terminal + (p.vy - terminal) * drag;
  p.rotation += p.spin * frames;
  p.age += dt;
  return p;
}

function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  lastTime = 0;
  canvas?.removeAttribute('data-active');
}

function dispose() {
  stop();
  window.removeEventListener('resize', resize);
  canvas?.remove();
  canvas = context = null;
}

function tick(time) {
  const dt = lastTime ? Math.max(0, time - lastTime) : 0;
  lastTime = time;
  context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter(p => advanceParticle(p, dt).age < 1300);
  for (const p of particles) {
    context.save();
    context.globalAlpha = Math.min(1, (1300 - p.age) / 400);
    context.translate(p.x, p.y);
    context.rotate(p.rotation);
    context.fillStyle = p.color;
    if (p.circle) {
      context.beginPath();
      context.arc(0, 0, p.width / 2, 0, Math.PI * 2);
      context.fill();
    } else context.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
    context.restore();
  }
  if (particles.length) raf = requestAnimationFrame(tick);
  else { stop(); if (!pages.size) dispose(); }
}

function prepareCanvas() {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'pm-task-confetti';
    canvas.setAttribute('aria-hidden', 'true');
    context = canvas.getContext('2d');
    if (!context) { canvas = null; return false; }
    document.body.appendChild(canvas);
    resize();
    window.addEventListener('resize', resize);
  }
  return true;
}

// Warming the context at page mount keeps GPU/context setup out of T0. Idle
// pages retain one clear canvas, with no RAF; the last page releases it.
export function retainTaskConfetti(page) {
  pages.add(page);
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) prepareCanvas();
}

export function releaseTaskConfetti(page) {
  pages.delete(page);
  if (!pages.size && !particles.length && canvas) dispose();
}

export function taskBurst(owner, x, y, count = 48, palette = colors) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  if (!prepareCanvas()) return;
  canvas.setAttribute('data-active', 'true');
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 7;
    particles.push({ owner, x, y, vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3, rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - .5) * .4, width: 4 + Math.random() * 5,
      height: 3 + Math.random() * 4, color: (palette.length ? palette : colors)[i % (palette.length || colors.length)],
      age: 0, circle: Math.random() < .3 });
  }
  if (!raf) { lastTime = performance.now(); raf = requestAnimationFrame(tick); }
}

export function cancelTaskBursts(owner) {
  particles = particles.filter(p => p.owner !== owner);
  if (!particles.length && canvas) {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    stop();
    if (!pages.size) dispose();
  }
}
