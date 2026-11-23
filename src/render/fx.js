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
    this.impacts = [];
    this.punch = 0;
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
    this.kx = 0; // 맞은 방향으로 화면이 "덜컥" 밀렸다 돌아오는 양
    this.ky = 0;
    this.dimA = 0; // 강타 순간 배경이 잠깐 어두워져 빛이 도드라진다
    this.decals = []; // 바닥에 남는 자국
  }

  // 한 방향으로 덜컥 밀렸다가 돌아온다(무작위 흔들림과 달리 "어디서 맞았는지"가 느껴진다)
  kick(dx, dy) {
    if (!this.opts.shake) return;
    this.kx += dx;
    this.ky += dy;
  }

  dim(a = 0.35) {
    this.dimA = Math.max(this.dimA, this.opts.flash ? a : a * 0.3);
  }

  // 바닥 자국: scorch(그을음) crack(갈라짐) puddle(웅덩이) frost(서리)
  decal(x, y, opt = {}) {
    if (this.decals.length >= 14) this.decals.shift();
    const life = opt.life || 5;
    this.decals.push({ x, y, r: opt.r || 30, kind: opt.kind || 'scorch', color: opt.color || '#0a0510', life, max: life, rot: Math.random() * 6.28, seed: Math.random() * 1000 });
  }

  // 흔들림 단계: 1=약 2=중 3=강
  shake(level) {
    if (!this.opts.shake) return;
    const amp = [0, 4, 8, 14, 22][level] || 4;
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

  // 타격 순간의 십자 섬광
  impact(x, y, size = 40, color = '#ffffff') {
    this.impacts.push({ x, y, size, color, life: 0.14, max: 0.14, rot: Math.random() * 0.8 });
  }

  // 전장이 순간적으로 살짝 확대되는 "펀치"
  punchIn(v) {
    if (!this.opts.shake) return;
    this.punch = Math.max(this.punch, v);
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
      x, y, str, vy: opt.vy ?? -60, vx: opt.vx || 0, g: opt.g || 0, life: opt.life || 0.9, max: opt.life || 0.9,
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
    this.kx *= 0.8 ** (realDt * 60);
    this.ky *= 0.8 ** (realDt * 60);
    if (Math.abs(this.kx) < 0.05) this.kx = 0;
    if (Math.abs(this.ky) < 0.05) this.ky = 0;
    this.ox += this.kx;
    this.oy += this.ky;
    this.dimA = Math.max(0, this.dimA - realDt * 3.2);
    for (const d of this.decals) d.life -= dt;
    if (this.decals.length) this.decals = this.decals.filter((d) => d.life > 0);
    this.flashA = Math.max(0, this.flashA - realDt * 2.8);
    this.punch = Math.max(0, this.punch - realDt * 0.22 - this.punch * realDt * 9);
    for (const im of this.impacts) im.life -= realDt;
    this.impacts = this.impacts.filter((im) => im.life > 0);
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
      t.x += t.vx * dt;
      t.vy = t.vy * 0.92 ** (dt * 60) + t.g * dt;
      t.vx *= 0.94 ** (dt * 60);
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  // 적보다 아래에 깔리는 것: 순간 암전, 바닥 자국
  drawUnder(ctx, W, H) {
    if (this.dimA > 0) {
      ctx.fillStyle = `rgba(6,3,14,${this.dimA})`;
      ctx.fillRect(-60, -60, W + 120, H + 120);
    }
    for (const d of this.decals) {
      const k = d.life / d.max;
      const a = Math.min(1, k * 2.5) * Math.min(1, (1 - k) * 30);
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.scale(1, 0.42);
      ctx.globalAlpha = a;
      let s = d.seed;
      const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      if (d.kind === 'crack') {
        ctx.strokeStyle = 'rgba(8,4,14,0.8)';
        ctx.lineCap = 'round';
        for (let i = 0; i < 7; i++) {
          const an = d.rot + (i / 7) * 6.28 + rnd() * 0.5;
          const len = d.r * (0.55 + rnd() * 0.7);
          const bend = an + (rnd() - 0.5) * 0.9;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(Math.cos(an) * d.r * 0.12, Math.sin(an) * d.r * 0.12);
          ctx.lineTo(Math.cos(an) * len * 0.55, Math.sin(an) * len * 0.55);
          ctx.lineTo(Math.cos(an) * len * 0.55 + Math.cos(bend) * len * 0.45, Math.sin(an) * len * 0.55 + Math.sin(bend) * len * 0.45);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(8,4,14,0.55)';
        ctx.beginPath();
        ctx.arc(0, 0, d.r * 0.3, 0, 6.2832);
        ctx.fill();
      } else if (d.kind === 'frost') {
        ctx.fillStyle = 'rgba(214,243,255,0.3)';
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const an = (i / 16) * 6.2832;
          const rr = d.r * (i % 2 ? 0.62 : 1) * (0.85 + rnd() * 0.3);
          if (i) ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
          else ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      } else {
        // 그을음 / 웅덩이: 가운데가 진한 얼룩
        const gr = ctx.createRadialGradient(0, 0, d.r * 0.1, 0, 0, d.r);
        gr.addColorStop(0, d.color);
        gr.addColorStop(0.7, d.color);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a * (d.kind === 'puddle' ? 0.5 : 0.55);
        ctx.fillStyle = gr;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const an = (i / 12) * 6.2832;
          const rr = d.r * (0.8 + rnd() * 0.35);
          if (i) ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
          else ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
        }
        ctx.closePath();
        ctx.fill();
        if (d.kind === 'puddle') {
          ctx.globalAlpha = a * 0.5;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(-d.r * 0.25, -d.r * 0.2, d.r * 0.3, d.r * 0.12, -0.4, 0, 6.2832);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
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
    // 타격 섬광
    for (const im of this.impacts) {
      const k = im.life / im.max;
      ctx.save();
      ctx.translate(im.x, im.y);
      ctx.rotate(im.rot);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, k * 1.5);
      const s = im.size * (1.25 - k * 0.5);
      for (let i = 0; i < 2; i++) {
        ctx.rotate(Math.PI / 2 * i);
        ctx.fillStyle = i ? im.color : '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-s, 0);
        ctx.quadraticCurveTo(0, -s * 0.16, s, 0);
        ctx.quadraticCurveTo(0, s * 0.16, -s, 0);
        ctx.fill();
      }
      ctx.drawImage(glowSprite(im.color), -s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
      // 만화식 충격선
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, s * 0.045);
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + im.rot * 3;
        const r0 = s * (0.55 + (1 - k) * 0.5);
        const r1 = r0 + s * (0.25 + ((i * 7) % 5) * 0.06);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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
    this.impacts.length = 0;
    this.decals.length = 0;
    this.kx = this.ky = this.dimA = 0;
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
