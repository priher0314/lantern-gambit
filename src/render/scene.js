// 화면 그리기: 배경(미리 렌더), 전장, 캐릭터, 슬롯 사당, HUD, 버튼
import { ROWS, LANES, SYMBOLS, SHOT_NAMES, RELICS, MODS } from '../core/data.js';
import { W, cellPos, laneEdges, reelRect, rowScale, LANE_SPACING, cabinetRect, leverRect, slotCell, trayRect, REEL_CELL, REEL_PEEK } from './layout.js';
import { drawKasa, drawMask, drawArcher, drawElder, drawDrum, drawPlayer, drawSymbol, drawIcon, drawRelicIcon, INK, mix } from './art.js';
import { drawGlow } from './fx.js';

export const FONTS = {
  ui: '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  num: '"Black Han Sans", "Jua", "Malgun Gothic", sans-serif',
};
const TAU = Math.PI * 2;
export { REEL_CELL };

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
    // 칸마다 옅은 발판: 적 사이 간격이 한눈에 읽히게
    for (let lane = 0; lane < LANES; lane++) {
      for (let r = 0; r < ROWS; r++) {
        const p = cellPos(L, lane, r);
        g.fillStyle = 'rgba(10,4,10,0.16)';
        g.strokeStyle = 'rgba(255,225,170,0.11)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(p.x, p.y - 2, 56 * p.s, 23 * p.s, 0, 0, TAU);
        g.fill();
        g.stroke();
      }
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
    this.drawTray(g);
    this.drawSlot(g);
    this.drawLever(g);
    ctx.restore();
    if (g.mode === 'battle') this.drawRelicRow(g);
  }

  // 유물 줄: 슬롯머신 바로 위(누르면 설명)
  drawRelicRow(g) {
    const st = g.st;
    if (!st) return;
    const relics = g.shownRelics;
    for (let i = 0; i < relics.length; i++) {
      const rr = g.relicRect(i);
      drawRelicBadge(this.ctx, relics[i], rr.x + rr.w / 2, rr.y + rr.h / 2, 13, g.relicPulse[relics[i]] || 0, st.relicLv[relics[i]] || 1);
    }
    if (!relics.length) return;
    if (relics.length <= 4) {
      const ctx = this.ctx;
      const last = g.relicRect(relics.length - 1);
      ctx.font = `12px ${FONTS.ui}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('← 유물 (눌러서 보기)', last.x + last.w + 6, last.y + last.h / 2 + 1);
    }
  }

  // 코인 쟁반: 번 코인이 실제 개수만큼 흩어져 쌓인다
  drawTray(g) {
    const ctx = this.ctx;
    const tr = trayRect(this.L);
    // 테두리 + 바닥
    const rim = ctx.createLinearGradient(0, tr.y, 0, tr.y + tr.h);
    rim.addColorStop(0, '#e8c070');
    rim.addColorStop(1, '#8a5a1e');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.roundRect(tr.x - 3, tr.y - 3, tr.w + 6, tr.h + 6, 9);
    ctx.fill();
    ctx.fillStyle = '#150b10';
    ctx.beginPath();
    ctx.roundRect(tr.x, tr.y, tr.w, tr.h, 7);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tr.x, tr.y, tr.w, tr.h, 7);
    ctx.clip();
    // 바닥 격자(펠트 느낌)
    ctx.strokeStyle = 'rgba(216,165,72,0.09)';
    ctx.lineWidth = 1;
    for (let x = tr.x - tr.h; x < tr.x + tr.w; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, tr.y);
      ctx.lineTo(x + tr.h, tr.y + tr.h);
      ctx.moveTo(x + tr.h, tr.y);
      ctx.lineTo(x, tr.y + tr.h);
      ctx.stroke();
    }
    const sh = ctx.createLinearGradient(0, tr.y, 0, tr.y + 10);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(tr.x, tr.y, tr.w, 10);
    // 코인(아래쪽 것이 위에 겹치도록 y 순서로)
    const spots = [];
    const tnow = g.now();
    for (let i = 0; i < g.pile; i++) {
      const s = g.coinSpot(i);
      const age = g.landAt[i] != null ? (tnow - g.landAt[i]) / 1000 : 9;
      if (age < 0.4) s.y -= Math.abs(Math.sin((age / 0.4) * Math.PI * 2)) * 7 * (1 - age / 0.4);
      spots.push(s);
    }
    spots.sort((a, b) => a.y - b.y);
    for (const s of spots) drawCoin(ctx, s.x, s.y, 8, s.rot, 1);
    ctx.restore();
    // 개수 표지
    const pw = 62;
    const px = tr.x + tr.w - pw - 3;
    ctx.fillStyle = '#2a1404';
    ctx.strokeStyle = '#d8a548';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(px, tr.y + 4, pw, tr.h - 8, 6);
    ctx.fill();
    ctx.stroke();
    drawCoin(ctx, px + 14, tr.y + tr.h / 2, 7, 0.6, 1);
    const cp = g.coinPulse || 0;
    ctx.font = `${19 + cp * 5}px ${FONTS.num}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd84a';
    ctx.fillText(String(g.trayTarget()), px + 40, tr.y + tr.h / 2 + 1);
  }

  // 쟁반으로 날아드는 코인
  drawCoinFlies(g) {
    const ctx = this.ctx;
    for (const f of g.flies) {
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / f.dur);
      // 처음엔 툭 튀어 오르고(느리게), 끝에는 쟁반으로 떨어진다(빠르게)
      const e = k < 0.35 ? (k / 0.35) * 0.28 * (2 - k / 0.35) : 0.28 + 0.72 * ((k - 0.35) / 0.65) ** 2;
      const m = 1 - e;
      const x = m * m * m * f.sx + 3 * m * m * e * f.bx + 3 * m * e * e * f.cx + e * e * e * f.tx;
      const y = m * m * m * f.sy + 3 * m * m * e * f.by + 3 * m * e * e * f.cy + e * e * e * f.ty;
      drawGlow(ctx, x, y, 14, '#ffd84a', 0.5);
      drawCoin(ctx, x, y, 8 + Math.sin(k * Math.PI) * 4, f.rot + k * 9, Math.abs(Math.cos(k * 14)) * 0.7 + 0.3);
    }
  }

  drawShrineFrame(g, L) {
    const { x, y, w, h } = cabinetRect(L);
    // 몸체(위에서 내려다본 상자: 윗면은 코인 쟁반)
    const body = g.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, '#4a1a22');
    body.addColorStop(1, '#260c14');
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(x, y, w, h, 12);
    g.fill();
    g.strokeStyle = '#d8a548';
    g.lineWidth = 2.5;
    g.stroke();
    g.strokeStyle = 'rgba(216,165,72,0.3)';
    g.lineWidth = 1;
    g.beginPath();
    g.roundRect(x + 5, y + 5, w - 10, h - 10, 9);
    g.stroke();
    // 금장 못
    g.fillStyle = '#d8a548';
    for (let i = 0; i < 10; i++) {
      const xx = x + 14 + ((w - 28) * i) / 9;
      g.beginPath();
      g.arc(xx, y + h - 8, 2, 0, TAU);
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
    const active = ready || g.lever.t >= 0;
    const pull = Math.max(-0.08, g.lever.pull);
    const cx = lv.cx;
    const py = L.slot.y + L.slot.h - 72; // 축 중심
    const len = 120;
    const th = pull * 1.2; // 앞으로 당겨지는 각도(정면에서 보면 짧아지며 커진다)
    const ky = py - len * Math.cos(th);
    const kr = 21 + Math.sin(Math.max(0, th)) * 6;

    // 옻칠 뒤판
    const pg = ctx.createLinearGradient(0, L.slot.y + 16, 0, L.slot.y + L.slot.h);
    pg.addColorStop(0, '#3e161e');
    pg.addColorStop(1, '#1a090f');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(lv.x + 4, L.slot.y + 16, lv.w - 8, L.slot.h - 22, 16);
    ctx.fill();
    ctx.strokeStyle = '#d8a548';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(216,165,72,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(lv.x + 9, L.slot.y + 21, lv.w - 18, L.slot.h - 32, 12);
    ctx.stroke();
    // 장식 등(준비되면 차례로 켜진다)
    for (let i = 0; i < 3; i++) {
      const bx = cx - 24 + i * 24;
      const by = L.slot.y + 34;
      const lit = ready && Math.floor(g.rt * 6) % 3 === i;
      if (lit) drawGlow(ctx, bx, by, 14, '#ffd27a', 0.9);
      ctx.fillStyle = lit ? '#fff3c0' : '#5a3a1e';
      ctx.beginPath();
      ctx.arc(bx, by, 4.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#d8a548';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // 레일 홈
    ctx.fillStyle = '#0a0406';
    ctx.beginPath();
    ctx.roundRect(cx - 7, py - len - 4, 14, len + 4, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(216,165,72,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 몸체 연결 브래킷
    const gold = ctx.createLinearGradient(0, py - 26, 0, py + 26);
    gold.addColorStop(0, '#fff0b8');
    gold.addColorStop(0.45, '#d8a548');
    gold.addColorStop(1, '#7a4a12');
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.roundRect(cab.x + cab.w - 6, py - 11, cx - (cab.x + cab.w) + 6, 22, 6);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    // 축 허브(톱니 장식)
    ctx.save();
    ctx.translate(cx, py);
    ctx.rotate(pull * 1.6);
    ctx.fillStyle = gold;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const rr = i % 2 ? 27 : 23;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#2a0e14';
    ctx.beginPath();
    ctx.arc(cx, py, 15, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#d8a548';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = active ? '#ff5a3a' : '#6a4a50';
    ctx.beginPath();
    ctx.arc(cx, py, 6.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(cx - 2, py - 2, 2, 0, TAU);
    ctx.fill();
    // 팔(끝으로 갈수록 가늘다)
    const ag = ctx.createLinearGradient(cx - 6, 0, cx + 6, 0);
    ag.addColorStop(0, '#ffffff');
    ag.addColorStop(0.5, '#b9bdd6');
    ag.addColorStop(1, '#565b78');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.moveTo(cx - 6, py - 12);
    ctx.lineTo(cx - 3.5, ky);
    ctx.lineTo(cx + 3.5, ky);
    ctx.lineTo(cx + 6, py - 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    for (const t of [0.22, 0.8]) {
      const yy = py - 12 + (ky - (py - 12)) * t;
      ctx.fillStyle = gold;
      ctx.beginPath();
      ctx.roundRect(cx - 8, yy - 3.5, 16, 7, 3);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // 손잡이: 등불 유리 구슬
    if (ready) drawGlow(ctx, cx, ky, 58, '#ff7a4a', 0.5 + Math.sin(g.rt * 6) * 0.2);
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.ellipse(cx, ky + kr - 2, 11, 6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    const kg = ctx.createRadialGradient(cx - kr * 0.3, ky - kr * 0.35, 2, cx, ky, kr);
    if (active) {
      kg.addColorStop(0, '#fff6d0');
      kg.addColorStop(0.35, '#ff8a4a');
      kg.addColorStop(0.75, '#d0281e');
      kg.addColorStop(1, '#6a0a12');
    } else {
      kg.addColorStop(0, '#c9b0b6');
      kg.addColorStop(0.5, '#7a4a58');
      kg.addColorStop(1, '#2a1018');
    }
    ctx.fillStyle = kg;
    ctx.beginPath();
    ctx.arc(cx, ky, kr, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    if (active) {
      ctx.globalAlpha = 0.85;
      drawIcon(ctx, 'ember', cx, ky + 2, kr * 0.95, '#fff3a0');
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, ky, kr - 4, Math.PI * 1.1, Math.PI * 1.6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx - kr * 0.38, ky - kr * 0.42, kr * 0.22, kr * 0.14, -0.6, 0, TAU);
    ctx.fill();
    // 꼭지 장식
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(cx, ky - kr - 1, 4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 안내
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${ready ? 18 : 14}px ${FONTS.num}`;
    ctx.fillStyle = ready ? '#ffe08a' : 'rgba(216,165,72,0.45)';
    const ly = L.slot.y + L.slot.h - 24;
    ctx.fillText(!battle ? '' : ready ? '▼ 당기기' : g.ui.phase === 'spinning' ? '…' : '잠김', cx, ly + (ready ? Math.sin(g.rt * 6) * 2 : 0));
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
    this.drawStamps(g);
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
      this.drawCutin(g);
      this.drawCard(g);
    } else {
      this.drawMachine(g);
    }
    g.uiFx.drawWorld(ctx);
    g.uiFx.drawTexts(ctx, FONTS);
    if (g.mode === 'battle') this.drawCoinFlies(g);
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
      const col = pv.gild ? '#ffd84a' : SYMBOLS[pv.symbol]?.fx || '#fff';
      const lanes = pv.global ? [0, 1, 2] : pv.lanes || [pv.lane];
      for (const ln of lanes) {
        lanePoly(ln);
        ctx.fillStyle = mix(col.length === 7 ? col : '#ffffff', '#000000', 0) .replace('rgb', 'rgba').replace(')', `,${(ln === pv.lane ? 0.16 : 0.08) * (pv.gild ? 2.2 : 1)})`);
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
    // 목표 "세 갈래": 레인마다 처치 수를 바닥에 표시
    if (g.st && g.mode === 'battle' && g.st.def.objective.type === 'lanes') {
      const need = g.st.def.objective.need;
      for (let ln = 0; ln < 3; ln++) {
        const k = Math.min(need, g.st.laneKills[ln]);
        const done = k >= need;
        const lx = L.cx + (ln - 1) * LANE_SPACING;
        const ly = L.fieldBottom + 9;
        ctx.fillStyle = done ? 'rgba(20,70,40,0.92)' : 'rgba(20,12,28,0.92)';
        ctx.strokeStyle = done ? '#7dffa0' : '#ffd27a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(lx - 26, ly - 10, 52, 20, 10);
        ctx.fill();
        ctx.stroke();
        ctx.font = `13px ${FONTS.num}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = done ? '#7dffa0' : '#ffd27a';
        ctx.fillText(done ? '완료' : `${k}/${need}`, lx, ly + 1);
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
    if (g.omenMark && g.omenMark.lane != null && g.omenMark.id == null) {
      const p = cellPos(L, g.omenMark.lane, 0);
      drawGlow(ctx, p.x, p.y - 20, 36, '#a050ff', 0.5 + Math.sin(t * 5) * 0.2);
      this.drawOmenTag(p.x, p.y - 18, g.omenMark.short, g);
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
    k *= 1 + (v.pop || 0) * 0.16;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const y = p.y - (v.knock || 0) + (v.lunge || 0) * 34 * p.s;
    const a = {
      t: v.t, flash: v.flash, frozen: v.frozen > 0, fury: v.fury > 0, exposed: v.exposed, poison: v.poison > 0,
      squash: v.squash, hop: (v.hop || 0) * p.s, lean: (v.lean || 0) + (v.kick || 0),
    };
    if (v.dying > 0) a.flash = Math.max(a.flash || 0, 1 - v.dying);
    if (v.type === 'kasa') drawKasa(ctx, p.x, y, k, { ...a, close: v.close || 0 });
    else if (v.type === 'drum') drawDrum(ctx, p.x, y, k, { ...a, close: v.close || 0 });
    else if (v.type === 'mask') drawMask(ctx, p.x, y, k, { ...a, raise: v.raise || 0, slam: v.slam || 0, shield: v.shieldHp > 0, broken: v.shieldBroken || v.shieldHp === 1, braced: v.braced });
    else if (v.type === 'archer') drawArcher(ctx, p.x, y, k, { ...a, charge: v.chargeA || 0, puff: v.puff || 0 });
    else if (v.type === 'elder') drawElder(ctx, p.x, y, k * 0.7, { ...a, vulnerable: v.vulnerable, phase2: v.phase2, charge: v.charge });
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
    const headY = p.y - { kasa: 86, mask: 96, archer: 104, elder: 118, drum: 92 }[v.type] * k;
    if (it && (g.ui.phase === 'aim' || g.ui.phase === 'spin' || g.ui.phase === 'spinning' || g.ui.phase === 'busy')) {
      const foggy = g.st.def.mods.includes('fog') && v.row < 3;
      this.drawIntent(foggy ? { kind: 'unknown' } : it, p.x, headY, p.s, v, g);
    }
    // 상태 아이콘 줄
    const icons = [];
    if (v.frozen > 0) icons.push(['snow', '#9fdcff', v.frozen]);
    if (v.exposed) icons.push(['eye', '#c58cff', '빈틈']);
    if (v.fury > 0) icons.push(['heavy', '#ff5a5a', '공+' + v.fury]);
    if (v.poison > 0) icons.push(['drop', '#a6f04a', '독 ' + v.poison]);
    if (v.shieldHp > 0) icons.push(['shield', '#50f0be', '방패 ' + v.shieldHp]);
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
    if (g.omenMark && g.omenMark.id === v.id) this.drawOmenTag(p.x, headY - 24 * p.s - 8, g.omenMark.short, g);
  }

  drawIntent(it, x, y, s, v, g) {
    const ctx = this.ctx;
    let icon = null, col = '#ffffff', bg = 'rgba(20,12,28,0.9)', label = '';
    switch (it.kind) {
      case 'move':
        icon = 'move';
        col = '#d9e2ff';
        label = it.toLane != null ? (it.toLane > Math.round(v.lane) ? '오른쪽 ↘' : '↙ 왼쪽') : `${it.steps}칸 전진`;
        if (it.toLane != null) col = '#ffd0f0';
        break;
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
      case 'unknown': icon = 'dots'; col = '#b8a8d0'; label = '안개'; break;
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
      for (let i = 0; i < p.trail.length; i++) {
        const [tx, ty] = p.trail[i];
        const a = (i / p.trail.length) * 0.5 * p.alpha;
        drawGlow(ctx, tx, ty, p.size * (0.6 + i / p.trail.length), sym.fx2, a);
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = p.alpha;
      const s = p.size;
      if (p.sym === 'blade') {
        // 회전하며 날아가는 칼: 칼 모양이 또렷이 보이고, 회전 궤적이 원형 잔상으로 남는다
        const spin = g.time * 26;
        drawGlow(ctx, 0, 0, s * 3.4, '#8fa8ff', 0.75);
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = i === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(170,195,255,0.5)';
          ctx.lineWidth = 5 - i * 1.4;
          ctx.beginPath();
          ctx.arc(0, 0, s * (2.5 - i * 0.28), spin - 1.5 - i * 0.5, spin - 0.15 - i * 0.5);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, s * (2.5 - i * 0.28), spin + Math.PI - 1.5 - i * 0.5, spin + Math.PI - 0.15 - i * 0.5);
          ctx.stroke();
        }
        ctx.rotate(spin);
        // 칼날
        ctx.beginPath();
        ctx.moveTo(-s * 0.9, -s * 0.34);
        ctx.lineTo(s * 2.1, -s * 0.34);
        ctx.quadraticCurveTo(s * 2.7, -s * 0.2, s * 2.9, s * 0.3);
        ctx.lineTo(-s * 0.9, s * 0.3);
        ctx.closePath();
        const bg = ctx.createLinearGradient(0, -s * 0.4, 0, s * 0.4);
        bg.addColorStop(0, '#ffffff');
        bg.addColorStop(1, '#9fb4ff');
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = INK;
        ctx.lineJoin = 'round';
        ctx.stroke();
        // 코등이·자루
        ctx.fillStyle = '#d8a548';
        ctx.fillRect(-s * 1.1, -s * 0.7, s * 0.34, s * 1.4);
        ctx.strokeRect(-s * 1.1, -s * 0.7, s * 0.34, s * 1.4);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(-s * 2.1, -s * 0.24, s * 1.0, s * 0.48);
        ctx.strokeRect(-s * 2.1, -s * 0.24, s * 1.0, s * 0.48);
      } else if (p.sym === 'spark') {
        // 전격: 지지직거리며 달리는 번개 덩어리
        drawGlow(ctx, 0, 0, s * 3.2, '#ffe45c', 0.95);
        drawGlow(ctx, 0, 0, s * 1.6, '#ffffff', 1);
        ctx.lineJoin = 'round';
        const ph = Math.floor(g.rt * 30);
        for (let i = 0; i < 7; i++) {
          const a0 = ((i * 2.399 + ph * 1.7) % 6.283);
          const len = s * (1.6 + ((i * 7 + ph * 3) % 5) * 0.45);
          ctx.strokeStyle = i % 2 ? '#ffffff' : '#b77cff';
          ctx.lineWidth = i % 2 ? 2 : 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a0) * len * 0.5 + Math.sin(a0 * 3 + ph) * s * 0.5, Math.sin(a0) * len * 0.5 + Math.cos(a0 * 2 + ph) * s * 0.5);
          ctx.lineTo(Math.cos(a0) * len, Math.sin(a0) * len);
          ctx.stroke();
        }
      } else if (p.sym === 'counter') {
        // 초승달 검기: 넓은 날 + 뒤로 길게 끌리는 베기 자국
        ctx.rotate(p.ang + Math.PI / 2);
        const tail = ctx.createLinearGradient(0, 0, 0, s * 9);
        tail.addColorStop(0, p.sym === 'counter' ? 'rgba(255,216,74,0.7)' : 'rgba(190,210,255,0.7)');
        tail.addColorStop(1, 'rgba(190,210,255,0)');
        ctx.fillStyle = tail;
        ctx.beginPath();
        ctx.moveTo(-s * 1.7, s * 0.4);
        ctx.lineTo(0, s * 9);
        ctx.lineTo(s * 1.7, s * 0.4);
        ctx.closePath();
        ctx.fill();
        drawGlow(ctx, 0, 0, s * 2.8, sym.fx2, 0.9);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-s * 2.1, s * 0.6);
        ctx.quadraticCurveTo(0, -s * 1.7, s * 2.1, s * 0.6);
        ctx.quadraticCurveTo(0, -s * 0.45, -s * 2.1, s * 0.6);
        ctx.fill();
        ctx.strokeStyle = sym.fx2;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (p.sym === 'frost') {
        // 회전하는 눈 결정
        drawGlow(ctx, 0, 0, s * 3, '#7cc8ff', 0.9);
        ctx.rotate(g.time * 9);
        drawSymbol(ctx, 'frost', 0, 0, s * 1.7);
      } else if (p.sym === 'wave') {
        // 밀려가는 물결(겹겹의 호)
        ctx.rotate(p.ang + Math.PI / 2);
        drawGlow(ctx, 0, 0, s * 2.6, '#0fae8a', 0.8);
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = i === 0 ? '#eafff8' : i === 1 ? '#8fffe2' : '#2fd0a8';
          ctx.lineWidth = 6 - i * 1.5;
          ctx.globalAlpha = p.alpha * (1 - i * 0.25);
          ctx.beginPath();
          ctx.arc(0, s * 1.2 + i * 9, s * (2.2 - i * 0.15), Math.PI * 1.18, Math.PI * 1.82);
          ctx.stroke();
        }
      } else if (p.sym === 'venom') {
        // 독 방울
        ctx.rotate(p.ang + Math.PI / 2);
        drawGlow(ctx, 0, 0, s * 3, '#a6f04a', 0.85);
        const wob = Math.sin(g.rt * 22) * 0.16;
        ctx.scale(1 + wob, 1 - wob);
        drawSymbol(ctx, 'venom', 0, 0, s * 1.5);
      } else if (p.sym === 'fire' || p.sym === 'deflect') {
        const col = p.sym === 'deflect' ? '#ffd84a' : '#ff7a3d';
        drawGlow(ctx, 0, 0, s * 2.6, col, 1);
        ctx.fillStyle = '#fff4c0';
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.55, 0, TAU);
        ctx.fill();
      } else {
        drawGlow(ctx, 0, 0, s * 2, sym.fx, 1);
      }
      ctx.restore();
    }
  }

  // 명중 순간 떠오르는 큰 문양(어떤 기술이 맞았는지 한눈에)
  // 연결·빙고·잭팟 기술 발동 컷인: 무엇을 쓰는지 크게 보여준다
  drawCutin(g) {
    const c = g.cutin;
    if (!c) return;
    const ctx = this.ctx;
    const L = this.L;
    const age = (g.now() - c.t0) / c.dur;
    if (age >= 1) return;
    const inA = Math.min(1, age / 0.18);
    const outA = Math.min(1, (1 - age) / 0.2);
    const a = Math.min(inA, outA);
    const cy = L.fieldTop + L.fieldH * 0.5;
    const h = c.big ? 150 : 96;
    ctx.save();
    if (c.big) {
      ctx.fillStyle = `rgba(6,2,12,${0.55 * a})`;
      ctx.fillRect(0, L.hudH, W, L.info.y - L.hudH);
      // 방사형 빛줄기
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const an = (i / 14) * TAU + g.rt * 0.6;
        ctx.fillStyle = c.color;
        ctx.globalAlpha = 0.13 * a;
        ctx.beginPath();
        ctx.moveTo(W / 2, cy);
        ctx.lineTo(W / 2 + Math.cos(an - 0.07) * 620, cy + Math.sin(an - 0.07) * 620);
        ctx.lineTo(W / 2 + Math.cos(an + 0.07) * 620, cy + Math.sin(an + 0.07) * 620);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = a;
    // 비스듬한 띠
    const slide = (1 - easeOutBack(inA)) * -W;
    ctx.translate(slide, 0);
    const band = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    band.addColorStop(0, 'rgba(10,4,16,0.96)');
    band.addColorStop(0.5, 'rgba(46,22,40,0.96)');
    band.addColorStop(1, 'rgba(10,4,16,0.96)');
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.moveTo(-20, cy - h / 2 + 14);
    ctx.lineTo(W + 20, cy - h / 2 - 14);
    ctx.lineTo(W + 20, cy + h / 2 - 14);
    ctx.lineTo(-20, cy + h / 2 + 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    // 큰 문양
    const ix = 96;
    drawGlow(ctx, ix, cy, h * 0.75, c.color, 0.7);
    ctx.save();
    ctx.translate(ix, cy);
    ctx.rotate(-0.12 + Math.sin(g.rt * 8) * 0.04);
    ctx.fillStyle = SYMBOLS[c.sym]?.tint || '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.36, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#d8a548';
    ctx.stroke();
    drawSymbol(ctx, c.sym, 0, 0, h * 0.27);
    ctx.restore();
    // 글자
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `15px ${FONTS.ui}`;
    ctx.fillStyle = '#ffe08a';
    ctx.fillText(c.sub, 170, cy - (c.big ? 34 : 24));
    ctx.font = `${c.big ? 50 : 36}px ${FONTS.num}`;
    ctx.lineWidth = 7;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.strokeText(c.title, 168, cy + (c.big ? 12 : 8), W - 190);
    ctx.fillStyle = c.color;
    ctx.fillText(c.title, 168, cy + (c.big ? 12 : 8), W - 190);
    ctx.restore();
  }

  drawStamps(g) {
    const ctx = this.ctx;
    for (const s of g.stamps) {
      const k = s.life / s.max;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.6) * 0.92;
      ctx.translate(s.x, s.y - (1 - k) * 16);
      ctx.rotate(s.rot * (1 - k));
      drawSymbol(ctx, s.sym, 0, 0, s.size * (1.55 - k * 0.55));
      ctx.restore();
    }
  }

  drawOmenTag(x, y, text, g) {
    const ctx = this.ctx;
    const label = `↻ 다시 돌리면 ${text}`;
    ctx.font = `12px ${FONTS.ui}`;
    const w = ctx.measureText(label).width + 14;
    ctx.globalAlpha = 0.8 + Math.sin(g.rt * 5) * 0.2;
    ctx.fillStyle = 'rgba(60,20,100,0.92)';
    ctx.strokeStyle = '#c58cff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 9, w, 18, 9);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f0dcff';
    ctx.fillText(label, x, y + 1);
    ctx.globalAlpha = 1;
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
      let label = info.blocked ? (info.shieldLeft === 0 ? '방패 파괴!' : '방패에 금') : info.dmg ? `-${info.dmg}` : info.frozen ? '' : '';
      if (info.killed) label = '처치';
      const tags = [];
      if (info.tags.includes('shatter')) tags.push('파쇄');
      if (info.tags.includes('exposed')) tags.push('×2');
      if (info.tags.includes('weak')) tags.push('약점');
      if (info.frozen) tags.push('동결');
      if (info.poison) tags.push('중독');
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
    // 방어막 게이지(최대치까지 칸으로 표시)
    const cap = g.guardCap;
    const iy = y + 37;
    drawIcon(ctx, 'shield', x + 10, iy, 17, p.guard ? '#ffd27a' : 'rgba(255,255,255,0.35)');
    for (let i = 0; i < cap; i++) {
      ctx.fillStyle = INK;
      ctx.fillRect(x + 23 + i * 13, iy - 7, 11, 13);
      ctx.fillStyle = i < p.guard ? '#ffd27a' : '#3a2a3a';
      ctx.fillRect(x + 24 + i * 13, iy - 6, 9, 11);
    }
    ctx.font = `12px ${FONTS.ui}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = p.guard ? '#ffd27a' : 'rgba(255,255,255,0.5)';
    ctx.fillText(`방어막 ${p.guard}/${cap}`, x + 27 + cap * 13, iy + 1);
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
    // 조건(험한 길) · 남은 적
    ctx.font = `12.5px ${FONTS.ui}`;
    ctx.textBaseline = 'middle';
    if (st.def.mods.length) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ff9a8a';
      ctx.fillText('조건: ' + st.def.mods.map((m) => MODS[m].name).join(' · '), 14, this.L.hudH + 15);
    }
    const n = st.enemies.filter((e) => e.alive).length;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`남은 적 ${n}`, W - 12, this.L.hudH + 15);
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
    const CELL = REEL_CELL;
    const PEEK = REEL_PEEK;
    const shots = st && g.ui.phase !== 'spinning' && st.shots.length ? st.shots : null;
    const idle = ['enemy', 'react', 'counter', 'over', 'spin'].includes(g.ui.phase);
    const live = !!shots && !idle;
    const landed = g.reels.every((r) => !r.spinning);
    const aiming = live && g.ui.phase === 'aim';
    const selShot = aiming && g.ui.sel != null ? shots[g.ui.sel] : null;
    // 지금 고른 기술이 쓰는 칸(col,row) — 여기만 밝게, 나머지는 살짝 어둡게
    const selCells = new Set();
    if (selShot && !selShot.used) {
      if (selShot.bonus) {
        const ln = (st.bingos || []).find((b) => b.id === selShot.bonus);
        if (ln) for (const [c, r] of ln.cells) selCells.add(c + ',' + r);
      } else for (const c of selShot.reels) selCells.add(c + ',1');
    }
    const bingoCells = new Set();
    if (live && landed) for (const b of st.bingos || []) for (const [c, r] of b.cells) bingoCells.add(c + ',' + r);

    for (let i = 0; i < 3; i++) {
      const r = reelRect(L, i);
      const reel = g.reels[i];
      const strip = g.strips[i];
      const shotIdx = shots ? shots.findIndex((s) => s.reels.includes(i)) : -1;
      const shot = shotIdx >= 0 ? shots[shotIdx] : null;
      const used = shot && shot.used;
      const gilded = st && st.reels[i] && st.reels[i].gilded && !reel.spinning && live;
      const cy = r.y + r.h / 2;
      ctx.save();
      ctx.translate(0, (reel.bump || 0) * 9);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.clip();
      ctx.fillStyle = '#e2d3ac';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // 가운데 줄 = 이번 턴의 공격
      if (gilded && !used) {
        // 금빛: 칸 전체가 금으로 물들고 빛이 훑고 지나간다
        const gg = ctx.createLinearGradient(r.x, cy - CELL / 2, r.x + r.w, cy + CELL / 2);
        gg.addColorStop(0, '#fff2b0');
        gg.addColorStop(0.5, '#f6c64a');
        gg.addColorStop(1, '#d8952a');
        ctx.fillStyle = gg;
        ctx.fillRect(r.x, cy - CELL / 2, r.w, CELL);
        const sweep = ((g.rt * 0.9 + i * 0.3) % 1.6) - 0.3;
        const sx = r.x + sweep * r.w;
        const sg = ctx.createLinearGradient(sx - 26, 0, sx + 26, 0);
        sg.addColorStop(0, 'rgba(255,255,255,0)');
        sg.addColorStop(0.5, 'rgba(255,255,255,0.75)');
        sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, cy - CELL / 2, r.w, CELL);
        ctx.clip();
        ctx.transform(1, 0, -0.5, 1, 0, 0);
        ctx.fillStyle = sg;
        ctx.fillRect(sx - 26 + cy * 0.5, cy - CELL / 2, 52, CELL);
        ctx.restore();
      } else {
        ctx.fillStyle = '#f6ebcc';
        ctx.fillRect(r.x, cy - CELL / 2, r.w, CELL);
      }
      const blur = Math.min(1, Math.abs(reel.vel || 0) / 25);
      const base = Math.floor(reel.pos);
      for (let j = -3; j <= 3; j++) {
        const idx = base + j;
        const y = cy + (reel.pos - idx) * CELL;
        if (y < r.y - CELL || y > r.y + r.h + CELL) continue;
        const sym = strip[((idx % strip.length) + strip.length) % strip.length];
        const row = Math.round((y - cy) / CELL) + 1;
        const isMid = row === 1;
        const peek = row < 0 || row > 2; // 창 가장자리에 걸친 문양
        const inBingo = !peek && bingoCells.has(i + ',' + row);
        ctx.save();
        ctx.translate(r.x + r.w / 2, y);
        if (blur > 0.05) ctx.scale(1, 1 + blur * 0.7);
        ctx.globalAlpha = (1 - blur * 0.55) * (reel.spinning || isMid || inBingo ? 1 : peek ? 0.75 : 0.9);
        const gold = inBingo || (gilded && isMid && !used);
        ctx.fillStyle = gold && isMid && gilded ? '#fff6d0' : SYMBOLS[sym].tint;
        ctx.beginPath();
        ctx.arc(0, 0, 21, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = gold ? '#b8791a' : 'rgba(23,13,34,0.25)';
        ctx.lineWidth = gold ? 4 : 2;
        ctx.stroke();
        drawSymbol(ctx, sym, 0, 0, 16);
        ctx.restore();
      }
      // 금빛 반짝이
      if (gilded && !used) {
        for (let k = 0; k < 4; k++) {
          const ph = (g.rt * 1.3 + k * 0.27 + i * 0.4) % 1;
          const px = r.x + 12 + ((k * 37 + i * 19) % (r.w - 24));
          const py = cy - CELL / 2 + 8 + ((k * 23) % (CELL - 16));
          ctx.globalAlpha = Math.sin(ph * Math.PI);
          drawIcon(ctx, 'spark4', px, py, 10 + Math.sin(ph * Math.PI) * 6, '#ffffff');
        }
        ctx.globalAlpha = 1;
      }
      // 위·아래 줄: 살짝만 어둡게(잘 보이도록)
      const sh = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      // 둥근 통 느낌: 위·아래 끝으로 갈수록 어두워진다(걸친 문양은 보이되 한 발 물러나 보이게)
      sh.addColorStop(0, 'rgba(20,8,12,0.72)');
      sh.addColorStop(PEEK / r.h, 'rgba(20,8,12,0.22)');
      sh.addColorStop(0.32, 'rgba(20,8,12,0)');
      sh.addColorStop(0.68, 'rgba(20,8,12,0)');
      sh.addColorStop(1 - PEEK / r.h, 'rgba(20,8,12,0.22)');
      sh.addColorStop(1, 'rgba(20,8,12,0.72)');
      ctx.fillStyle = sh;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(216,165,72,0.55)';
      ctx.fillRect(r.x, cy - CELL / 2 - 1, r.w, 2);
      ctx.fillRect(r.x, cy + CELL / 2 - 1, r.w, 2);
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
      if (shots && idle) {
        ctx.fillStyle = 'rgba(15,8,18,0.5)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      } else {
        if (used) {
          ctx.fillStyle = 'rgba(15,8,18,0.6)';
          ctx.fillRect(r.x, cy - CELL / 2, r.w, CELL);
        }
        // 고르지 않은 칸은 살짝 어둡게 → 지금 쏠 기술이 도드라진다
        if (selCells.size) {
          ctx.fillStyle = 'rgba(15,8,18,0.34)';
          for (let row = 0; row < 3; row++) {
            if (selCells.has(i + ',' + row)) continue;
            ctx.fillRect(r.x, r.y + PEEK + row * CELL, r.w, CELL);
          }
        }
      }
      if (reel.flashT > 0) {
        ctx.fillStyle = `rgba(255,255,255,${reel.flashT * 0.7})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      ctx.restore();
      // 틀
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = gilded && !used ? '#ffe08a' : '#d8a548';
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.stroke();
      if (gilded && !used) drawGlow(ctx, r.x + r.w / 2, cy, 80, '#ffd84a', 0.22 + Math.sin(g.rt * 4 + i) * 0.08);
      // 가운데 줄 눈금
      ctx.fillStyle = '#d8a548';
      for (const sx of [r.x - 2, r.x + r.w + 2]) {
        ctx.beginPath();
        ctx.moveTo(sx, cy - 7);
        ctx.lineTo(sx + (sx < r.x + 10 ? 8 : -8), cy);
        ctx.lineTo(sx, cy + 7);
        ctx.fill();
      }
      if (used && !idle) {
        ctx.save();
        ctx.translate(r.x + r.w / 2, cy);
        ctx.rotate(-0.2);
        ctx.strokeStyle = '#e2453c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-30, -16, 60, 32, 6);
        ctx.stroke();
        ctx.font = `20px ${FONTS.num}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e2453c';
        ctx.fillText('발사', 0, 1);
        ctx.restore();
      }
      ctx.restore();
    }

    // 고른 기술의 칸에 밝은 테두리("지금 이걸 쏜다")
    if (selCells.size) {
      const pulse = 0.7 + Math.sin(g.rt * 7) * 0.3;
      for (const key of selCells) {
        const [c, row] = key.split(',').map(Number);
        const r = reelRect(L, c);
        const y0 = r.y + PEEK + row * CELL;
        drawGlow(ctx, r.x + r.w / 2, y0 + CELL / 2, 62, selShot.gild ? '#ffd84a' : SYMBOLS[selShot.symbol].fx, 0.3 * pulse);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(r.x + 2, y0 + 2, r.w - 4, CELL - 4, 7);
        ctx.stroke();
        ctx.strokeStyle = selShot.gild ? '#ffd84a' : SYMBOLS[selShot.symbol].fx;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(r.x + 5, y0 + 5, r.w - 10, CELL - 10, 5);
        ctx.stroke();
      }
    }

    // 빙고 줄: 슬롯 칸을 직접 눌러 고른다
    if (live && landed) {
      const pulse = 0.65 + Math.sin(g.rt * 7) * 0.3;
      for (const b of st.bingos || []) {
        const si = shots.findIndex((s) => s.bonus === b.id);
        const sh = shots[si];
        if (!sh) continue;
        const sel = aiming && g.ui.sel === si && !sh.used;
        const a = slotCell(L, b.cells[0][0], b.cells[0][1]);
        const c = slotCell(L, b.cells[2][0], b.cells[2][1]);
        ctx.lineCap = 'round';
        const dimK = sh.used ? 0.25 : 1;
        for (const [w, col, al] of [[sel ? 18 : 12, '#ffb347', 0.35 * pulse], [sel ? 9 : 6, '#ffe08a', 0.8 * pulse], [sel ? 3.5 : 2.5, '#ffffff', 0.9]]) {
          ctx.globalAlpha = al * dimK;
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (sh.used) continue;
        // 꼬리표: 고르기 전엔 "누르기", 고른 뒤엔 기술 이름
        const anchor = b.id === 'r0' || b.id === 'r2' ? slotCell(L, 1, b.cells[1][1]) : a;
        const ty = anchor.y + (b.cells[0][1] === 2 && b.id !== 'r2' ? -CELL / 2 + 10 : CELL / 2 - 10);
        const label = sel ? `▶ ${SHOT_NAMES[sh.symbol][sh.tier]}` : '빙고! 누르기';
        ctx.font = `13px ${FONTS.num}`;
        const tw = ctx.measureText(label).width + 16;
        ctx.fillStyle = sel ? '#ffe08a' : 'rgba(42,20,4,0.94)';
        ctx.strokeStyle = sel ? '#ffffff' : '#ffe08a';
        ctx.lineWidth = sel ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.roundRect(anchor.x - tw / 2, ty - 10, tw, 20, 10);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = sel ? '#2a1404' : '#ffe08a';
        ctx.fillText(label, anchor.x, ty + 1);
      }
    }

    // 가운데 줄 기술 이름패(연결은 묶어서)
    const r0 = reelRect(L, 0);
    const py = r0.y + r0.h + 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (live) {
      shots.forEach((sh, si) => {
        if (sh.bonus) return;
        const rs = sh.reels.map((i) => reelRect(L, i));
        const x0 = rs[0].x;
        const x1 = rs[rs.length - 1].x + rs[rs.length - 1].w;
        if (sh.tier >= 2) {
          const pulse = 0.6 + Math.sin(g.rt * 6) * 0.25;
          for (let k = 0; k < rs.length - 1; k++) {
            const ax = rs[k].x + rs[k].w;
            const bx = rs[k + 1].x;
            const yy = rs[k].y + rs[k].h / 2;
            drawGlow(ctx, (ax + bx) / 2, yy, 26, sh.tier === 3 ? '#ffd84a' : '#ff6a4a', pulse * (sh.used ? 0.3 : 1));
            ctx.strokeStyle = sh.tier === 3 ? '#ffe08a' : '#ff6a4a';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(ax - 6, yy);
            ctx.bezierCurveTo(ax + 3, yy - 7, bx - 3, yy + 7, bx + 6, yy);
            ctx.stroke();
          }
        }
        const sel = aiming && g.ui.sel === si && !sh.used;
        ctx.fillStyle = sh.used ? 'rgba(40,20,30,0.8)' : sel ? '#fff1b0' : sh.tier === 3 ? '#6a3a08' : sh.tier === 2 ? '#5a1a1a' : '#2a1626';
        ctx.strokeStyle = sel ? '#ffffff' : sh.tier >= 2 || sh.gild ? '#ffd27a' : 'rgba(216,165,72,0.6)';
        ctx.lineWidth = sel ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.roundRect(x0 + 3, py, x1 - x0 - 6, 25, 8);
        ctx.fill();
        ctx.stroke();
        ctx.font = `15px ${FONTS.num}`;
        ctx.fillStyle = sh.used ? 'rgba(255,255,255,0.35)' : sel ? '#2a1404' : sh.tier === 3 ? '#ffe08a' : sh.gild ? '#ffd27a' : '#fff';
        // 금빛 수치는 숫자로: "절단 ✦+1"
        ctx.fillText(SHOT_NAMES[sh.symbol][sh.tier] + (sh.gild ? ` ✦+${sh.gild}` : ''), (x0 + x1) / 2, py + 13, x1 - x0 - 12);
      });
    } else if (g.mode === 'battle') {
      ctx.font = `14px ${FONTS.ui}`;
      ctx.fillStyle = 'rgba(216,165,72,0.75)';
      const c = cabinetRect(L);
      const em = st ? st.player.embers : 0;
      const msg = g.ui.phase === 'spinning' ? '…' : g.ui.phase === 'spin' ? (em > 0 ? `레버를 당기세요 · 금빛 릴 ${em}개 대기` : '레버를 당기세요') : '적의 차례';
      ctx.fillText(msg, c.x + c.w / 2, py + 13);
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
    const w = W - 20;
    const y = L.info.y + 6;
    const portrait = !!(c.enemy || c.relic);
    const tx = x + (portrait ? 108 : 22);
    const tw = w - (tx - x) - 18;
    const lh = 23;
    // 줄 계산(카드 높이는 내용에 맞춘다)
    const rows = [];
    let hh = 0;
    for (const ln of c.lines) {
      ctx.font = `16px ${FONTS.num}`;
      const lw = ln.label ? ctx.measureText(ln.label).width + 10 : 0;
      ctx.font = `16px ${FONTS.ui}`;
      const wr = wrapText(ctx, ln.text, tw - lw);
      rows.push({ ln, lw, wr });
      hh += wr.length * lh + 7;
    }
    const h = Math.max(portrait ? 136 : 100, 66 + hh + 26);
    const a = Math.min(1, (g.now() - c.t0) / 160);
    ctx.save();
    ctx.globalAlpha = a;
    // 뒤(슬롯·버튼)를 어둡게 해서 카드에 집중
    ctx.fillStyle = 'rgba(8,4,14,0.6)';
    ctx.fillRect(0, L.info.y, W, L.H - L.info.y);
    ctx.translate(0, (1 - a) * 16);
    const pg = ctx.createLinearGradient(0, y, 0, y + h);
    pg.addColorStop(0, '#321a2a');
    pg.addColorStop(1, '#170b16');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = c.color || '#d8a548';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    if (portrait) {
      const px = x + 58;
      const pyy = y + 66;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(px, pyy, 42, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(216,165,72,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, pyy, 41, 0, TAU);
      ctx.clip();
      const t = g.rt;
      if (c.enemy === 'kasa') drawKasa(ctx, px, pyy + 36, 0.88, { t });
      else if (c.enemy === 'mask') drawMask(ctx, px, pyy + 38, 0.8, { t, shield: true });
      else if (c.enemy === 'drum') drawDrum(ctx, px, pyy + 36, 0.84, { t });
      else if (c.enemy === 'archer') drawArcher(ctx, px, pyy + 42, 0.84, { t });
      else if (c.enemy === 'elder') drawElder(ctx, px, pyy + 42, 0.52, { t });
      ctx.restore();
      if (c.relic) drawRelicIcon(ctx, c.relic, px, pyy, 26);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `13px ${FONTS.ui}`;
    ctx.fillStyle = '#d8a548';
    ctx.fillText(c.kicker || '', tx, y + 22);
    ctx.font = `24px ${FONTS.num}`;
    ctx.fillStyle = c.color || '#ffe08a';
    ctx.fillText(c.title, tx, y + 47, tw);
    let ly = y + 78;
    for (const { ln, lw, wr } of rows) {
      if (ln.label) {
        ctx.font = `16px ${FONTS.num}`;
        ctx.fillStyle = ln.color || '#ffd27a';
        ctx.fillText(ln.label, tx, ly);
      }
      ctx.font = `16px ${FONTS.ui}`;
      ctx.fillStyle = '#f3e9d6';
      wr.forEach((row, i) => ctx.fillText(row, tx + lw, ly + i * lh));
      ly += wr.length * lh + 7;
    }
    ctx.font = `12px ${FONTS.ui}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(c.more ? `눌러서 다음 (${c.more}개 더)` : '아무 곳이나 눌러 닫기', x + w - 14, y + h - 13);
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

export function drawRelicBadge(ctx, id, x, y, r, pulse = 0, level = 1) {
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
  drawRelicIcon(ctx, id, x, y, r * 0.62);
  if (level >= 2) {
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.roundRect(x + r * 0.1, y + r * 0.35, r * (level >= 3 ? 1.3 : 1.1), r * 0.75, r * 0.2);
    ctx.fill();
    ctx.font = `${Math.round(r * 0.7)}px ${FONTS.num}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2a1404';
    ctx.fillText(level >= 3 ? 'III' : 'II', x + r * (level >= 3 ? 0.75 : 0.65), y + r * 0.76);
  }
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

// 금화 한 닢(위에서 본 모습). squash: 날아가며 뒤집힐 때의 납작함(0~1)
export function drawCoin(ctx, x, y, r, rot = 0, squash = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(1.5, 2.5, r, r * 0.82 * squash, 0, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
  g.addColorStop(0, '#fff6c0');
  g.addColorStop(0.55, '#f0b82e');
  g.addColorStop(1, '#a86a12');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.82 * squash, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#6a4208';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  // 새겨진 무늬(닢마다 방향이 다르다)
  ctx.rotate(rot);
  ctx.strokeStyle = 'rgba(110,66,8,0.75)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-r * 0.42, -r * 0.2 * squash);
  ctx.lineTo(r * 0.42, r * 0.2 * squash);
  ctx.stroke();
  ctx.restore();
}
