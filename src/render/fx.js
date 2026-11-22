// 이펙트: 파티클(풀링·개수 제한), 충격파, 번개, 떠오르는 글자, 화면 흔들림(전장 전용), 플래시

const MAX_PARTICLES = 420;

const glowCache = new Map();
export function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

export function drawGlow(ctx, x, y, r, color, alpha = 1) {
  if (r <= 0 || alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

export class FX {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.bolts = [];
    this.texts = [];
    this.slashes = [];
    this.shakeAmp = 0;
    this.shakeT = 0;
    this.shakeDur = 1;
    this.ox = 0;
    this.oy = 0;
    this.flashA = 0;
    this.flashColor = '#fff';
    this.vignette = 0;
    this.vignetteColor = '255,40,60';
    this.opts = { shake: true, flash: true };
    this.quality = 1;
  }

  // 흔들림 단계: 1=약 2=중 3=강
  shake(level) {
    if (!this.opts.shake) return;
    const amp = [0, 3, 6, 11, 16][level] || 3;
    if (amp >= this.shakeAmp * (this.shakeT / this.shakeDur)) {
      this.shakeAmp = amp;
      this.shakeDur = [0, 0.12, 0.2, 0.32, 0.45][level] || 0.15;
      this.shakeT = this.shakeDur;
    }
  }

  flash(color = '#fff', a = 0.35) {
    if (!this.opts.flash) a *= 0.25;
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, a);
  }

  hurt(a = 0.6) {
    this.vignette = Math.max(this.vignette, this.opts.flash ? a : a * 0.4);
  }

  particle(p) {
    if (this.parts.length >= MAX_PARTICLES * this.quality) this.parts.shift();
    this.parts.push({
      x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0.9, life: 0.6, max: 0.6, size: 4,
      color: '#fff', kind: 'dot', rot: 0, vr: 0, add: true, shrink: true, ...p,
    });
  }

  burst(x, y, opt) {
    const n = Math.round((opt.n || 12) * this.quality);
    for (let i = 0; i < n; i++) {
      const a = (opt.angle ?? 0) + (opt.spread ?? Math.PI * 2) * (Math.random() - 0.5) * (opt.spread ? 1 : 1);
      const ang = opt.spread ? a : Math.random() * Math.PI * 2;
      const sp = (opt.speed || 200) * (0.4 + Math.random() * 0.8);
      const life = (opt.life || 0.5) * (0.6 + Math.random() * 0.6);
      const cols = Array.isArray(opt.color) ? opt.color : [opt.color || '#fff'];
      this.particle({
        x: x + (Math.random() - 0.5) * (opt.jitter || 0),
        y: y + (Math.random() - 0.5) * (opt.jitter || 0),
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp + (opt.vy || 0),
        g: opt.g ?? 0, drag: opt.drag ?? 0.9, life, max: life,
        size: (opt.size || 4) * (0.6 + Math.random() * 0.8),
        color: cols[(Math.random() * cols.length) | 0],
        kind: opt.kind || 'dot', rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * (opt.vr ?? 10),
        add: opt.add ?? true, shrink: opt.shrink ?? true,
      });
    }
  }

  ring(x, y, opt) {
    this.rings.push({ x, y, r0: opt.r0 || 6, r1: opt.r1 || 60, life: opt.life || 0.35, max: opt.life || 0.35, color: opt.color || '#fff', w: opt.w || 4, sy: opt.sy || 1 });
  }

  bolt(x1, y1, x2, y2, opt = {}) {
    this.bolts.push({ x1, y1, x2, y2, life: opt.life || 0.22, max: opt.life || 0.22, color: opt.color || '#ffe45c', color2: opt.color2 || '#b77cff', w: opt.w || 3, seed: Math.random() * 1000, segs: opt.segs || 9 });
  }

  slash(x, y, opt = {}) {
    this.slashes.push({ x, y, ang: opt.ang ?? -0.6, len: opt.len || 70, life: opt.life || 0.22, max: opt.life || 0.22, color: opt.color || '#fff', w: opt.w || 7 });
  }

  text(x, y, str, opt = {}) {
    this.texts.push({
      x, y, str, vy: opt.vy ?? -60, life: opt.life || 0.9, max: opt.life || 0.9,
      color: opt.color || '#fff', size: opt.size || 26, stroke: opt.stroke || '#1a1024', pop: 0, font: opt.font || 'num', delay: opt.delay || 0,
    });
  }

  update(dt, realDt) {
    // 흔들림·플래시는 실제 시간 기준(히트스톱 중에도 감쇠)
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - realDt);
      const k = this.shakeT / this.shakeDur;
      const a = this.shakeAmp * k * k;
      this.ox = (Math.random() * 2 - 1) * a;
      this.oy = (Math.random() * 2 - 1) * a;
    } else {
      this.ox = this.oy = 0;
    }
    this.flashA = Math.max(0, this.flashA - realDt * 2.8);
    this.vignette = Math.max(0, this.vignette - realDt * 1.4);

    for (const p of this.parts) {
      p.life -= dt;
      p.vx *= p.drag ** (dt * 60);
      p.vy = p.vy * p.drag ** (dt * 60) + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);
    for (const s of this.slashes) s.life -= dt;
    this.slashes = this.slashes.filter((s) => s.life > 0);
    for (const t of this.texts) {
      if (t.delay > 0) { t.delay -= dt; continue; }
      t.life -= dt;
      t.pop = Math.min(1, t.pop + dt * 8);
      t.y += t.vy * dt;
      t.vy *= 0.92 ** (dt * 60);
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  drawWorld(ctx) {
    // 충격파
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) ** 3);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.w * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rad, rad * r.sy, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 베기 궤적
    for (const s of this.slashes) {
      const k = 1 - s.life / s.max;
      const a = 1 - k;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      ctx.globalCompositeOperation = 'lighter';
      const L = s.len * (0.6 + k * 0.6);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(-L, 0);
      ctx.quadraticCurveTo(0, -s.w * (1.4 - k), L, 0);
      ctx.quadraticCurveTo(0, s.w * 0.4, -L, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // 파티클
    for (const p of this.parts) {
      const k = p.life / p.max;
      const sz = p.shrink ? p.size * (0.3 + 0.7 * k) : p.size;
      if (p.add) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, k * 1.6);
      if (p.kind === 'glow') {
        ctx.drawImage(glowSprite(p.color), p.x - sz * 2, p.y - sz * 2, sz * 4, sz * 4);
      } else if (p.kind === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -sz * 1.6);
        ctx.lineTo(sz * 0.6, 0);
        ctx.lineTo(0, sz * 1.6);
        ctx.lineTo(-sz * 0.6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'paper') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) + 0.15);
        ctx.fillStyle = p.color;
        ctx.fillRect(-sz, -sz * 0.7, sz * 2, sz * 1.4);
        ctx.restore();
      } else if (p.kind === 'streak') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = sz * 0.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    // 번개
    for (const b of this.bolts) {
      const k = b.life / b.max;
      const pts = boltPoints(b, Math.floor((1 - k) * 4));
      ctx.globalCompositeOperation = 'lighter';
      for (const [w, col, a] of [[b.w * 4, b.color2, 0.35], [b.w * 1.8, b.color, 0.8], [b.w * 0.7, '#ffffff', 1]]) {
        ctx.globalAlpha = a * k;
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx, fonts) {
    for (const t of this.texts) {
      if (t.delay > 0) continue;
      const k = t.life / t.max;
      const s = t.size * (t.pop < 1 ? 0.6 + 0.7 * Math.sin(t.pop * Math.PI * 0.75) : 1);
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.font = `${Math.round(s)}px ${t.font === 'num' ? fonts.num : fonts.ui}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, s * 0.2);
      ctx.strokeStyle = t.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  drawScreen(ctx, W, H) {
    if (this.vignette > 0) {
      const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.75);
      g.addColorStop(0, `rgba(${this.vignetteColor},0)`);
      g.addColorStop(1, `rgba(${this.vignetteColor},${this.vignette * 0.55})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.flashA > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  clear() {
    this.parts.length = 0;
    this.rings.length = 0;
    this.bolts.length = 0;
    this.texts.length = 0;
    this.slashes.length = 0;
  }
}

function boltPoints(b, phase) {
  const pts = [];
  const dx = b.x2 - b.x1;
  const dy = b.y2 - b.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let s = b.seed + phase * 17;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280) - 0.5;
  for (let i = 0; i <= b.segs; i++) {
    const t = i / b.segs;
    const off = i === 0 || i === b.segs ? 0 : rnd() * Math.min(28, len * 0.18);
    pts.push([b.x1 + dx * t + nx * off, b.y1 + dy * t + ny * off]);
  }
  return pts;
}
