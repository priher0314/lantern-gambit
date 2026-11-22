// 화면 그리기: 배경(미리 렌더), 전장, 캐릭터, 슬롯 사당, HUD, 버튼
import { ROWS, LANES, FRONT, SYMBOLS, SHOT_NAMES, ENEMIES } from '../core/data.js';
import { W, cellPos, laneEdges, reelRect, rowScale, LANE_SPACING } from './layout.js';
import { drawKasa, drawMask, drawArcher, drawElder, drawPlayer, drawSymbol, drawIcon, INK, mix } from './art.js';
import { drawGlow } from './fx.js';

export const FONTS = {
  ui: '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  num: '"Black Han Sans", "Jua", "Malgun Gothic", sans-serif',
};
const TAU = Math.PI * 2;
export const REEL_CELL = 76;

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.bg = null;
  }

  resize(L, scale) {
    this.L = L;
    this.sc = scale;
    this.cv.width = Math.round(W * scale);
    this.cv.height = Math.round(L.H * scale);
    this.bg = this.buildBackground(L, scale);
  }

  // ─────────────── 정적 배경 ───────────────
  buildBackground(L, sc) {
    const c = document.createElement('canvas');
    c.width = Math.round(W * sc);
    c.height = Math.round(L.H * sc);
    const g = c.getContext('2d');
    g.scale(sc, sc);
    const rnd = seeded(1234);
    const H = L.H;
    const horizon = L.fieldTop + 8;

    // 하늘
    const sky = g.createLinearGradient(0, 0, 0, horizon + 40);
    sky.addColorStop(0, '#060b1e');
    sky.addColorStop(0.55, '#121f48');
    sky.addColorStop(1, '#3a2448');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // 별
    for (let i = 0; i < 90; i++) {
      const x = rnd() * W;
      const y = rnd() * (horizon - 10);
      g.globalAlpha = 0.25 + rnd() * 0.6;
      g.fillStyle = rnd() < 0.2 ? '#ffe6b0' : '#cfe0ff';
      g.beginPath();
      g.arc(x, y, rnd() * 1.3 + 0.3, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    // 달
    const mx = 418, my = Math.max(L.hudH + 34, horizon - 70);
    drawGlow(g, mx, my, 130, '#6f7fc8', 0.35);
    drawGlow(g, mx, my, 70, '#fff2d6', 0.5);
    g.fillStyle = '#fbf1da';
    g.beginPath();
    g.arc(mx, my, 34, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(200,180,150,0.35)';
    for (const [dx, dy, r] of [[-10, -6, 7], [9, 8, 5], [6, -12, 4], [-4, 14, 3]]) {
      g.beginPath();
      g.arc(mx + dx, my + dy, r, 0, TAU);
      g.fill();
    }
    // 먼 장터 지붕 실루엣
    const roofBase = horizon + 4;
    g.fillStyle = '#1b1434';
    let x = -10;
    while (x < W + 20) {
      const w = 40 + rnd() * 50;
      const h = 18 + rnd() * 36;
      g.beginPath();
      g.moveTo(x, roofBase);
      g.lineTo(x, roofBase - h);
      g.quadraticCurveTo(x - 8, roofBase - h - 4, x - 12, roofBase - h - 10);
      g.quadraticCurveTo(x + w * 0.5, roofBase - h - 2, x + w + 12, roofBase - h - 10);
      g.quadraticCurveTo(x + w + 8, roofBase - h - 4, x + w, roofBase - h);
      g.lineTo(x + w, roofBase);
      g.closePath();
      g.fill();
      for (let i = 0; i < 3; i++) {
        if (rnd() < 0.6) {
          g.fillStyle = `rgba(255,${150 + rnd() * 60},70,${0.35 + rnd() * 0.4})`;
          g.fillRect(x + 6 + rnd() * (w - 14), roofBase - h + 8 + rnd() * (h - 14), 4, 5);
          g.fillStyle = '#1b1434';
        }
      }
      x += w + 6;
    }
    // 등 줄(하늘을 가로지름)
    for (const [y0, sag, n] of [[L.hudH + 8, 40, 11], [L.hudH + 46, 26, 9]]) {
      if (y0 > horizon - 20) continue;
      g.strokeStyle = 'rgba(30,18,30,0.9)';
      g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        const yy = y0 + Math.sin(u * Math.PI) * sag;
        i ? g.lineTo(u * W, yy) : g.moveTo(0, yy);
      }
      g.stroke();
      for (let i = 1; i < n; i++) {
        const u = i / n;
        const lx = u * W;
        const ly = y0 + Math.sin(u * Math.PI) * sag + 8;
        const col = i % 3 === 0 ? '#ffcf6e' : i % 2 ? '#ff6a4a' : '#ff9a3d';
        drawGlow(g, lx, ly, 22, col, 0.45);
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(lx, ly, 6, 8, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#2a1620';
        g.fillRect(lx - 4, ly - 9, 8, 2);
        g.fillRect(lx - 4, ly + 7, 8, 2);
      }
    }
    // 강물(다리 양옆)
    const river = g.createLinearGradient(0, horizon, 0, L.fieldBottom + 60);
    river.addColorStop(0, '#1a2244');
    river.addColorStop(1, '#070d1c');
    g.fillStyle = river;
    g.fillRect(0, horizon, W, L.fieldBottom + 80 - horizon);
    // 물빛 반사
    for (let i = 0; i < 46; i++) {
      const y = horizon + 10 + rnd() * (L.fieldH + 40);
      const xx = rnd() < 0.5 ? rnd() * 70 : W - rnd() * 70;
      g.strokeStyle = `rgba(255,${150 + rnd() * 80},90,${0.08 + rnd() * 0.18})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(xx - 8 - rnd() * 10, y);
      g.lineTo(xx + 8 + rnd() * 10, y);
      g.stroke();
    }

    // 다리 바닥(바깥 틀)
    const top = L.fieldTop - 4;
    const bot = L.fieldBottom + 18;
    const [l0] = laneEdges(L, 0, top);
    const [, r0] = laneEdges(L, 2, top);
    const [l1] = laneEdges(L, 0, bot);
    const [, r1] = laneEdges(L, 2, bot);
    g.fillStyle = '#1d1218';
    g.beginPath();
    g.moveTo(l0 - 10, top);
    g.lineTo(r0 + 10, top);
    g.lineTo(r1 + 16, bot);
    g.lineTo(l1 - 16, bot);
    g.closePath();
    g.fill();
    // 레인 판자
    for (let lane = 0; lane < LANES; lane++) {
      const [a0, b0] = laneEdges(L, lane, top);
      const [a1, b1] = laneEdges(L, lane, bot);
      g.save();
      g.beginPath();
      g.moveTo(a0 + 3, top);
      g.lineTo(b0 - 3, top);
      g.lineTo(b1 - 4, bot);
      g.lineTo(a1 + 4, bot);
      g.closePath();
      g.clip();
      const wood = g.createLinearGradient(0, top, 0, bot);
      wood.addColorStop(0, '#3a2830');
      wood.addColorStop(0.5, '#5b3c33');
      wood.addColorStop(1, '#6d4836');
      g.fillStyle = wood;
      g.fillRect(0, top, W, bot - top);
      // 판자 이음새
      const planks = ROWS * 3;
      for (let i = 0; i <= planks; i++) {
        const y = top + ((bot - top) * i) / planks;
        g.fillStyle = 'rgba(20,10,14,0.55)';
        g.fillRect(0, y, W, 1.4);
        g.fillStyle = `rgba(255,220,180,${0.03 + rnd() * 0.04})`;
        g.fillRect(0, y + 1.5, W, 2);
        // 옹이
        if (rnd() < 0.35) {
          const kx = a0 + rnd() * (b1 - a1);
          g.fillStyle = 'rgba(30,15,15,0.35)';
          g.beginPath();
          g.ellipse(kx, y + 6, 4, 1.6, 0, 0, TAU);
          g.fill();
        }
      }
      // 칸 경계(살짝 진하게)
      for (let r = 1; r < ROWS; r++) {
        const y = L.fieldTop + r * L.ch;
        g.fillStyle = 'rgba(15,6,12,0.5)';
        g.fillRect(0, y - 1, W, 2.5);
      }
      // 중앙 은은한 빛
      const lg = g.createLinearGradient(a1, 0, b1, 0);
      lg.addColorStop(0, 'rgba(0,0,0,0.25)');
      lg.addColorStop(0.5, 'rgba(255,200,140,0.06)');
      lg.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = lg;
      g.fillRect(0, top, W, bot - top);
      g.restore();
    }
    // 먼 쪽 안개
    const fog = g.createLinearGradient(0, top - 10, 0, top + L.fieldH * 0.35);
    fog.addColorStop(0, 'rgba(90,80,140,0.75)');
    fog.addColorStop(1, 'rgba(90,80,140,0)');
    g.fillStyle = fog;
    g.fillRect(0, top - 10, W, L.fieldH * 0.35 + 10);
    // 난간 기둥 + 작은 등
    for (const side of [0, 1]) {
      for (let r = 0; r <= ROWS; r++) {
        const y = L.fieldTop + r * L.ch;
        const s = rowScale(L, r - 0.5);
        const edge = side ? laneEdges(L, 2, y)[1] + 8 * s : laneEdges(L, 0, y)[0] - 8 * s;
        const ph = 30 * s;
        g.fillStyle = '#2a1820';
        g.fillRect(edge - 4 * s, y - ph, 8 * s, ph + 4);
        g.fillStyle = '#d8a548';
        g.fillRect(edge - 5 * s, y - ph - 3 * s, 10 * s, 3 * s);
        if (r % 2 === 1) {
          drawGlow(g, edge, y - ph - 8 * s, 26 * s, '#ffa040', 0.6);
          g.fillStyle = '#ffcf6e';
          g.beginPath();
          g.ellipse(edge, y - ph - 9 * s, 5 * s, 6.5 * s, 0, 0, TAU);
          g.fill();
        }
      }
      // 난간 가로대
      g.strokeStyle = '#3a2228';
      g.lineWidth = 3;
      g.beginPath();
      for (let r = 0; r <= ROWS; r++) {
        const y = L.fieldTop + r * L.ch;
        const s = rowScale(L, r - 0.5);
        const edge = side ? laneEdges(L, 2, y)[1] + 8 * s : laneEdges(L, 0, y)[0] - 8 * s;
        r ? g.lineTo(edge, y - 22 * s) : g.moveTo(edge, y - 22 * s);
      }
      g.stroke();
    }
    // 레인 번호(바닥에 새겨진 숫자)
    for (let lane = 0; lane < LANES; lane++) {
      const y = L.fieldBottom + 9;
      const x0 = L.cx + (lane - 1) * LANE_SPACING;
      g.font = `15px ${FONTS.num}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,220,160,0.22)';
      g.fillText(String(lane + 1), x0, y);
    }
    // 결계선(금줄)
    const gy = L.fieldBottom + 18;
    g.lineWidth = 5;
    g.strokeStyle = '#7a5a2a';
    g.beginPath();
    g.moveTo(10, gy);
    g.quadraticCurveTo(W / 2, gy + 10, W - 10, gy);
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = '#e8c070';
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      for (let k = 0; k <= 60; k++) {
        const u = k / 60;
        const xx = 10 + u * (W - 20);
        const yy = gy + Math.sin(u * Math.PI) * 10 * 0.5 * 2 / 2 + Math.sin(u * 90 + i * Math.PI) * 2;
        k ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
      }
      g.stroke();
    }
    for (let i = 1; i < 18; i++) {
      const u = i / 18;
      const xx = 10 + u * (W - 20);
      const yy = gy + Math.sin(u * Math.PI) * 5;
      g.fillStyle = i % 3 === 0 ? '#e2453c' : '#f3e6c8';
      g.beginPath();
      g.moveTo(xx - 3, yy);
      g.lineTo(xx + 3, yy);
      g.lineTo(xx + 4, yy + 12);
      g.lineTo(xx - 2, yy + 13);
      g.closePath();
      g.fill();
    }
    // 등지기 발판(돌 단)
    const py = L.playerY;
    g.fillStyle = '#231a2e';
    g.beginPath();
    g.ellipse(L.cx, py + 2, 230, 28, 0, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(216,165,72,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(L.cx, py + 2, 220, 24, 0, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(216,165,72,0.18)';
    g.beginPath();
    g.ellipse(L.cx, py + 2, 150, 15, 0, 0, TAU);
    g.stroke();

    // 하단 UI 판(옻칠)
    const panelTop = L.info.y;
    const pg = g.createLinearGradient(0, panelTop, 0, H);
    pg.addColorStop(0, '#1d0f1c');
    pg.addColorStop(1, '#0d0710');
    g.fillStyle = pg;
    g.fillRect(0, panelTop, W, H - panelTop);
    g.fillStyle = '#d8a548';
    g.fillRect(0, panelTop, W, 2);
    g.fillStyle = 'rgba(216,165,72,0.25)';
    g.fillRect(0, panelTop + 4, W, 1);
    // 점괘 사당(슬롯 틀)
    this.drawShrineFrame(g, L);
    // HUD 띠
    const hg = g.createLinearGradient(0, 0, 0, L.hudH);
    hg.addColorStop(0, 'rgba(8,4,14,0.92)');
    hg.addColorStop(1, 'rgba(8,4,14,0.55)');
    g.fillStyle = hg;
    g.fillRect(0, 0, W, L.hudH);
    g.fillStyle = 'rgba(216,165,72,0.55)';
    g.fillRect(0, L.hudH - 1, W, 1);
    return c;
  }

  drawShrineFrame(g, L) {
    const r0 = reelRect(L, 0);
    const r2 = reelRect(L, 2);
    const x = r0.x - 20;
    const w = r2.x + r2.w + 20 - x;
    const y = L.slot.y + 6;
    const h = L.slot.h - 6;
    // 몸체
    const body = g.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, '#4a1a22');
    body.addColorStop(1, '#260c14');
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(x, y + 10, w, h - 16, 10);
    g.fill();
    g.strokeStyle = '#d8a548';
    g.lineWidth = 2.5;
    g.stroke();
    // 지붕
    g.fillStyle = '#1a0c14';
    g.beginPath();
    g.moveTo(x - 18, y + 16);
    g.quadraticCurveTo(x + 10, y + 6, x + 30, y - 2);
    g.lineTo(x + w - 30, y - 2);
    g.quadraticCurveTo(x + w - 10, y + 6, x + w + 18, y + 16);
    g.lineTo(x + w, y + 18);
    g.lineTo(x, y + 18);
    g.closePath();
    g.fill();
    g.strokeStyle = '#d8a548';
    g.lineWidth = 2;
    g.stroke();
    // 지붕 장식 술
    for (const sx of [x - 12, x + w + 12]) {
      g.strokeStyle = '#e2453c';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sx, y + 16);
      g.lineTo(sx, y + 40);
      g.stroke();
      g.fillStyle = '#d8a548';
      g.beginPath();
      g.arc(sx, y + 18, 3.5, 0, TAU);
      g.fill();
    }
    // 금장 못
    g.fillStyle = '#d8a548';
    for (let i = 0; i < 12; i++) {
      const xx = x + 14 + ((w - 28) * i) / 11;
      g.beginPath();
      g.arc(xx, y + h - 12, 2.2, 0, TAU);
      g.fill();
    }
    // 창 뒤 홈
    for (let i = 0; i < 3; i++) {
      const r = reelRect(L, i);
      g.fillStyle = '#0c0508';
      g.beginPath();
      g.roundRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10, 10);
      g.fill();
    }
  }

  // ─────────────── 프레임 ───────────────
  draw(g) {
    const ctx = this.ctx;
    const L = this.L;
    ctx.setTransform(this.sc, 0, 0, this.sc, 0, 0);
    ctx.drawImage(this.bg, 0, 0, W, L.H);
    this.drawAmbient(g);
    const fx = g.fx;

    ctx.save();
    ctx.translate(fx.ox, fx.oy);
    {
      this.drawLaneOverlays(g);
      this.drawGhosts(g);
      const list = [...g.views.values()].sort((a, b) => a.row - b.row);
      for (const v of list) this.drawEnemy(g, v);
      this.drawPlayerChar(g);
      this.drawProjectiles(g);
      fx.drawWorld(ctx);
      if (g.mode === 'battle') {
        for (const v of list) this.drawStatus(g, v);
        this.drawPreviewMarks(g);
      }
      fx.drawTexts(ctx, FONTS);
    }
    ctx.restore();

    if (g.mode === 'battle') {
      this.drawReactRing(g);
      this.drawHud(g);
      this.drawInfo(g);
      this.drawSlot(g);
      this.drawButtons(g);
      this.drawCounterPrompt(g);
      this.drawBanner(g);
    } else {
      this.drawSlot(g);
    }
    fx.drawScreen(ctx, W, L.H);
  }

  drawAmbient(g) {
    const ctx = this.ctx;
    const L = this.L;
    const t = g.rt;
    // 반딧불 / 떠다니는 불씨
    for (let i = 0; i < 22; i++) {
      const sx = (i * 97.3) % W;
      const sp = 8 + (i % 5) * 4;
      const y = L.fieldBottom + 30 - ((t * sp + i * 53) % (L.fieldH + 120));
      const x = sx + Math.sin(t * 0.7 + i) * 16;
      const a = 0.35 + Math.sin(t * 2 + i * 1.7) * 0.25;
      drawGlow(ctx, x, y, 7, i % 4 ? '#ffb347' : '#9fe8ff', Math.max(0, a));
    }
  }

  drawLaneOverlays(g) {
    const ctx = this.ctx;
    const L = this.L;
    const top = L.fieldTop;
    const bot = L.fieldBottom + 14;
    const lanePoly = (lane, y0 = top, y1 = bot) => {
      const [a0, b0] = laneEdges(L, lane, y0);
      const [a1, b1] = laneEdges(L, lane, y1);
      ctx.beginPath();
      ctx.moveTo(a0 + 4, y0);
      ctx.lineTo(b0 - 4, y0);
      ctx.lineTo(b1 - 4, y1);
      ctx.lineTo(a1 + 4, y1);
      ctx.closePath();
    };
    const t = g.rt;
    // 위협 예고: 레인 앞 경고
    for (const d of g.dangers || []) {
      const col = d.style === 'heavy' ? '255,59,78' : d.style === 'ranged' || d.style === 'volley' ? '255,140,40' : '255,204,51';
      const pulse = 0.5 + Math.sin(t * 6) * 0.25;
      const y0 = d.style === 'ranged' || d.style === 'volley' ? top + (d.row + 0.5) * L.ch : L.fieldBottom - L.ch * 1.6;
      ctx.save();
      lanePoly(d.lane, y0, bot);
      const gr = ctx.createLinearGradient(0, y0, 0, bot);
      gr.addColorStop(0, `rgba(${col},0)`);
      gr.addColorStop(1, `rgba(${col},${0.22 * pulse + 0.08})`);
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.restore();
      // 쉐브론
      const cx = L.cx + (d.lane - 1) * LANE_SPACING;
      for (let i = 0; i < 2; i++) {
        const yy = L.fieldBottom + 2 + i * 7 + ((t * 20) % 7);
        ctx.strokeStyle = `rgba(${col},${0.9 - i * 0.35})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(cx - 14, yy - 6);
        ctx.lineTo(cx, yy + 2);
        ctx.lineTo(cx + 14, yy - 6);
        ctx.stroke();
      }
      if (d.style === 'ranged' || d.style === 'volley') {
        ctx.setLineDash([8, 8]);
        ctx.lineDashOffset = -t * 40;
        ctx.strokeStyle = `rgba(${col},0.7)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, y0);
        ctx.lineTo(cx, L.playerY - 40);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // 공격 미리보기 레인
    const pv = g.ui.preview;
    if (pv) {
      const col = SYMBOLS[pv.symbol]?.fx || '#fff';
      const lanes = pv.global ? [0, 1, 2] : pv.lanes || [pv.lane];
      for (const ln of lanes) {
        lanePoly(ln);
        ctx.fillStyle = mix(col.length === 7 ? col : '#ffffff', '#000000', 0) .replace('rgb', 'rgba').replace(')', `,${ln === pv.lane ? 0.16 : 0.08})`);
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.globalAlpha = ln === pv.lane ? 0.7 : 0.35;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // 범위 칸
      for (const [l, r] of pv.cells || []) {
        const p = cellPos(L, l, r);
        ctx.fillStyle = 'rgba(79,240,196,0.18)';
        ctx.strokeStyle = 'rgba(79,240,196,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 4, 50 * p.s, 15 * p.s, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    }
    // 되치기 레인 선택
    if (g.ui.counter) {
      for (let ln = 0; ln < 3; ln++) {
        lanePoly(ln);
        const on = g.ui.counter.hover === ln;
        ctx.fillStyle = on ? 'rgba(255,216,74,0.24)' : 'rgba(255,216,74,0.07)';
        ctx.fill();
        ctx.strokeStyle = on ? '#ffd84a' : 'rgba(255,216,74,0.4)';
        ctx.lineWidth = on ? 3 : 1.5;
        ctx.stroke();
      }
    }
    // 흉조 표시(재굴림 대가)
    if (g.omenMark) {
      const om = g.omenMark;
      if (om.lane != null) {
        const p = cellPos(L, om.lane, 0);
        ctx.globalAlpha = 0.5 + Math.sin(t * 5) * 0.2;
        drawGlow(ctx, p.x, p.y - 20, 40, '#a050ff', 0.7);
        ctx.globalAlpha = 1;
        drawIcon(ctx, 'eye', p.x, p.y - 22, 26, '#e0b0ff');
      }
    }
  }

  drawGhosts(g) {
    const ctx = this.ctx;
    for (const u of g.upcoming || []) {
      if (g.st && g.st.enemies.some((e) => e.alive && e.lane === u[1] && e.row === u[2])) continue;
      const p = cellPos(this.L, u[1], u[2]);
      ctx.globalAlpha = 0.35 + Math.sin(g.rt * 3) * 0.1;
      ctx.strokeStyle = '#c9b8ff';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 2, 34 * p.s, 11 * p.s, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${Math.round(12 * p.s + 2)}px ${FONTS.ui}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d9ccff';
      ctx.fillText('다음 턴 등장', p.x, p.y - 22 * p.s);
      ctx.globalAlpha = 1;
    }
  }

  viewPos(v) {
    const p = cellPos(this.L, v.lane, v.row);
    return { x: p.x + (v.ox || 0), y: p.y + (v.oy || 0), k: p.k * (v.sizeMul || 1), s: p.s };
  }

  drawEnemy(g, v) {
    const ctx = this.ctx;
    const p = this.viewPos(v);
    let alpha = 1;
    let k = p.k;
    if (v.spawnT < 1) {
      alpha = v.spawnT;
      k *= 0.6 + 0.4 * easeOutBack(v.spawnT);
    }
    if (v.dying > 0) {
      alpha = Math.max(0, 1 - v.dying * 1.3);
      k *= 1 + v.dying * 0.25;
    }
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const y = p.y - (v.knock || 0) + (v.lunge || 0) * 34 * p.s;
    const a = {
      t: v.t, flash: v.flash, frozen: v.frozen > 0, fury: v.fury > 0, exposed: v.exposed,
      squash: v.squash, hop: (v.hop || 0) * p.s, lean: v.lean || 0,
    };
    if (v.dying > 0) a.flash = Math.max(a.flash || 0, 1 - v.dying);
    if (v.type === 'kasa') drawKasa(ctx, p.x, y, k, { ...a, close: v.close || 0 });
    else if (v.type === 'mask') drawMask(ctx, p.x, y, k, { ...a, raise: v.raise || 0, slam: v.slam || 0, shield: true, broken: v.shieldBroken, braced: v.braced });
    else if (v.type === 'archer') drawArcher(ctx, p.x, y, k, { ...a, charge: v.chargeA || 0, puff: v.puff || 0 });
    else if (v.type === 'elder') drawElder(ctx, p.x, y, k * 0.86, { ...a, vulnerable: v.vulnerable, phase2: v.phase2, charge: v.charge });
    if (v.blockT > 0) {
      drawGlow(ctx, p.x, y - 40 * k, 50 * k, '#50f0be', v.blockT);
    }
    ctx.restore();
  }

  drawStatus(g, v) {
    if (v.dying > 0 || v.spawnT < 1) return;
    const ctx = this.ctx;
    const p = this.viewPos(v);
    const k = p.k;
    // 체력
    const hp = Math.max(0, v.hpShown);
    const pv = g.ui.preview?.summary?.per?.[v.id] || g.ui.counterPreview?.summary?.per?.[v.id];
    const dmgPrev = pv ? Math.min(hp, pv.dmg) : 0;
    const by = p.y + 8 * p.s;
    if (v.maxHp <= 10) {
      const pw = 7 * p.s + 1;
      const gap = 2;
      const tw = v.maxHp * pw + (v.maxHp - 1) * gap;
      let x0 = p.x - tw / 2;
      for (let i = 0; i < v.maxHp; i++) {
        const filled = i < hp;
        const willLose = filled && i >= hp - dmgPrev;
        ctx.fillStyle = INK;
        ctx.fillRect(x0 - 1, by - 1, pw + 2, 8 * p.s + 2);
        ctx.fillStyle = !filled ? '#3a2a3a' : willLose ? (Math.sin(g.rt * 14) > 0 ? '#ffffff' : '#ff6a4a') : '#ff4d5e';
        ctx.fillRect(x0, by, pw, 8 * p.s);
        x0 += pw + gap;
      }
    } else {
      const bw = 90 * p.s;
      ctx.fillStyle = INK;
      ctx.fillRect(p.x - bw / 2 - 2, by - 2, bw + 4, 11);
      ctx.fillStyle = '#3a2a3a';
      ctx.fillRect(p.x - bw / 2, by, bw, 7);
      ctx.fillStyle = '#ff4d5e';
      ctx.fillRect(p.x - bw / 2, by, (bw * hp) / v.maxHp, 7);
      if (dmgPrev) {
        ctx.fillStyle = Math.sin(g.rt * 14) > 0 ? '#fff' : '#ffb0a0';
        ctx.fillRect(p.x - bw / 2 + (bw * (hp - dmgPrev)) / v.maxHp, by, (bw * dmgPrev) / v.maxHp, 7);
      }
    }
    // 예고 배지
    const it = g.intents?.[v.id];
    const headY = p.y - { kasa: 86, mask: 96, archer: 104, elder: 142 }[v.type] * k;
    if (it && (g.ui.phase === 'aim' || g.ui.phase === 'spin' || g.ui.phase === 'spinning' || g.ui.phase === 'busy')) {
      this.drawIntent(it, p.x, headY, p.s, v, g);
    }
    // 상태 아이콘 줄
    const icons = [];
    if (v.frozen > 0) icons.push(['snow', '#9fdcff', v.frozen]);
    if (v.exposed) icons.push(['eye', '#c58cff', '노출']);
    if (v.fury > 0) icons.push(['heavy', '#ff5a5a', '+' + v.fury]);
    if (v.vulnerable) icons.push(['ember', '#ffe08a', '약점']);
    let ix = p.x - ((icons.length - 1) * 30 * p.s) / 2;
    for (const [ic, col, label] of icons) {
      ctx.fillStyle = 'rgba(10,6,16,0.75)';
      ctx.beginPath();
      ctx.arc(ix, by + 22 * p.s, 10 * p.s + 2, 0, TAU);
      ctx.fill();
      drawIcon(ctx, ic, ix, by + 22 * p.s, 15 * p.s, col);
      ctx.font = `${Math.round(10 * p.s + 3)}px ${FONTS.ui}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = col;
      ctx.fillText(String(label), ix, by + 40 * p.s);
      ix += 30 * p.s;
    }
    // 흉조 표적
    if (g.omenMark && g.omenMark.id === v.id) {
      drawGlow(ctx, p.x, headY + 6, 30, '#a050ff', 0.6 + Math.sin(g.rt * 6) * 0.2);
      drawIcon(ctx, 'eye', p.x + 30 * p.s, headY + 10, 20, '#e0b0ff');
    }
  }

  drawIntent(it, x, y, s, v, g) {
    const ctx = this.ctx;
    let icon = null, col = '#ffffff', bg = 'rgba(20,12,28,0.88)', label = '';
    switch (it.kind) {
      case 'move': icon = 'move'; col = '#d9e2ff'; label = it.steps > 1 ? `${it.steps}칸` : '1칸'; break;
      case 'attack':
        if (it.style === 'heavy') { icon = 'heavy'; col = '#ff4d5e'; bg = 'rgba(70,8,20,0.92)'; label = `${it.dmg}`; }
        else if (it.style === 'ranged' || it.style === 'volley') { icon = 'target'; col = '#ff9a3d'; bg = 'rgba(60,24,6,0.92)'; label = it.hits ? `${it.dmg}×${it.hits}` : `${it.dmg}`; }
        else { icon = 'sword'; col = '#ffcc33'; bg = 'rgba(56,40,4,0.92)'; label = `${it.dmg}`; }
        break;
      case 'brace': icon = 'heavy'; col = '#ff4d5e'; label = '준비'; break;
      case 'aim': icon = 'target'; col = '#ffb347'; label = '조준'; break;
      case 'charge': icon = 'bolt'; col = '#ffe08a'; label = '충전'; break;
      case 'summon': icon = 'plus'; col = '#c9b8ff'; label = '소환'; break;
      case 'shift': icon = 'move'; col = '#c9b8ff'; label = '이동'; break;
      case 'frozen': icon = 'snow'; col = '#9fdcff'; label = '정지'; break;
      default: icon = 'dots'; col = '#9a8fb0'; label = it.slow ? '느림' : '대기';
    }
    const w = 56 * s + 8;
    const h = 22 * s + 4;
    const bob = Math.sin(g.rt * 3 + v.id) * 2;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = bg;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    drawIcon(ctx, icon, -w / 2 + h / 2 + 2, 0, h * 0.62, col);
    ctx.font = `${Math.round(13 * s + 3)}px ${FONTS.num}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col;
    ctx.fillText(label, h * 0.35, 1);
    ctx.restore();
  }

  drawPlayerChar(g) {
    const P = g.player;
    if (!P) return;
    const L = this.L;
    drawPlayer(this.ctx, P.x + (P.ox || 0), L.playerY + (P.oy || 0), 1.08, P);
    // 방어막 표시
    if (g.st && g.st.player.guard > 0 && g.mode === 'battle') {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.45 + Math.sin(g.rt * 3) * 0.1;
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(P.x, L.playerY - 46, 46, 56, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    for (const ai of g.afterimages) {
      this.ctx.save();
      this.ctx.globalAlpha = ai.a * 0.4;
      drawPlayer(this.ctx, ai.x, L.playerY, 1.08, { ...P, pose: 'dodge', flash: 0 });
      this.ctx.restore();
    }
  }

  drawProjectiles(g) {
    const ctx = this.ctx;
    for (const p of g.projs) {
      const sym = SYMBOLS[p.sym] || SYMBOLS.counter;
      // 잔상
      for (let i = 0; i < p.trail.length; i++) {
        const [tx, ty] = p.trail[i];
        const a = (i / p.trail.length) * 0.5 * p.alpha;
        drawGlow(ctx, tx, ty, p.size * (0.6 + i / p.trail.length), sym.fx2, a);
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = p.alpha;
      if (p.sym === 'blade' || p.sym === 'counter') {
        drawGlow(ctx, 0, 0, p.size * 2.2, sym.fx2, 0.9);
        ctx.rotate(p.ang + Math.PI / 2);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        const s = p.size;
        ctx.moveTo(-s * 1.4, s * 0.3);
        ctx.quadraticCurveTo(0, -s * 1.2, s * 1.4, s * 0.3);
        ctx.quadraticCurveTo(0, -s * 0.3, -s * 1.4, s * 0.3);
        ctx.fill();
        ctx.strokeStyle = sym.fx;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (p.sym === 'frost') {
        drawGlow(ctx, 0, 0, p.size * 2, '#7cc8ff', 0.9);
        ctx.rotate(p.ang + Math.PI / 2);
        ctx.fillStyle = '#e8f8ff';
        ctx.beginPath();
        ctx.moveTo(0, -p.size * 1.6);
        ctx.lineTo(p.size * 0.5, 0);
        ctx.lineTo(0, p.size * 0.9);
        ctx.lineTo(-p.size * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#4aa6ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (p.sym === 'wave') {
        drawGlow(ctx, 0, 0, p.size * 2.4, '#0fae8a', 0.9);
        ctx.strokeStyle = '#8fffe2';
        ctx.lineWidth = 3;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (0.6 + i * 0.45 + ((g.time * 3) % 0.45)), 0, TAU);
          ctx.stroke();
        }
      } else if (p.sym === 'fire' || p.sym === 'deflect') {
        const col = p.sym === 'deflect' ? '#ffd84a' : '#ff7a3d';
        drawGlow(ctx, 0, 0, p.size * 2.6, col, 1);
        ctx.fillStyle = '#fff4c0';
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.55, 0, TAU);
        ctx.fill();
      } else {
        drawGlow(ctx, 0, 0, p.size * 2, sym.fx, 1);
      }
      ctx.restore();
    }
  }

  drawPreviewMarks(g) {
    const pv = g.ui.preview || g.ui.counterPreview;
    if (!pv) return;
    const ctx = this.ctx;
    for (const [id, info] of Object.entries(pv.summary.per)) {
      const v = g.views.get(Number(id));
      if (!v || v.dying) continue;
      const p = this.viewPos(v);
      const cy = p.y - 40 * p.k;
      const rot = g.rt * 1.5;
      ctx.save();
      ctx.translate(p.x, cy);
      ctx.strokeStyle = info.blocked ? '#50f0be' : info.killed ? '#ff4d5e' : '#ffffff';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) {
        const a = rot + (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.arc(0, 0, 30 * p.s + 6, a, a + 0.8);
        ctx.stroke();
      }
      ctx.restore();
      let label = info.blocked ? '막힘' : info.dmg ? `-${info.dmg}` : info.frozen ? '' : '';
      if (info.killed) label = '처치';
      const tags = [];
      if (info.tags.includes('shatter')) tags.push('파쇄');
      if (info.tags.includes('exposed')) tags.push('×2');
      if (info.tags.includes('weak')) tags.push('약점');
      if (info.frozen) tags.push('동결');
      const txt = [label, ...tags].filter(Boolean).join(' ');
      if (!txt) continue;
      ctx.font = `${Math.round(15 * p.s + 4)}px ${FONTS.num}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.strokeText(txt, p.x + 40 * p.s, cy - 18 * p.s);
      ctx.fillStyle = info.blocked ? '#50f0be' : info.killed ? '#ff8a7a' : '#ffffff';
      ctx.fillText(txt, p.x + 40 * p.s, cy - 18 * p.s);
    }
  }

  drawReactRing(g) {
    const r = g.ui.react;
    if (!r) return;
    const ctx = this.ctx;
    const L = this.L;
    const now = g.now();
    const total = r.impact - r.start;
    const left = Math.max(0, r.impact - now);
    const k = left / total;
    const x = g.player.x;
    const y = L.playerY - 48;
    const heavy = r.attack.style === 'heavy';
    const col = heavy ? '#ff3b4e' : r.attack.style === 'ranged' || r.attack.style === 'volley' ? '#ff9a3d' : '#ffcc33';
    const R0 = 34;
    const rad = R0 + k * 110;
    const inPerfect = Math.abs(now - r.impact) < 80;
    ctx.save();
    // 목표 원
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, R0, 0, TAU);
    ctx.stroke();
    // 줄어드는 고리
    if (!r.input || r.input) {
      ctx.strokeStyle = inPerfect ? '#ffffff' : col;
      ctx.lineWidth = inPerfect ? 7 : 5;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.stroke();
      drawGlow(ctx, x, y, rad + 10, col, 0.15 + (1 - k) * 0.25);
    }
    ctx.globalAlpha = 1;
    // 행동 힌트
    ctx.font = `22px ${FONTS.num}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    void heavy;
    ctx.restore();
  }

  drawHud(g) {
    const ctx = this.ctx;
    const st = g.st;
    if (!st) return;
    const p = st.player;
    // 체력 막대
    const hpShown = g.hud.hp;
    const x = 14, y = 14, w = 180, h = 18;
    drawIcon(ctx, 'heart', x + 10, y + 9, 22, '#ff4d5e');
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(x + 24, y, w, h, 9);
    ctx.fill();
    ctx.fillStyle = '#3a1a26';
    ctx.beginPath();
    ctx.roundRect(x + 26, y + 2, w - 4, h - 4, 7);
    ctx.fill();
    const ratio = Math.max(0, hpShown / p.maxHp);
    const lag = Math.max(0, g.hud.hpLag / p.maxHp);
    if (lag > ratio) {
      ctx.fillStyle = '#ffd0a0';
      ctx.beginPath();
      ctx.roundRect(x + 26, y + 2, (w - 4) * lag, h - 4, 7);
      ctx.fill();
    }
    const hg = ctx.createLinearGradient(0, y, 0, y + h);
    hg.addColorStop(0, '#ff7a6a');
    hg.addColorStop(1, '#d0283e');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.roundRect(x + 26, y + 2, Math.max(0.01, (w - 4) * ratio), h - 4, 7);
    ctx.fill();
    ctx.font = `15px ${FONTS.num}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.round(hpShown)} / ${p.maxHp}`, x + 24 + w / 2, y + h / 2 + 1);
    // 방어막 + 불씨
    let ix = x + 32;
    const iy = y + 34;
    for (let i = 0; i < p.guard; i++) {
      drawIcon(ctx, 'shield', ix, iy, 16, '#ffd27a');
      ix += 15;
    }
    if (p.guard) ix += 8;
    for (let i = 0; i < p.embers; i++) {
      drawGlow(ctx, ix, iy, 12, '#ffb347', 0.6);
      drawIcon(ctx, 'ember', ix, iy, 16, '#ffb347');
      ix += 16;
    }
    if (!p.guard && !p.embers) {
      ctx.font = `12px ${FONTS.ui}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('방어막·불씨 없음', x + 26, iy + 1);
    }
    // 목표
    const op = g.objective;
    const ox = 300, ow = 182;
    ctx.fillStyle = 'rgba(30,16,36,0.9)';
    ctx.strokeStyle = 'rgba(216,165,72,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(ox - ow / 2, 10, ow, 44, 10);
    ctx.fill();
    ctx.stroke();
    ctx.font = `13px ${FONTS.ui}`;
    ctx.fillStyle = '#d8a548';
    ctx.textAlign = 'left';
    ctx.fillText(`${st.def.name} · 턴 ${st.turn}`, ox - ow / 2 + 10, 22);
    ctx.font = `17px ${FONTS.num}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(`${op.label}  ${op.value}`, ox - ow / 2 + 10, 42);
    ctx.fillStyle = '#3a2a3a';
    ctx.fillRect(ox - ow / 2 + 10, 50, ow - 20, 2);
    ctx.fillStyle = '#d8a548';
    ctx.fillRect(ox - ow / 2 + 10, 50, (ow - 20) * Math.min(1, op.ratio), 2);
    // 설정 버튼
    const sb = g.gearRect;
    ctx.fillStyle = 'rgba(30,16,36,0.9)';
    ctx.beginPath();
    ctx.roundRect(sb.x, sb.y, sb.w, sb.h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(216,165,72,0.7)';
    ctx.stroke();
    drawIcon(ctx, 'gear', sb.x + sb.w / 2, sb.y + sb.h / 2, 22, '#d8a548');
    // 남은 적 수
    const n = st.enemies.filter((e) => e.alive).length;
    ctx.font = `13px ${FONTS.ui}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`적 ${n}`, W - 12, this.L.fieldTop + 2 + 4);
  }

  drawInfo(g) {
    const ctx = this.ctx;
    const L = this.L;
    const inf = g.info;
    if (!inf) return;
    const y = L.info.y + L.info.h / 2 + 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (inf.title) {
      ctx.font = `17px ${FONTS.num}`;
      const tw = ctx.measureText(inf.title).width;
      ctx.font = `14px ${FONTS.ui}`;
      const dw = inf.text ? ctx.measureText(inf.text).width : 0;
      const total = tw + (dw ? dw + 12 : 0);
      let x = L.cx - total / 2;
      ctx.textAlign = 'left';
      ctx.font = `17px ${FONTS.num}`;
      ctx.fillStyle = inf.color || '#ffd27a';
      ctx.fillText(inf.title, x, y);
      if (dw) {
        ctx.font = `14px ${FONTS.ui}`;
        ctx.fillStyle = '#e8dcc8';
        ctx.fillText(inf.text, x + tw + 12, y + 1);
      }
    } else {
      ctx.font = `15px ${FONTS.ui}`;
      ctx.fillStyle = inf.color || '#e8dcc8';
      ctx.fillText(inf.text, L.cx, y);
    }
  }

  drawSlot(g) {
    const ctx = this.ctx;
    const L = this.L;
    const st = g.st;
    const shots = st && g.ui.phase !== 'spinning' && st.shots.length ? st.shots : null;
    for (let i = 0; i < 3; i++) {
      const r = reelRect(L, i);
      const reel = g.reels[i];
      const strip = g.strips[i];
      const shotIdx = shots ? shots.findIndex((s) => s.reels.includes(i)) : -1;
      const shot = shotIdx >= 0 ? shots[shotIdx] : null;
      const used = shot && shot.used;
      const selected = shot && g.ui.sel === shotIdx && !used && g.ui.phase === 'aim';
      const bump = reel.bump || 0;
      ctx.save();
      ctx.translate(0, bump * 5);
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.clip();
      // 한지 배경
      ctx.fillStyle = '#eadbb8';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const cy = r.y + r.h / 2;
      const speed = Math.abs(reel.vel || 0);
      const blur = Math.min(1, speed / 25);
      const base = Math.floor(reel.pos);
      for (let j = -2; j <= 2; j++) {
        const idx = base + j;
        const y = cy + (reel.pos - idx) * REEL_CELL;
        if (y < r.y - REEL_CELL || y > r.y + r.h + REEL_CELL) continue;
        const sym = strip[((idx % strip.length) + strip.length) % strip.length];
        const isCenter = Math.abs(idx - reel.pos) < 0.5;
        const gilded = isCenter && st && st.reels[i] && st.reels[i].gilded && !reel.spinning;
        ctx.save();
        ctx.translate(r.x + r.w / 2, y);
        if (blur > 0.05) ctx.scale(1, 1 + blur * 0.6);
        ctx.globalAlpha = 1 - blur * 0.55;
        // 문양 배경 원
        ctx.fillStyle = SYMBOLS[sym].tint;
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = gilded ? '#d8a548' : 'rgba(23,13,34,0.25)';
        ctx.lineWidth = gilded ? 4 : 2;
        ctx.stroke();
        drawSymbol(ctx, sym, 0, 0, 23);
        ctx.restore();
      }
      // 원통 음영
      const sh = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      sh.addColorStop(0, 'rgba(20,8,12,0.75)');
      sh.addColorStop(0.28, 'rgba(20,8,12,0)');
      sh.addColorStop(0.72, 'rgba(20,8,12,0)');
      sh.addColorStop(1, 'rgba(20,8,12,0.75)');
      ctx.fillStyle = sh;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const idleShot = ['enemy', 'react', 'counter', 'over'].includes(g.ui.phase);
      if (used || idleShot) {
        ctx.fillStyle = 'rgba(15,8,18,0.6)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      if (reel.flashT > 0) {
        ctx.fillStyle = `rgba(255,255,255,${reel.flashT * 0.6})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      ctx.restore();
      // 틀
      ctx.save();
      ctx.translate(0, bump * 5);
      ctx.lineWidth = selected ? 4 : 2.5;
      ctx.strokeStyle = selected ? '#fff1b0' : '#d8a548';
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.stroke();
      if (selected) drawGlow(ctx, r.x + r.w / 2, r.y + r.h / 2, 110, '#ffd27a', 0.25 + Math.sin(g.rt * 5) * 0.08);
      // 중앙 지시 눈금
      ctx.fillStyle = '#d8a548';
      for (const sx of [r.x - 2, r.x + r.w + 2]) {
        ctx.beginPath();
        ctx.moveTo(sx, r.y + r.h / 2 - 7);
        ctx.lineTo(sx + (sx < r.x + 10 ? 8 : -8), r.y + r.h / 2);
        ctx.lineTo(sx, r.y + r.h / 2 + 7);
        ctx.fill();
      }
      if (st && st.reels[i] && st.reels[i].gilded && !reel.spinning) {
        const tt = g.rt * 2 + i;
        drawGlow(ctx, r.x + r.w / 2 + Math.cos(tt) * 50, r.y + r.h / 2 + Math.sin(tt * 1.3) * 50, 18, '#ffd27a', 0.8);
        ctx.strokeStyle = '#ffd27a';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.roundRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 6);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // 사용 도장
      if (used) {
        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        ctx.rotate(-0.25);
        ctx.strokeStyle = '#e2453c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-34, -18, 68, 36, 6);
        ctx.stroke();
        ctx.font = `22px ${FONTS.num}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e2453c';
        ctx.fillText('발사', 0, 1);
        ctx.restore();
      }
      ctx.restore();
    }
    // 인연 실(연결) + 이름패
    if (shots) {
      for (let si = 0; si < shots.length; si++) {
        const sh = shots[si];
        const rs = sh.reels.map((i) => reelRect(L, i));
        const x0 = rs[0].x;
        const x1 = rs[rs.length - 1].x + rs[rs.length - 1].w;
        const py = rs[0].y + rs[0].h + 8;
        if (sh.tier >= 2) {
          const pulse = 0.6 + Math.sin(g.rt * 6) * 0.25;
          for (let k = 0; k < rs.length - 1; k++) {
            const ax = rs[k].x + rs[k].w;
            const bx = rs[k + 1].x;
            const yy = rs[k].y + rs[k].h / 2;
            drawGlow(ctx, (ax + bx) / 2, yy, 30, sh.tier === 3 ? '#ffd84a' : '#ff6a4a', pulse * (sh.used ? 0.3 : 1));
            ctx.strokeStyle = sh.tier === 3 ? '#ffe08a' : '#ff6a4a';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(ax - 6, yy);
            ctx.bezierCurveTo(ax + 6, yy - 8, bx - 6, yy + 8, bx + 6, yy);
            ctx.stroke();
          }
        }
        const sel = g.ui.sel === si && !sh.used && g.ui.phase === 'aim';
        ctx.fillStyle = sh.used ? 'rgba(40,20,30,0.8)' : sh.tier === 3 ? '#6a3a08' : sh.tier === 2 ? '#5a1a1a' : '#2a1626';
        ctx.strokeStyle = sel ? '#fff1b0' : sh.tier >= 2 ? '#ffd27a' : 'rgba(216,165,72,0.6)';
        ctx.lineWidth = sel ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.roundRect(x0 + 4, py, x1 - x0 - 8, 26, 8);
        ctx.fill();
        ctx.stroke();
        ctx.font = `15px ${FONTS.num}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = sh.used ? 'rgba(255,255,255,0.35)' : sh.tier === 3 ? '#ffe08a' : '#fff';
        const star = sh.gild ? ' ✦' + (sh.gild > 1 ? sh.gild : '') : '';
        ctx.fillText(SHOT_NAMES[sh.symbol][sh.tier] + star, (x0 + x1) / 2, py + 14);
      }
    } else if (g.mode === 'battle') {
      ctx.font = `14px ${FONTS.ui}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(216,165,72,0.6)';
      const r = reelRect(L, 0);
      ctx.fillText(g.ui.phase === 'spinning' ? '점괘를 읽는 중…' : '점괘 북을 돌려라', L.cx, r.y + r.h + 21);
    }
  }

  drawButtons(g) {
    const ctx = this.ctx;
    for (const b of g.buttons) {
      const en = b.enabled;
      const hot = en && b.hot;
      ctx.save();
      const press = b.pressed ? 3 : 0;
      ctx.translate(0, press);
      const styles = {
        primary: ['#e8553e', '#9a2626', '#ffe0b0'],
        secondary: ['#3d2e6a', '#1f1640', '#e0d8ff'],
        gamble: ['#5a2a8a', '#2a1048', '#f0dcff'],
        guard: ['#f0b43a', '#9a5a10', '#2a1404'],
        dodge: ['#3ab0d8', '#145a86', '#04182a'],
      };
      const [c1, c2, tc] = en ? styles[b.style] || styles.secondary : ['#2e2632', '#1c1620', '#6a6070'];
      if (hot) drawGlow(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.7, c1, 0.35 + Math.sin(g.rt * 7) * 0.15);
      // 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.roundRect(b.x, b.y + 5 - press, b.w, b.h, 16);
      ctx.fill();
      const gr = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      gr.addColorStop(0, c1);
      gr.addColorStop(1, c2);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 16);
      ctx.fill();
      ctx.strokeStyle = en ? '#d8a548' : '#3e3444';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.roundRect(b.x + 6, b.y + 4, b.w - 12, b.h * 0.38, 12);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const hasSub = !!b.sub;
      if (b.icon) {
        drawIcon(ctx, b.icon, b.x + 30, b.y + b.h / 2, 26, tc);
      }
      ctx.font = `${b.big ? 26 : 21}px ${FONTS.num}`;
      ctx.fillStyle = tc;
      const tx = b.x + b.w / 2 + (b.icon ? 12 : 0);
      ctx.fillText(b.label, tx, b.y + b.h / 2 - (hasSub ? 10 : 0));
      if (hasSub) {
        ctx.font = `12.5px ${FONTS.ui}`;
        ctx.globalAlpha = en ? 0.92 : 0.6;
        ctx.fillText(b.sub, tx, b.y + b.h / 2 + 15, b.w - 16);
      }
      if (b.key) {
        ctx.font = `11px ${FONTS.ui}`;
        ctx.globalAlpha = 0.5;
        ctx.textAlign = 'right';
        ctx.fillText(b.key, b.x + b.w - 10, b.y + 13);
      }
      ctx.restore();
    }
  }

  drawCounterPrompt(g) {
    const c = g.ui.counter;
    if (!c) return;
    const ctx = this.ctx;
    const L = this.L;
    const now = g.now();
    const k = Math.max(0, (c.deadline - now) / (c.deadline - c.start));
    const y = L.fieldTop + 30;
    ctx.fillStyle = 'rgba(20,10,4,0.85)';
    ctx.beginPath();
    ctx.roundRect(L.cx - 150, y - 26, 300, 56, 14);
    ctx.fill();
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `22px ${FONTS.num}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd84a';
    ctx.fillText('되치기! 레인을 고르세요', L.cx, y - 4);
    ctx.fillStyle = '#3a2a10';
    ctx.fillRect(L.cx - 130, y + 16, 260, 5);
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(L.cx - 130, y + 16, 260 * k, 5);
  }

  drawBanner(g) {
    const b = g.banner;
    if (!b) return;
    const ctx = this.ctx;
    const L = this.L;
    const age = (g.now() - b.t0) / 1000;
    const inA = Math.min(1, age / 0.25);
    const outA = Math.min(1, Math.max(0, (b.dur - age) / 0.3));
    const a = Math.min(inA, outA);
    if (a <= 0) return;
    const y = L.fieldTop + L.fieldH * 0.42;
    ctx.save();
    ctx.globalAlpha = a;
    const h = b.sub ? 92 : 64;
    const gr = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    gr.addColorStop(0, 'rgba(10,4,14,0)');
    gr.addColorStop(0.2, 'rgba(10,4,14,0.88)');
    gr.addColorStop(0.8, 'rgba(10,4,14,0.88)');
    gr.addColorStop(1, 'rgba(10,4,14,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, y - h / 2, W, h);
    ctx.fillStyle = b.color || '#d8a548';
    ctx.fillRect(40, y - h / 2 + 8, W - 80, 1.5);
    ctx.fillRect(40, y + h / 2 - 9, W - 80, 1.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sc = 0.9 + 0.1 * easeOutBack(inA);
    ctx.translate(L.cx, y);
    ctx.scale(sc, sc);
    ctx.font = `${b.size || 34}px ${FONTS.num}`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.strokeText(b.title, 0, b.sub ? -14 : 0);
    ctx.fillStyle = b.color || '#ffe08a';
    ctx.fillText(b.title, 0, b.sub ? -14 : 0);
    if (b.sub) {
      ctx.font = `16px ${FONTS.ui}`;
      ctx.fillStyle = '#e8dcc8';
      ctx.fillText(b.sub, 0, 24);
    }
    ctx.restore();
  }
}

export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}
