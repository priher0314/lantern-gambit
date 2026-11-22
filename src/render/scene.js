// 화면 그리기: 배경(미리 렌더), 전장, 캐릭터, 슬롯 사당, HUD, 버튼
import { ROWS, LANES, SYMBOLS, SHOT_NAMES, RELICS } from '../core/data.js';
import { W, cellPos, laneEdges, reelRect, rowScale, LANE_SPACING, cabinetRect, leverRect } from './layout.js';
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

  drawMachine(g) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(0, (g.slotJolt || 0) * 6);
    this.drawShrineFrame(ctx, this.L);
    this.drawSlot(g);
    this.drawLever(g);
    ctx.restore();
  }

  drawShrineFrame(g, L) {
    const { x, y, w, h } = cabinetRect(L);
    // 몸체
    const body = g.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, '#4a1a22');
    body.addColorStop(1, '#260c14');
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(x, y + 10, w, h - 14, 10);
    g.fill();
    g.strokeStyle = '#d8a548';
    g.lineWidth = 2.5;
    g.stroke();
    // 지붕
    g.fillStyle = '#1a0c14';
    g.beginPath();
    g.moveTo(x - 12, y + 16);
    g.quadraticCurveTo(x + 10, y + 6, x + 26, y - 2);
    g.lineTo(x + w - 26, y - 2);
    g.quadraticCurveTo(x + w - 10, y + 6, x + w + 12, y + 16);
    g.lineTo(x + w, y + 18);
    g.lineTo(x, y + 18);
    g.closePath();
    g.fill();
    g.strokeStyle = '#d8a548';
    g.lineWidth = 2;
    g.stroke();
    // 지붕 술
    g.strokeStyle = '#e2453c';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x - 8, y + 16);
    g.lineTo(x - 8, y + 38);
    g.stroke();
    g.fillStyle = '#d8a548';
    g.beginPath();
    g.arc(x - 8, y + 18, 3.5, 0, TAU);
    g.fill();
    // 금장 못
    for (let i = 0; i < 10; i++) {
      const xx = x + 14 + ((w - 28) * i) / 9;
      g.beginPath();
      g.arc(xx, y + h - 10, 2.2, 0, TAU);
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

  // 당기는 레버 — 돌리기 버튼을 대신한다
  drawLever(g) {
    const ctx = this.ctx;
    const L = this.L;
    const lv = leverRect(L);
    const cab = cabinetRect(L);
    const battle = g.mode === 'battle';
    const ready = battle && g.ui.phase === 'spin' && !g.busy && !g.card;
    const pull = g.lever.pull;
    const x = lv.cx;
    const ky = lv.top + (lv.bottom - lv.top) * pull;
    const baseY = lv.bottom + 22;
    // 몸체에 붙은 받침
    const mg = ctx.createLinearGradient(0, baseY - 18, 0, baseY + 18);
    mg.addColorStop(0, '#e8c070');
    mg.addColorStop(1, '#8a5a1e');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.roundRect(cab.x + cab.w - 6, baseY - 16, x - (cab.x + cab.w) + 26, 32, 9);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    // 홈(레일)
    ctx.fillStyle = '#0c0508';
    ctx.beginPath();
    ctx.roundRect(x - 9, lv.top - 16, 18, baseY - lv.top + 20, 9);
    ctx.fill();
    ctx.strokeStyle = '#d8a548';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 눈금 불빛
    for (let i = 0; i < 4; i++) {
      const yy = lv.top - 4 + ((lv.bottom - lv.top) * i) / 3;
      const lit = ready && Math.floor(g.rt * 5) % 4 === i;
      ctx.fillStyle = lit ? '#ffe08a' : 'rgba(216,165,72,0.3)';
      ctx.fillRect(x + 14, yy - 1.5, 9, 3);
      ctx.fillRect(x - 23, yy - 1.5, 9, 3);
    }
    // 축
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, ky);
    ctx.stroke();
    const sg = ctx.createLinearGradient(x - 4, 0, x + 4, 0);
    sg.addColorStop(0, '#f4f4ff');
    sg.addColorStop(1, '#7a7f9a');
    ctx.strokeStyle = sg;
    ctx.lineWidth = 6;
    ctx.stroke();
    // 손잡이 공
    if (ready) drawGlow(ctx, x, ky, 52, '#ff7a4a', 0.5 + Math.sin(g.rt * 6) * 0.2);
    const kg = ctx.createRadialGradient(x - 7, ky - 8, 2, x, ky, 23);
    if (ready || pull > 0.02) {
      kg.addColorStop(0, '#ffc0a0');
      kg.addColorStop(0.45, '#e8402e');
      kg.addColorStop(1, '#7a1014');
    } else {
      kg.addColorStop(0, '#9a8a94');
      kg.addColorStop(1, '#3a2c38');
    }
    ctx.fillStyle = kg;
    ctx.beginPath();
    ctx.arc(x, ky, 22, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#d8a548';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, ky, 17, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(x - 8, ky - 9, 5, 3.5, -0.6, 0, TAU);
    ctx.fill();
    // 안내
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (ready) {
      const bob = Math.sin(g.rt * 6) * 3;
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x - 30, ky + 34 + bob);
      ctx.lineTo(x - 30, ky + 54 + bob);
      ctx.moveTo(x - 37, ky + 47 + bob);
      ctx.lineTo(x - 30, ky + 55 + bob);
      ctx.lineTo(x - 23, ky + 47 + bob);
      ctx.stroke();
    }
    ctx.font = `${ready ? 19 : 15}px ${FONTS.num}`;
    ctx.fillStyle = ready ? '#ffe08a' : 'rgba(216,165,72,0.45)';
    ctx.fillText(!battle ? '' : ready ? '당기기' : g.ui.phase === 'spinning' ? '…' : '잠김', x, lv.y + lv.h - 12);
  }

  // ─────────────── 프레임 ───────────────
  draw(g) {
    const ctx = this.ctx;
    const L = this.L;
    ctx.setTransform(this.sc, 0, 0, this.sc, 0, 0);
    ctx.drawImage(this.bg, 0, 0, W, L.H);
    this.drawAmbient(g);
    const fx = g.fx;

    // 전장 레이어: 흔들림·줌 펀치는 여기에만 적용(HUD·슬롯·버튼은 고정)
    ctx.save();
    const pz = 1 + fx.punch;
    const pcx = W / 2;
    const pcy = L.fieldTop + L.fieldH * 0.62;
    ctx.translate(pcx + fx.ox, pcy + fx.oy);
    ctx.scale(pz, pz);
    ctx.translate(-pcx, -pcy);
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
    ctx.restore();

    if (g.mode === 'battle') {
      this.drawReactRing(g);
      this.drawHud(g);
      this.drawInfo(g);
      this.drawMachine(g);
      this.drawButtons(g);
      this.drawBanner(g);
      this.drawCard(g);
    } else {
      this.drawMachine(g);
    }
    g.uiFx.drawWorld(ctx);
    g.uiFx.drawTexts(ctx, FONTS);
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
        drawIcon(ctx, 'eye', p.x, p.y - 24, 24, '#e0b0ff');
        ctx.font = `12px ${FONTS.ui}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e0b0ff';
        ctx.fillText('다시 굴리면 등장', p.x, p.y - 4);
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
    return { x: p.x + (v.ox || 0) + (v.jx || 0), y: p.y + (v.oy || 0), k: p.k * (v.sizeMul || 1), s: p.s };
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
      drawGlow(ctx, p.x + 46 * p.s, headY + 46 * p.s, 22, '#a050ff', 0.6 + Math.sin(g.rt * 6) * 0.2);
      drawIcon(ctx, 'eye', p.x + 46 * p.s, headY + 46 * p.s, 18, '#e0b0ff');
      ctx.font = `11px ${FONTS.ui}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b0ff';
      ctx.fillText('굴리면', p.x + 46 * p.s, headY + 46 * p.s + 14);
    }
  }

  drawIntent(it, x, y, s, v, g) {
    const ctx = this.ctx;
    let icon = null, col = '#ffffff', bg = 'rgba(20,12,28,0.9)', label = '';
    switch (it.kind) {
      case 'move': icon = 'move'; col = '#d9e2ff'; label = `${it.steps}칸 전진`; break;
      case 'attack':
        if (it.style === 'heavy') { icon = 'heavy'; col = '#ff4d5e'; bg = 'rgba(70,8,20,0.94)'; label = `강타 ${it.dmg}`; }
        else if (it.style === 'ranged' || it.style === 'volley') { icon = 'target'; col = '#ff9a3d'; bg = 'rgba(60,24,6,0.94)'; label = it.hits ? `발사 ${it.dmg}×${it.hits}` : `발사 ${it.dmg}`; }
        else { icon = 'sword'; col = '#ffcc33'; bg = 'rgba(56,40,4,0.94)'; label = `공격 ${it.dmg}`; }
        break;
      case 'brace': icon = 'heavy'; col = '#ff4d5e'; label = '강타 준비'; break;
      case 'aim': icon = 'target'; col = '#ffb347'; label = '조준 중'; break;
      case 'charge': icon = 'bolt'; col = '#ffe08a'; label = '사격 준비'; break;
      case 'summon': icon = 'plus'; col = '#c9b8ff'; label = '소환'; break;
      case 'shift': icon = 'move'; col = '#c9b8ff'; label = '옆 이동'; break;
      case 'frozen': icon = 'snow'; col = '#9fdcff'; label = '얼음'; break;
      default: icon = 'dots'; col = '#9a8fb0'; label = it.slow ? '느림' : '대기';
    }
    const fs = Math.round(11.5 * s + 3.5);
    ctx.font = `${fs}px ${FONTS.num}`;
    const h = 20 * s + 5;
    const w = ctx.measureText(label).width + h + 10;
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
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col;
    ctx.fillText(label, -w / 2 + h + 2, 1);
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
    const hpShown = g.hud.hp;
    const x = 12, y = 12, w = 150, h = 18;
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
    // 방어막 + 불씨 (글자 설명 포함)
    let ix = x + 12;
    const iy = y + 36;
    ctx.font = `12px ${FONTS.ui}`;
    ctx.textAlign = 'left';
    drawIcon(ctx, 'shield', ix, iy, 15, p.guard ? '#ffd27a' : 'rgba(255,255,255,0.3)');
    ctx.fillStyle = p.guard ? '#ffd27a' : 'rgba(255,255,255,0.4)';
    ctx.fillText(`방어막 ${p.guard}`, ix + 11, iy + 1);
    ix += 76;
    drawIcon(ctx, 'ember', ix, iy, 15, p.embers ? '#ffb347' : 'rgba(255,255,255,0.3)');
    ctx.fillStyle = p.embers ? '#ffb347' : 'rgba(255,255,255,0.4)';
    ctx.fillText(`불씨 ${p.embers}`, ix + 11, iy + 1);
    // 목표
    const op = g.objective;
    const ox = 316, ow = 208;
    ctx.fillStyle = 'rgba(30,16,36,0.9)';
    ctx.strokeStyle = 'rgba(216,165,72,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(ox - ow / 2, 10, ow, 46, 10);
    ctx.fill();
    ctx.stroke();
    ctx.font = `12.5px ${FONTS.ui}`;
    ctx.fillStyle = '#d8a548';
    ctx.textAlign = 'left';
    ctx.fillText(`${g.run ? g.run.stage + 1 : 1}/${g.battleCount} ${st.def.name} · ${st.turn}턴째`, ox - ow / 2 + 10, 23, ow - 20);
    ctx.font = `16px ${FONTS.num}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(`목표: ${op.label} ${op.value}`, ox - ow / 2 + 10, 42, ow - 20);
    ctx.fillStyle = '#3a2a3a';
    ctx.fillRect(ox - ow / 2 + 10, 51, ow - 20, 2);
    ctx.fillStyle = '#d8a548';
    ctx.fillRect(ox - ow / 2 + 10, 51, (ow - 20) * Math.min(1, op.ratio), 2);
    // 도움말 · 설정 버튼
    for (const [rc, kind] of [[g.helpRect, 'help'], [g.gearRect, 'gear']]) {
      ctx.fillStyle = 'rgba(30,16,36,0.9)';
      ctx.beginPath();
      ctx.roundRect(rc.x, rc.y, rc.w, rc.h, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(216,165,72,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (kind === 'gear') drawIcon(ctx, 'gear', rc.x + rc.w / 2, rc.y + rc.h / 2, 21, '#d8a548');
      else {
        ctx.font = `24px ${FONTS.num}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffe08a';
        ctx.fillText('?', rc.x + rc.w / 2, rc.y + rc.h / 2 + 2);
      }
    }
    // 유물 줄(HUD 바로 아래) — 누르면 설명
    const relics = st.relics;
    for (let i = 0; i < relics.length; i++) {
      const rr = g.relicRect(i);
      drawRelicBadge(ctx, relics[i], rr.x + rr.w / 2, rr.y + rr.h / 2, 13, g.relicPulse[relics[i]] || 0);
    }
    ctx.font = `12px ${FONTS.ui}`;
    ctx.textBaseline = 'middle';
    if (relics.length) {
      const last = g.relicRect(relics.length - 1);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('← 유물 (눌러서 설명)', last.x + last.w + 6, last.y + last.h / 2 + 1);
    }
    const n = st.enemies.filter((e) => e.alive).length;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`남은 적 ${n}`, W - 12, this.L.hudH + 17);
  }

  drawInfo(g) {
    const ctx = this.ctx;
    const L = this.L;
    const y = L.info.y + L.info.h / 2 + 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const c = g.ui.counter;
    if (c) {
      const k = Math.max(0, (c.deadline - g.now()) / (c.deadline - c.start));
      ctx.fillStyle = 'rgba(60,40,4,0.9)';
      ctx.fillRect(0, L.info.y + 3, W, L.info.h - 3);
      ctx.font = `19px ${FONTS.num}`;
      ctx.fillStyle = '#ffd84a';
      ctx.fillText('되치기! 되받아칠 레인을 누르세요', L.cx, y - 3);
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(L.cx - 150, L.info.y + L.info.h - 6, 300 * k, 4);
      return;
    }
    const inf = g.info;
    if (!inf) return;
    if (inf.title) {
      ctx.font = `17px ${FONTS.num}`;
      const tw = ctx.measureText(inf.title).width;
      ctx.font = `14px ${FONTS.ui}`;
      const maxD = W - 24 - tw - 12;
      const dw = inf.text ? Math.min(maxD, ctx.measureText(inf.text).width) : 0;
      const total = tw + (dw ? dw + 12 : 0);
      const x = L.cx - total / 2;
      ctx.textAlign = 'left';
      ctx.font = `17px ${FONTS.num}`;
      ctx.fillStyle = inf.color || '#ffd27a';
      ctx.fillText(inf.title, x, y);
      if (dw) {
        ctx.font = `14px ${FONTS.ui}`;
        ctx.fillStyle = '#e8dcc8';
        ctx.fillText(inf.text, x + tw + 12, y + 1, maxD);
      }
    } else {
      ctx.font = `15px ${FONTS.ui}`;
      ctx.fillStyle = inf.color || '#e8dcc8';
      ctx.fillText(inf.text, L.cx, y, W - 24);
    }
  }

  drawSlot(g) {
    const ctx = this.ctx;
    const L = this.L;
    const st = g.st;
    const shots = st && g.ui.phase !== 'spinning' && st.shots.length ? st.shots : null;
    const idle = ['enemy', 'react', 'counter', 'over', 'spin'].includes(g.ui.phase);
    for (let i = 0; i < 3; i++) {
      const r = reelRect(L, i);
      const reel = g.reels[i];
      const strip = g.strips[i];
      const shotIdx = shots ? shots.findIndex((s) => s.reels.includes(i)) : -1;
      const shot = shotIdx >= 0 ? shots[shotIdx] : null;
      const used = shot && shot.used;
      const selected = shot && g.ui.sel === shotIdx && !used && g.ui.phase === 'aim';
      const gilded = st && st.reels[i] && st.reels[i].gilded && !reel.spinning && shots && !idle;
      const bump = reel.bump || 0;
      ctx.save();
      ctx.translate(0, bump * 9);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.clip();
      ctx.fillStyle = gilded ? '#f6e3a8' : '#eadbb8';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const cy = r.y + r.h / 2;
      const blur = Math.min(1, Math.abs(reel.vel || 0) / 25);
      const base = Math.floor(reel.pos);
      for (let j = -2; j <= 2; j++) {
        const idx = base + j;
        const y = cy + (reel.pos - idx) * REEL_CELL;
        if (y < r.y - REEL_CELL || y > r.y + r.h + REEL_CELL) continue;
        const sym = strip[((idx % strip.length) + strip.length) % strip.length];
        const isCenter = Math.abs(idx - reel.pos) < 0.5;
        ctx.save();
        ctx.translate(r.x + r.w / 2, y);
        if (blur > 0.05) ctx.scale(1, 1 + blur * 0.7);
        ctx.globalAlpha = 1 - blur * 0.55;
        ctx.fillStyle = SYMBOLS[sym].tint;
        ctx.beginPath();
        ctx.arc(0, 0, 29, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = gilded && isCenter ? '#d8a548' : 'rgba(23,13,34,0.25)';
        ctx.lineWidth = gilded && isCenter ? 4 : 2;
        ctx.stroke();
        drawSymbol(ctx, sym, 0, 0, 22);
        ctx.restore();
      }
      // 원통 음영
      const sh = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      sh.addColorStop(0, 'rgba(20,8,12,0.78)');
      sh.addColorStop(0.28, 'rgba(20,8,12,0)');
      sh.addColorStop(0.72, 'rgba(20,8,12,0)');
      sh.addColorStop(1, 'rgba(20,8,12,0.78)');
      ctx.fillStyle = sh;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // 회전 중 속도선
      if (blur > 0.3) {
        ctx.strokeStyle = `rgba(255,255,255,${blur * 0.25})`;
        ctx.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const lx = r.x + 14 + ((r.w - 28) * k) / 3;
          const ly = r.y + ((g.rt * 900 + k * 47) % r.h);
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx, ly + 26);
          ctx.stroke();
        }
      }
      if (used || (idle && shots)) {
        ctx.fillStyle = 'rgba(15,8,18,0.6)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      if (reel.flashT > 0) {
        ctx.fillStyle = `rgba(255,255,255,${reel.flashT * 0.7})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      ctx.restore();
      // 틀
      ctx.lineWidth = selected ? 4 : 2.5;
      ctx.strokeStyle = selected ? '#fff1b0' : gilded ? '#ffd27a' : '#d8a548';
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.stroke();
      if (selected) drawGlow(ctx, r.x + r.w / 2, r.y + r.h / 2, 100, '#ffd27a', 0.25 + Math.sin(g.rt * 5) * 0.08);
      // 중앙 눈금
      ctx.fillStyle = '#d8a548';
      for (const sx of [r.x - 2, r.x + r.w + 2]) {
        ctx.beginPath();
        ctx.moveTo(sx, r.y + r.h / 2 - 7);
        ctx.lineTo(sx + (sx < r.x + 10 ? 8 : -8), r.y + r.h / 2);
        ctx.lineTo(sx, r.y + r.h / 2 + 7);
        ctx.fill();
      }
      // 금빛 릴 표식: 무엇인지 글자로 알려준다
      if (gilded && !used) {
        const bw = 62;
        ctx.fillStyle = '#d8a548';
        ctx.beginPath();
        ctx.roundRect(r.x + r.w / 2 - bw / 2, r.y - 9, bw, 19, 9);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = `12.5px ${FONTS.num}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#2a1404';
        ctx.fillText('금빛 강화', r.x + r.w / 2, r.y + 1);
      }
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
    const r0 = reelRect(L, 0);
    if (shots && !idle) {
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
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(ax - 6, yy);
            ctx.bezierCurveTo(ax + 4, yy - 8, bx - 4, yy + 8, bx + 6, yy);
            ctx.stroke();
          }
        }
        const sel = g.ui.sel === si && !sh.used && g.ui.phase === 'aim';
        ctx.fillStyle = sh.used ? 'rgba(40,20,30,0.8)' : sh.tier === 3 ? '#6a3a08' : sh.tier === 2 ? '#5a1a1a' : '#2a1626';
        ctx.strokeStyle = sel ? '#fff1b0' : sh.tier >= 2 ? '#ffd27a' : 'rgba(216,165,72,0.6)';
        ctx.lineWidth = sel ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.roundRect(x0 + 3, py, x1 - x0 - 6, 26, 8);
        ctx.fill();
        ctx.stroke();
        ctx.font = `15px ${FONTS.num}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = sh.used ? 'rgba(255,255,255,0.35)' : sh.tier === 3 ? '#ffe08a' : sh.gild ? '#ffd27a' : '#fff';
        ctx.fillText(SHOT_NAMES[sh.symbol][sh.tier] + (sh.gild ? ' +' + sh.gild : ''), (x0 + x1) / 2, py + 14, x1 - x0 - 12);
      }
    } else if (g.mode === 'battle') {
      ctx.font = `14px ${FONTS.ui}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(216,165,72,0.7)';
      const c = cabinetRect(L);
      const msg = g.ui.phase === 'spinning' ? '점괘를 읽는 중…' : g.ui.phase === 'spin' ? '레버를 당겨 공격을 뽑으세요 →' : '행렬의 차례';
      ctx.fillText(msg, c.x + c.w / 2, r0.y + r0.h + 21);
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
      const [c1, c2, tc] = en ? styles[b.style] || styles.secondary : ['#2e2632', '#1c1620', '#8a8090'];
      if (hot) drawGlow(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.7, c1, 0.35 + Math.sin(g.rt * 7) * 0.15);
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
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.roundRect(b.x + 6, b.y + 4, b.w - 12, b.h * 0.34, 12);
      ctx.fill();
      ctx.textBaseline = 'middle';
      const lines = [b.sub, b.sub2].filter(Boolean);
      const cx = b.x + b.w / 2 + (b.icon ? 12 : 0);
      if (b.icon) drawIcon(ctx, b.icon, b.x + 30, b.y + b.h / 2, 26, tc);
      const ly = lines.length === 2 ? b.y + 19 : lines.length === 1 ? b.y + b.h / 2 - 11 : b.y + b.h / 2;
      ctx.textAlign = 'center';
      ctx.font = `${b.big ? 25 : lines.length === 2 ? 19 : 21}px ${FONTS.num}`;
      ctx.fillStyle = tc;
      ctx.fillText(b.label, cx, ly, b.w - 16);
      // 남은 횟수 구슬
      if (b.pips != null) {
        const lw = ctx.measureText(b.label).width;
        for (let i = 0; i < b.pipMax; i++) {
          ctx.beginPath();
          ctx.arc(cx + lw / 2 + 14 + i * 13, ly, 4.5, 0, TAU);
          ctx.fillStyle = i < b.pips ? '#ffe08a' : 'rgba(0,0,0,0.4)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,224,138,0.6)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      ctx.font = `12.5px ${FONTS.ui}`;
      lines.forEach((t, i) => {
        ctx.globalAlpha = en ? 0.95 : 0.7;
        ctx.fillStyle = en && b.subColors && b.subColors[i] ? b.subColors[i] : tc;
        ctx.fillText(t, cx, (lines.length === 2 ? b.y + 42 : b.y + b.h / 2 + 14) + i * 17, b.w - 14);
      });
      ctx.globalAlpha = 1;
      if (b.key) {
        ctx.font = `10.5px ${FONTS.ui}`;
        ctx.globalAlpha = 0.45;
        ctx.textAlign = 'right';
        ctx.fillStyle = tc;
        ctx.fillText(b.key, b.x + b.w - 9, b.y + 11);
      }
      ctx.restore();
    }
  }

  drawCard(g) {
    const c = g.card;
    if (!c) return;
    const ctx = this.ctx;
    const L = this.L;
    const x = 10;
    const y = L.info.y + 4;
    const w = W - 20;
    const h = L.H - y - 8;
    const a = Math.min(1, (g.now() - c.t0) / 160);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, (1 - a) * 16);
    const pg = ctx.createLinearGradient(0, y, 0, y + h);
    pg.addColorStop(0, '#301828');
    pg.addColorStop(1, '#150a14');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = c.color || '#d8a548';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 초상
    const px = x + 58;
    const py = y + 70;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(px, py, 46, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(216,165,72,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, 45, 0, TAU);
    ctx.clip();
    const t = g.rt;
    if (c.enemy === 'kasa') drawKasa(ctx, px, py + 38, 0.95, { t });
    else if (c.enemy === 'mask') drawMask(ctx, px, py + 40, 0.86, { t, shield: true });
    else if (c.enemy === 'archer') drawArcher(ctx, px, py + 44, 0.9, { t });
    else if (c.enemy === 'elder') drawElder(ctx, px, py + 46, 0.56, { t });
    ctx.restore();
    if (c.relic) drawRelicBadge(ctx, c.relic, px, py, 34);
    if (c.glyph) {
      ctx.font = `46px ${FONTS.num}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c.color || '#ffe08a';
      ctx.fillText(c.glyph, px, py + 3);
    }
    // 글
    const tx = x + 116;
    const tw = w - 116 - 14;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `13px ${FONTS.ui}`;
    ctx.fillStyle = '#d8a548';
    ctx.fillText(c.kicker || '', tx, y + 22);
    ctx.font = `25px ${FONTS.num}`;
    ctx.fillStyle = c.color || '#ffe08a';
    ctx.fillText(c.title, tx, y + 48, tw);
    let ly = y + 80;
    const lh = 20;
    for (const ln of c.lines) {
      ctx.font = `15px ${FONTS.num}`;
      const lw = ln.label ? ctx.measureText(ln.label).width + 8 : 0;
      // 초상 아래로 내려가면 전체 폭 사용
      const full = ly > py + 52;
      const bx = full ? x + 16 : tx;
      const bw = full ? w - 32 : tw;
      if (ln.label) {
        ctx.fillStyle = ln.color || '#ffd27a';
        ctx.fillText(ln.label, bx, ly);
      }
      ctx.font = `15px ${FONTS.ui}`;
      ctx.fillStyle = '#efe4d0';
      const rows = wrapText(ctx, ln.text, bw - lw);
      rows.forEach((row, i) => ctx.fillText(row, bx + lw, ly + i * lh));
      ly += rows.length * lh + 5;
    }
    ctx.font = `12px ${FONTS.ui}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(c.more ? `아무 곳이나 눌러 다음 (${c.more}개 더)` : '아무 곳이나 눌러 닫기', x + w - 14, y + h - 14);
    ctx.restore();
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

export function drawRelicBadge(ctx, id, x, y, r, pulse = 0) {
  const R = RELICS[id];
  if (!R) return;
  if (pulse > 0) drawGlow(ctx, x, y, r * (2.2 + pulse), R.color, Math.min(1, pulse));
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + pulse * 0.25), 0, TAU);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
  g.addColorStop(0, '#3a2440');
  g.addColorStop(1, '#170d22');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.strokeStyle = R.color;
  ctx.stroke();
  ctx.font = `${Math.round(r * 1.15)}px ${FONTS.num}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = R.color;
  ctx.fillText(R.glyph, x, y + r * 0.08);
}

export function wrapText(ctx, text, maxW) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const tryLine = line ? line + ' ' + word : word;
    if (ctx.measureText(tryLine).width <= maxW) {
      line = tryLine;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    let w = word;
    while (ctx.measureText(w).width > maxW) {
      let n = w.length;
      while (n > 1 && ctx.measureText(w.slice(0, n)).width > maxW) n--;
      lines.push(w.slice(0, n));
      w = w.slice(n);
    }
    line = w;
  }
  if (line) lines.push(line);
  return lines;
}
