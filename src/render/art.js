// 캐릭터·문양 벡터 아트 (Canvas 2D로 직접 그림)
// 공통 스타일: 굵은 먹 외곽선 + 평면 채색 + 한 단계 명암 + 발광 포인트

import { drawGlow } from './fx.js';

export const INK = '#170d22';
const TAU = Math.PI * 2;

// ───── 색 도우미 ─────
const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const h = hex.replace('#', '');
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    rgbCache.set(hex, v);
  }
  return v;
}
export function mix(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  return `rgb(${Math.round(x[0] + (y[0] - x[0]) * t)},${Math.round(x[1] + (y[1] - x[1]) * t)},${Math.round(x[2] + (y[2] - x[2]) * t)})`;
}
// 피격 플래시(흰색), 동결(얼음색) 상태를 색에 반영
function tinter(a) {
  const fl = Math.min(1, a.flash || 0);
    const fr = a.frozen ? 0.5 : 0;
  const po = a.poison ? 0.22 : 0;
  return (hex) => {
    let c = hex;
    if (po) c = mixHex(c, '#8fd63a', po);
    if (fr) c = mixHex(c, '#bfe6ff', fr);
    if (fl) c = mixHex(c, '#ffffff', fl);
    return c;
  };
}
function mixHex(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  const h = (n) => Math.round(n).toString(16).padStart(2, '0');
  return '#' + h(x[0] + (y[0] - x[0]) * t) + h(x[1] + (y[1] - x[1]) * t) + h(x[2] + (y[2] - x[2]) * t);
}

function ink(ctx, w) {
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}
function fillInk(ctx, fill, w) {
  ctx.fillStyle = fill;
  ctx.fill();
  ink(ctx, w);
}
function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}
function shadow(ctx, w, alpha = 0.38) {
  ctx.fillStyle = `rgba(5,2,15,${alpha})`;
  ellipse(ctx, 0, 0, w, w * 0.44);
  ctx.fill();
}
function frostOverlay(ctx, k, h) {
  ctx.save();
  const w = 36 * k;
  const top = -h * 1.05;
  // 얼음 덩어리
  ctx.beginPath();
  ctx.moveTo(-w, 4 * k);
  ctx.lineTo(-w * 1.08, top + 16 * k);
  ctx.lineTo(-w * 0.5, top);
  ctx.lineTo(w * 0.6, top + 4 * k);
  ctx.lineTo(w * 1.08, top + 22 * k);
  ctx.lineTo(w, 4 * k);
  ctx.closePath();
  const g = ctx.createLinearGradient(-w, top, w, 0);
  g.addColorStop(0, 'rgba(225,246,255,0.62)');
  g.addColorStop(0.5, 'rgba(140,205,255,0.4)');
  g.addColorStop(1, 'rgba(90,160,240,0.55)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2.4 * k;
  ctx.strokeStyle = '#e8f8ff';
  ctx.lineJoin = 'round';
  ctx.stroke();
  // 결·반사
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.moveTo(-w * 0.7, top + 22 * k);
  ctx.lineTo(-w * 0.35, top + 10 * k);
  ctx.moveTo(-w * 0.75, top + 36 * k);
  ctx.lineTo(-w * 0.15, top + 14 * k);
  ctx.stroke();
  // 눈 결정 표식
  ctx.translate(w * 0.5, top + 26 * k);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.6 * k;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, -9 * k);
    ctx.lineTo(0, 9 * k);
    ctx.moveTo(-3 * k, -6 * k);
    ctx.lineTo(0, -3.5 * k);
    ctx.lineTo(3 * k, -6 * k);
    ctx.moveTo(-3 * k, 6 * k);
    ctx.lineTo(0, 3.5 * k);
    ctx.lineTo(3 * k, 6 * k);
    ctx.stroke();
  }
  ctx.restore();
}

// ───── 우산 도깨비 ─────
// a: { t, flash, frozen, close(0~1 접힘), lean, squash, look, hop, fury, exposed }
export function drawKasa(ctx, x, y, k, a) {
  const T = tinter(a);
  const t = a.t || 0;
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 22 * k);
  const idleHop = a.frozen ? 0 : Math.max(0, Math.sin(t * 5.2)) * 4 * k;
  ctx.translate(0, -idleHop - (a.hop || 0));
  const sq = a.squash || 0;
  ctx.scale(1 + sq * 0.18, 1 - sq * 0.18);
  ctx.rotate((a.lean || 0) + (a.frozen ? 0 : Math.sin(t * 2.6) * 0.04));
  const close = a.close || 0;

  // 다리 + 게다
  ctx.beginPath();
  ctx.moveTo(0, -30 * k);
  ctx.quadraticCurveTo(4 * k, -16 * k, 0, -3 * k);
  ink(ctx, 7 * k);
  ctx.beginPath();
  ctx.moveTo(0, -30 * k);
  ctx.quadraticCurveTo(4 * k, -16 * k, 0, -3 * k);
  ctx.lineWidth = 3.6 * k;
  ctx.strokeStyle = T('#9a6a44');
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-10 * k, -5 * k, 20 * k, 5 * k, 2 * k);
  fillInk(ctx, T('#c78a52'), 2 * k);
  ctx.fillStyle = INK;
  ctx.fillRect(-7 * k, 0, 3 * k, 3 * k);
  ctx.fillRect(4 * k, 0, 3 * k, 3 * k);

  // 혀(우산 아래로 늘어짐)
  const tongueSwing = a.frozen ? 0 : Math.sin(t * 3.1) * 5 * k;
  const rim = -34 * k;
  ctx.beginPath();
  ctx.moveTo(-6 * k, rim + 2 * k);
  ctx.quadraticCurveTo(-7 * k + tongueSwing, rim + 20 * k, tongueSwing * 0.8, rim + 27 * k + close * 6 * k);
  ctx.quadraticCurveTo(7 * k + tongueSwing, rim + 20 * k, 6 * k, rim + 2 * k);
  fillInk(ctx, T('#ff6f91'), 2.4 * k);
  ctx.beginPath();
  ctx.moveTo(tongueSwing * 0.3, rim + 8 * k);
  ctx.lineTo(tongueSwing * 0.7, rim + 21 * k);
  ctx.lineWidth = 1.4 * k;
  ctx.strokeStyle = T('#c23d64');
  ctx.stroke();

  // 우산 갓
  const W = 40 * k * (1 - 0.48 * close);
  const H = 38 * k * (1 + 0.4 * close);
  const top = rim - H;
  const ribs = 7;
  const rimPts = [];
  for (let i = 0; i <= ribs; i++) {
    const u = i / ribs;
    rimPts.push([-W + 2 * W * u, rim + Math.sin(u * Math.PI) * 15 * k * (1 - close * 0.6)]);
  }
  const dome = () => {
    ctx.beginPath();
    ctx.moveTo(rimPts[0][0], rimPts[0][1]);
    ctx.bezierCurveTo(-W * 1.02, rim - H * 0.75, -W * 0.45, top, 0, top);
    ctx.bezierCurveTo(W * 0.45, top, W * 1.02, rim - H * 0.75, rimPts[ribs][0], rimPts[ribs][1]);
    for (let i = ribs; i > 0; i--) {
      const [x1, y1] = rimPts[i];
      const [x0, y0] = rimPts[i - 1];
      ctx.quadraticCurveTo((x0 + x1) / 2, Math.max(y0, y1) - 5 * k, x0, y0);
    }
    ctx.closePath();
  };
  const red = a.fury ? '#ff3b3b' : '#e2453c';
  dome();
  ctx.fillStyle = T(red);
  ctx.fill();
  // 패널 명암(번갈아)
  ctx.save();
  dome();
  ctx.clip();
  for (let i = 0; i < ribs; i += 2) {
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(rimPts[i][0], rimPts[i][1] + 6 * k);
    ctx.lineTo(rimPts[i + 1][0], rimPts[i + 1][1] + 6 * k);
    ctx.closePath();
    ctx.fillStyle = T('#b8302e');
    ctx.fill();
  }
  // 한지 하이라이트
  ctx.beginPath();
  ellipse(ctx, -W * 0.45, rim - H * 0.62, W * 0.22, H * 0.28, -0.5);
  ctx.fillStyle = 'rgba(255,220,190,0.28)';
  ctx.fill();
  ctx.restore();
  // 살: 꼭지(갓 윗면 한가운데)에서 테두리로 퍼진다
  const apexY = top + H * 0.24;
  ctx.lineWidth = 1.3 * k;
  ctx.strokeStyle = 'rgba(23,13,34,0.6)';
  for (let i = 0; i <= ribs; i++) {
    ctx.beginPath();
    ctx.moveTo(0, apexY);
    ctx.quadraticCurveTo(rimPts[i][0] * 0.62, (apexY + rimPts[i][1]) / 2 - H * 0.12, rimPts[i][0], rimPts[i][1]);
    ctx.stroke();
  }
  dome();
  ink(ctx, 3 * k);
  // 꼭지(위에서 보이는 둥근 마개)
  ellipse(ctx, 0, apexY, 5.5 * k, 4 * k);
  fillInk(ctx, T('#5a3a2a'), 2 * k);
  ellipse(ctx, -1.2 * k, apexY - 1 * k, 2 * k, 1.3 * k);
  ctx.fillStyle = T('#f3d38a');
  ctx.fill();
  // 눈
  const ey = rim - H * 0.3;
  const er = 11 * k * (1 - close * 0.25);
  ellipse(ctx, 0, ey, er, er * 1.1);
  fillInk(ctx, T('#fff6e6'), 2.6 * k);
  const lx = (a.look || 0) * 3 * k;
  ellipse(ctx, lx, ey + 3 * k, er * 0.55, er * 0.6);
  ctx.fillStyle = a.exposed ? '#a55cff' : a.fury ? '#ff2a2a' : INK;
  ctx.fill();
  ellipse(ctx, lx - 2 * k, ey + 0.5 * k, 2 * k, 2 * k);
  ctx.fillStyle = '#fff';
  ctx.fill();
  // 눈꺼풀(공격 준비 시 찡그림)
  if (close > 0.2 || a.fury) {
    ctx.beginPath();
    ctx.moveTo(-er * 1.2, ey - er * 0.9);
    ctx.lineTo(er * 1.2, ey - er * 0.2);
    ink(ctx, 3 * k);
  }
  // 입
  const my = rim + 4 * k;
  ctx.beginPath();
  ctx.moveTo(-12 * k * (1 - close * 0.4), my - 3 * k);
  ctx.quadraticCurveTo(0, my + 7 * k, 12 * k * (1 - close * 0.4), my - 3 * k);
  ctx.closePath();
  fillInk(ctx, '#3a0d18', 2 * k);
  ctx.fillStyle = '#fff6e6';
  for (const tx of [-6, 0, 6]) {
    ctx.beginPath();
    ctx.moveTo((tx - 2) * k * (1 - close * 0.4), my - 2 * k);
    ctx.lineTo(tx * k * (1 - close * 0.4), my + 1.5 * k);
    ctx.lineTo((tx + 2) * k * (1 - close * 0.4), my - 2 * k);
    ctx.fill();
  }
  if (a.frozen) frostOverlay(ctx, k, 60 * k);
  ctx.restore();
}

// ───── 탈 방패병 ─────
// a: { t, flash, frozen, raise(0~1), shield(bool), broken, exposed, braced, slam, fury }
export function drawMask(ctx, x, y, k, a) {
  const T = tinter(a);
  const t = a.t || 0;
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 30 * k);
  const sway = a.frozen ? 0 : Math.sin(t * 1.8) * 0.03;
  ctx.rotate(sway);
  const breathe = a.frozen ? 0 : Math.sin(t * 1.8) * 1.2 * k;

  // 도포(몸)
  ctx.beginPath();
  ctx.moveTo(-30 * k, 0);
  ctx.quadraticCurveTo(-30 * k, -40 * k, -16 * k, -58 * k - breathe);
  ctx.lineTo(16 * k, -58 * k - breathe);
  ctx.quadraticCurveTo(30 * k, -40 * k, 30 * k, 0);
  ctx.quadraticCurveTo(0, 6 * k, -30 * k, 0);
  fillInk(ctx, T('#352a64'), 3 * k);
  // 도포 주름·띠
  ctx.beginPath();
  ctx.moveTo(-26 * k, -20 * k);
  ctx.quadraticCurveTo(0, -14 * k, 26 * k, -20 * k);
  ctx.lineTo(26 * k, -14 * k);
  ctx.quadraticCurveTo(0, -8 * k, -26 * k, -14 * k);
  ctx.closePath();
  fillInk(ctx, T('#e2453c'), 2 * k);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2 * k;
  for (const fx of [-14, 0, 14]) {
    ctx.beginPath();
    ctx.moveTo(fx * k, -8 * k);
    ctx.lineTo(fx * 1.2 * k, -1 * k);
    ctx.stroke();
  }
  // 두건 머리(어둠 속 눈)
  // 어깨(위에서 보여 둥글게 넓다)
  ellipse(ctx, 0, -56 * k - breathe, 25 * k, 9 * k);
  fillInk(ctx, T('#3f3278'), 2.6 * k);
  ellipse(ctx, 0, -68 * k - breathe, 20 * k, 17 * k);
  fillInk(ctx, T('#231a46'), 3 * k);
  ellipse(ctx, -5 * k, -77 * k - breathe, 9 * k, 4.5 * k, -0.25);
  ctx.fillStyle = 'rgba(150,130,230,0.28)';
  ctx.fill();
  const eyeCol = a.braced || a.fury ? '#ff4d4d' : a.exposed ? '#c58cff' : '#ffd45a';
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 7 * k, -64 * k - breathe, 3.4 * k, a.exposed ? 4.5 * k : 2.4 * k);
    ctx.fillStyle = eyeCol;
    ctx.fill();
  }
  drawGlow(ctx, 0, -67 * k - breathe, 18 * k, eyeCol, 0.35);

  // 탈(방패) 위치
  const raise = a.raise || 0;
  const slam = a.slam || 0;
  let my = -40 * k - raise * 34 * k + slam * 14 * k;
  let mrot = raise * -0.15;
  if (a.exposed) { my += 12 * k; mrot = 0.45; }
  ctx.save();
  ctx.translate(a.exposed ? 16 * k : 0, my);
  ctx.rotate(mrot);
  if (a.braced || raise > 0.3) drawGlow(ctx, 0, 0, 52 * k, '#ff3b4e', 0.55 + Math.sin(t * 10) * 0.15);
  if (a.shield && !a.broken && !a.exposed) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 34 * k, 40 * k, 0, 0, TAU);
    ctx.strokeStyle = `rgba(80,240,190,${0.35 + Math.sin(t * 3) * 0.15})`;
    ctx.lineWidth = 4 * k;
    ctx.stroke();
  }
  // 손
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 28 * k, 6 * k, 7 * k, 6 * k);
    fillInk(ctx, T('#231a46'), 2.4 * k);
  }
  // 얼굴판
  ellipse(ctx, 0, 0, 27 * k, 32 * k);
  fillInk(ctx, T('#f5ecd9'), 3.4 * k);
  // 결(나무결)
  ctx.save();
  ellipse(ctx, 0, 0, 27 * k, 32 * k);
  ctx.clip();
  ctx.strokeStyle = 'rgba(160,120,80,0.18)';
  ctx.lineWidth = 1.2 * k;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-30 * k, i * 9 * k);
    ctx.bezierCurveTo(-10 * k, i * 9 * k - 4 * k, 10 * k, i * 9 * k + 4 * k, 30 * k, i * 9 * k);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(120,80,50,0.12)';
  ctx.fillRect(10 * k, -32 * k, 20 * k, 64 * k);
  ctx.restore();
  // 상투 머리털
  ctx.beginPath();
  ctx.moveTo(-16 * k, -26 * k);
  ctx.quadraticCurveTo(0, -42 * k, 16 * k, -26 * k);
  ctx.quadraticCurveTo(0, -31 * k, -16 * k, -26 * k);
  fillInk(ctx, INK, 1.5 * k);
  // 볼연지
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 15 * k, 7 * k, 5.5 * k, 4.5 * k);
    ctx.fillStyle = T('#ee5a4c');
    ctx.fill();
  }
  // 눈썹·눈(웃는 눈 / 성난 눈)
  const angry = a.braced || raise > 0.3;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    if (angry) {
      ctx.moveTo(s * 4 * k, -10 * k);
      ctx.lineTo(s * 17 * k, -16 * k);
    } else {
      ctx.moveTo(s * 5 * k, -15 * k);
      ctx.quadraticCurveTo(s * 11 * k, -20 * k, s * 18 * k, -14 * k);
    }
    ink(ctx, 3.4 * k);
    ctx.beginPath();
    if (angry) {
      ctx.moveTo(s * 5 * k, -4 * k);
      ctx.quadraticCurveTo(s * 11 * k, -9 * k, s * 16 * k, -5 * k);
    } else {
      ctx.moveTo(s * 5 * k, -5 * k);
      ctx.quadraticCurveTo(s * 11 * k, -11 * k, s * 16 * k, -5 * k);
    }
    ink(ctx, 2.6 * k);
  }
  // 코
  ctx.beginPath();
  ctx.moveTo(0, -3 * k);
  ctx.quadraticCurveTo(4 * k, 5 * k, 0, 7 * k);
  ink(ctx, 2 * k);
  // 입
  ctx.beginPath();
  ctx.moveTo(-14 * k, 12 * k);
  ctx.quadraticCurveTo(0, angry ? 18 * k : 26 * k, 14 * k, 12 * k);
  ctx.quadraticCurveTo(0, angry ? 22 * k : 18 * k, -14 * k, 12 * k);
  fillInk(ctx, '#3a0d18', 2.2 * k);
  ctx.fillStyle = '#fff6e6';
  ctx.fillRect(-8 * k, 13 * k, 16 * k, 2.4 * k);
  // 금
  if (a.broken) {
    ctx.beginPath();
    ctx.moveTo(-6 * k, -30 * k);
    ctx.lineTo(2 * k, -14 * k);
    ctx.lineTo(-4 * k, -2 * k);
    ctx.lineTo(6 * k, 10 * k);
    ctx.lineTo(0, 30 * k);
    ink(ctx, 2.4 * k);
    ctx.beginPath();
    ctx.moveTo(2 * k, -14 * k);
    ctx.lineTo(16 * k, -18 * k);
    ink(ctx, 1.8 * k);
  }
  ctx.restore();
  if (a.frozen) frostOverlay(ctx, k, 70 * k);
  ctx.restore();
}

// ───── 불씨 초롱 ─────
// a: { t, flash, frozen, charge(0~1), fury, exposed, puff }
export function drawArcher(ctx, x, y, k, a) {
  const T = tinter(a);
  const t = a.t || 0;
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 15 * k, 0.28);
  const fl = a.frozen ? 0 : Math.sin(t * 2.4) * 4 * k;
  const cy = -46 * k + fl;
  const ch = a.charge || 0;
  const glowCol = a.fury ? '#ff5a3a' : '#ffb347';
  drawGlow(ctx, 0, cy, (46 + ch * 26) * k, glowCol, a.frozen ? 0.2 : 0.55 + ch * 0.3);
  ctx.translate(0, cy);
  ctx.rotate(a.frozen ? 0 : Math.sin(t * 1.7) * 0.06 - ch * 0.12);
  const puff = 1 + (a.puff || 0) * 0.12 + ch * 0.06;
  ctx.scale(puff, 1 / puff);
  // 술(꼬리)
  const sw = a.frozen ? 0 : Math.sin(t * 3) * 5 * k;
  ctx.beginPath();
  ctx.moveTo(0, 24 * k);
  ctx.quadraticCurveTo(sw, 34 * k, sw * 1.4, 44 * k);
  ink(ctx, 3 * k);
  ctx.beginPath();
  ctx.moveTo(sw * 1.4 - 5 * k, 42 * k);
  ctx.lineTo(sw * 1.6, 56 * k);
  ctx.lineTo(sw * 1.4 + 5 * k, 42 * k);
  ctx.closePath();
  fillInk(ctx, T('#e2453c'), 2 * k);
  // 몸통
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-13 * k, -22 * k);
    ctx.bezierCurveTo(-26 * k, -18 * k, -26 * k, 18 * k, -13 * k, 22 * k);
    ctx.lineTo(13 * k, 22 * k);
    ctx.bezierCurveTo(26 * k, 18 * k, 26 * k, -18 * k, 13 * k, -22 * k);
    ctx.closePath();
  };
  body();
  const g = ctx.createRadialGradient(-4 * k, 0, 2 * k, 0, 0, 26 * k);
  g.addColorStop(0, T(a.frozen ? '#e8f6ff' : '#fff4c4'));
  g.addColorStop(0.55, T(a.fury ? '#ff8a4a' : '#ffbf52'));
  g.addColorStop(1, T(a.fury ? '#d0302a' : '#e0682a'));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  body();
  ctx.clip();
  ctx.strokeStyle = 'rgba(120,40,10,0.35)';
  ctx.lineWidth = 1.6 * k;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(0, i * 8.5 * k, 26 * k, 3 * k, 0, 0, Math.PI);
    ctx.stroke();
  }
  ctx.restore();
  body();
  ink(ctx, 3 * k);
  // 뚜껑·받침
  ctx.beginPath();
  ctx.roundRect(-14 * k, 20 * k, 28 * k, 8 * k, 3 * k);
  fillInk(ctx, T('#3a2418'), 2.4 * k);
  // 뚜껑(위에서 보여 둥근 판으로 보인다)
  ellipse(ctx, 0, -23 * k, 18 * k, 8 * k);
  fillInk(ctx, T('#3a2418'), 2.4 * k);
  ellipse(ctx, 0, -24.5 * k, 11 * k, 4.2 * k);
  ctx.fillStyle = T('#6a4630');
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -27 * k, 6 * k, Math.PI, 0);
  ink(ctx, 2.4 * k);
  // 얼굴(오려낸 눈과 입 — 안쪽 불빛)
  const angry = ch > 0.2 || a.fury;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 4 * k, angry ? -6 * k : -8 * k);
    ctx.lineTo(s * 13 * k, angry ? -11 * k : -9 * k);
    ctx.lineTo(s * 11 * k, -3 * k);
    ctx.quadraticCurveTo(s * 7 * k, -1 * k, s * 4 * k, angry ? -6 * k : -8 * k);
    ctx.fillStyle = '#4a1406';
    ctx.fill();
    ellipse(ctx, s * 9 * k, -5 * k, 1.8 * k, 1.8 * k);
    ctx.fillStyle = a.exposed ? '#d9a0ff' : '#fff8d0';
    ctx.fill();
  }
  const mo = 3 + ch * 6;
  ctx.beginPath();
  ctx.moveTo(-8 * k, 6 * k);
  ctx.lineTo(-4 * k, (6 + mo * 0.4) * k);
  ctx.lineTo(0, (6 + mo) * k);
  ctx.lineTo(4 * k, (6 + mo * 0.4) * k);
  ctx.lineTo(8 * k, 6 * k);
  ctx.quadraticCurveTo(0, 3 * k, -8 * k, 6 * k);
  ctx.fillStyle = '#4a1406';
  ctx.fill();
  if (ch > 0.1 && !a.frozen) drawGlow(ctx, 0, (8 + mo * 0.5) * k, (8 + ch * 10) * k, '#fff1a0', 0.9);
  ctx.restore();
  if (a.frozen) {
    ctx.save();
    ctx.translate(x, y);
    frostOverlay(ctx, k, 70 * k);
    ctx.restore();
  }
}

// ───── 등롱 장로 (보스) ─────
// a: { t, flash, frozen, vulnerable, phase2, charge, summon }
export function drawElder(ctx, x, y, k, a) {
  const T = tinter(a);
  const t = a.t || 0;
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 40 * k, 0.4);
  const fl = a.frozen ? 0 : Math.sin(t * 1.3) * 5 * k;
  ctx.translate(0, -12 * k + fl);
  const hot = a.phase2 ? '#ff5a6e' : '#ffb347';
  drawGlow(ctx, 0, -60 * k, 95 * k, hot, a.frozen ? 0.15 : 0.45);
  // 궤도 도깨비불(뒤쪽 반)
  const orbit = (front) => {
    for (let i = 0; i < 2; i++) {
      const ang = t * 1.6 + i * Math.PI;
      const z = Math.sin(ang);
      if ((z > 0) !== front) continue;
      const ox = Math.cos(ang) * 58 * k;
      const oy = -70 * k + z * 10 * k;
      const col = a.phase2 ? '#ff7a9a' : '#8fe0ff';
      drawGlow(ctx, ox, oy, 16 * k, col, 0.9);
      ellipse(ctx, ox, oy, 5 * k, 7 * k);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  };
  orbit(false);
  // 단(층) 그리기
  const tier = (cy0, w, h, col) => {
    const cy = cy0 * k;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5 * k, cy - h * 0.5 * k);
    ctx.bezierCurveTo(-w * 0.75 * k, cy - h * 0.3 * k, -w * 0.75 * k, cy + h * 0.3 * k, -w * 0.5 * k, cy + h * 0.5 * k);
    ctx.lineTo(w * 0.5 * k, cy + h * 0.5 * k);
    ctx.bezierCurveTo(w * 0.75 * k, cy + h * 0.3 * k, w * 0.75 * k, cy - h * 0.3 * k, w * 0.5 * k, cy - h * 0.5 * k);
    ctx.closePath();
    const g = ctx.createRadialGradient(0, cy, 2, 0, cy, w * 0.7 * k);
    g.addColorStop(0, T('#fff2c0'));
    g.addColorStop(0.6, T(col));
    g.addColorStop(1, T(a.phase2 ? '#8a1a3a' : '#b0401e'));
    ctx.fillStyle = g;
    ctx.fill();
    ink(ctx, 3.2 * k);
  };
  const roof = (cy0, w) => {
    const cy = cy0 * k;
    ctx.beginPath();
    ctx.moveTo(-w * 0.62 * k, cy + 3 * k);
    ctx.quadraticCurveTo(-w * 0.5 * k, cy - 3 * k, -w * 0.3 * k, cy - 6 * k);
    ctx.lineTo(w * 0.3 * k, cy - 6 * k);
    ctx.quadraticCurveTo(w * 0.5 * k, cy - 3 * k, w * 0.62 * k, cy + 3 * k);
    ctx.quadraticCurveTo(0, cy + 17 * k, -w * 0.62 * k, cy + 3 * k);
    ctx.closePath();
    fillInk(ctx, T('#2a1620'), 2.4 * k);
    ctx.beginPath();
    ctx.moveTo(-w * 0.5 * k, cy + 4 * k);
    ctx.quadraticCurveTo(0, cy + 13 * k, w * 0.5 * k, cy + 4 * k);
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = '#d8a548';
    ctx.stroke();
  };
  const c1 = a.phase2 ? '#ff7a6a' : '#ffb04a';
  tier(-22, 74, 40, c1);
  roof(-44, 84);
  tier(-66, 60, 38, c1);
  roof(-87, 70);
  tier(-104, 40, 30, c1);
  roof(-121, 52);
  // 꼭대기 장식
  ctx.beginPath();
  ctx.moveTo(0, -140 * k);
  ctx.lineTo(5 * k, -126 * k);
  ctx.lineTo(-5 * k, -126 * k);
  ctx.closePath();
  fillInk(ctx, '#d8a548', 2 * k);
  // 얼굴(가운데 단)
  const fy = -66 * k;
  for (const s of [-1, 1]) {
    // 늘어진 흰 눈썹
    ctx.beginPath();
    ctx.moveTo(s * 4 * k, fy - 12 * k);
    ctx.quadraticCurveTo(s * 18 * k, fy - 16 * k, s * 26 * k, fy - 2 * k + (a.frozen ? 0 : Math.sin(t * 2 + s) * 2 * k));
    ctx.lineWidth = 6 * k;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 3.4 * k;
    ctx.strokeStyle = '#f6f0e4';
    ctx.stroke();
    // 눈
    ctx.beginPath();
    if (s < 0 && !a.charge) {
      ctx.moveTo(-16 * k, fy - 4 * k);
      ctx.quadraticCurveTo(-10 * k, fy - 8 * k, -4 * k, fy - 4 * k);
      ink(ctx, 2.6 * k);
    } else {
      ellipse(ctx, s * 10 * k, fy - 5 * k, 5 * k, 5 * k);
      ctx.fillStyle = '#4a1406';
      ctx.fill();
      ellipse(ctx, s * 10 * k, fy - 5 * k, 2 * k, 2 * k);
      ctx.fillStyle = a.charge ? '#fff' : '#ffe08a';
      ctx.fill();
    }
  }
  // 수염(종이 띠)
  for (let i = -3; i <= 3; i++) {
    const sx = i * 5 * k;
    const sway = a.frozen ? 0 : Math.sin(t * 2.2 + i) * 3 * k;
    ctx.beginPath();
    ctx.moveTo(sx, fy + 6 * k);
    ctx.quadraticCurveTo(sx + sway, fy + 22 * k, sx + sway * 1.6, fy + 34 * k - Math.abs(i) * 3 * k);
    ctx.lineWidth = 5 * k;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 3 * k;
    ctx.strokeStyle = '#f6f0e4';
    ctx.stroke();
  }
  // 약점(등불 심장) — 충전 중 노출
  if (a.vulnerable) {
    const p = 0.75 + Math.sin(t * 9) * 0.25;
    drawGlow(ctx, 0, -22 * k, 42 * k * p, '#fff4a0', 0.95);
    ctx.beginPath();
    ctx.ellipse(0, -22 * k, 14 * k, 12 * k, 0, 0, TAU);
    ctx.fillStyle = '#fffbe0';
    ctx.fill();
    ctx.lineWidth = 2.4 * k;
    ctx.strokeStyle = '#ff9f1a';
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.roundRect(-12 * k, -30 * k, 24 * k, 16 * k, 4 * k);
    fillInk(ctx, T('#3a2418'), 2.4 * k);
    ctx.fillStyle = '#d8a548';
    ctx.fillRect(-1 * k, -30 * k, 2 * k, 16 * k);
  }
  orbit(true);
  if (a.frozen) frostOverlay(ctx, k * 1.6, 110 * k);
  ctx.restore();
}

// ───── 등지기 (플레이어, 뒷모습) ─────
// a: { t, pose: idle|cast|guard|dodge|hurt|counter, poseT(0~1), dir(-1..1), flash }
export function drawPlayer(ctx, x, y, k, a) {
  const t = a.t || 0;
  const pose = a.pose || 'idle';
  const pt = a.poseT ?? 1;
  const hurt = pose === 'hurt' ? 1 - pt : 0;
  const T = (c) => (a.flash ? mixHex(c, hurt ? '#ff6a6a' : '#ffffff', Math.min(1, a.flash)) : c);
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 26 * k, 0.45);
  const bob = Math.sin(t * 2.2) * 1.5 * k;
  let lean = (a.dir || 0) * 0.12;
  if (pose === 'hurt') lean += Math.sin(hurt * Math.PI) * 0.25;
  if (pose === 'dodge') lean += (a.dodgeDir || 1) * 0.3 * Math.sin(pt * Math.PI);
  ctx.translate(0, bob);
  ctx.rotate(lean);
  // 목도리 꼬리(바람에 펄럭)
  const wv = Math.sin(t * 4) * 6 * k;
  ctx.beginPath();
  ctx.moveTo(6 * k, -52 * k);
  ctx.bezierCurveTo(22 * k, -46 * k + wv * 0.4, 30 * k, -36 * k + wv, 40 * k, -40 * k + wv * 1.4);
  ctx.lineTo(36 * k, -30 * k + wv);
  ctx.bezierCurveTo(26 * k, -30 * k + wv * 0.6, 18 * k, -38 * k, 4 * k, -44 * k);
  ctx.closePath();
  fillInk(ctx, T('#33c79a'), 2.4 * k);
  // 다리
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(-12 * k, -12 * k, 9 * k, 12 * k, 2 * k);
  ctx.roundRect(3 * k, -12 * k, 9 * k, 12 * k, 2 * k);
  ctx.fill();
  // 도포(뒷모습)
  ctx.beginPath();
  ctx.moveTo(-14 * k, -52 * k);
  ctx.quadraticCurveTo(-26 * k, -28 * k, -24 * k, -8 * k);
  ctx.quadraticCurveTo(0, -4 * k, 24 * k, -8 * k);
  ctx.quadraticCurveTo(26 * k, -28 * k, 14 * k, -52 * k);
  ctx.closePath();
  fillInk(ctx, T('#2d3c78'), 3 * k);
  ctx.beginPath();
  ctx.moveTo(0, -50 * k);
  ctx.lineTo(0, -6 * k);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2 * k;
  ctx.stroke();
  ctx.fillStyle = T('#f3d38a');
  ctx.fillRect(-21 * k, -26 * k, 42 * k, 4 * k);
  // 목도리 둘레
  ctx.beginPath();
  ctx.roundRect(-14 * k, -56 * k, 28 * k, 9 * k, 4 * k);
  fillInk(ctx, T('#33c79a'), 2.4 * k);
  // 머리 뒤
  ellipse(ctx, 0, -62 * k, 10 * k, 9 * k);
  fillInk(ctx, T('#2a1a1a'), 2.4 * k);
  // 삿갓(위에서 내려다본 넓은 원뿔: 꼭지에서 테두리로 살이 퍼진다)
  const hatY = -66 * k;
  ellipse(ctx, 0, hatY, 37 * k, 21 * k);
  fillInk(ctx, T('#d9b26a'), 3 * k);
  ctx.save();
  ellipse(ctx, 0, hatY, 37 * k, 21 * k);
  ctx.clip();
  const apY = hatY - 7 * k;
  ctx.strokeStyle = 'rgba(120,80,30,0.45)';
  ctx.lineWidth = 1.2 * k;
  for (let i = 0; i < 16; i++) {
    const an = (i / 16) * TAU;
    ctx.beginPath();
    ctx.moveTo(0, apY);
    ctx.lineTo(Math.cos(an) * 40 * k, hatY + Math.sin(an) * 24 * k);
    ctx.stroke();
  }
  // 뒤쪽(화면 위쪽) 비탈은 조금 어둡게
  ctx.fillStyle = 'rgba(90,55,20,0.16)';
  ctx.fillRect(-40 * k, hatY - 24 * k, 80 * k, 17 * k);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(0, apY + 1 * k, 15 * k, 8.5 * k, 0, 0, TAU);
  ctx.lineWidth = 3 * k;
  ctx.strokeStyle = T('#8a3a2a');
  ctx.stroke();
  ellipse(ctx, 0, apY, 4 * k, 3 * k);
  fillInk(ctx, T('#b8894a'), 1.8 * k);

  // 지팡이 + 등불
  let sx = 22 * k, sy = -30 * k, ang = -0.15;
  if (pose === 'cast' || pose === 'counter') {
    const s = Math.sin(Math.min(1, pt) * Math.PI);
    ang = -0.15 - s * 0.5 + (a.dir || 0) * 0.3;
    sy -= s * 10 * k;
  }
  if (pose === 'guard') {
    ang = -1.45;
    sx = -2 * k;
    sy = -44 * k;
  }
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 34 * k);
  ctx.lineTo(0, -46 * k);
  ink(ctx, 6 * k);
  ctx.beginPath();
  ctx.moveTo(0, 34 * k);
  ctx.lineTo(0, -46 * k);
  ctx.lineWidth = 3 * k;
  ctx.strokeStyle = T('#8a5a3a');
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -46 * k);
  ctx.quadraticCurveTo(10 * k, -52 * k, 12 * k, -42 * k);
  ink(ctx, 2.4 * k);
  // 등불
  const lsw = Math.sin(t * 3) * 0.2;
  ctx.translate(12 * k, -42 * k);
  ctx.rotate(lsw - ang * 0.6);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 6 * k);
  ink(ctx, 1.6 * k);
  const glow = a.lanternGlow ?? 1;
  drawGlow(ctx, 0, 14 * k, 30 * k * (0.9 + glow * 0.3), '#ffb347', 0.6 + glow * 0.2);
  ctx.beginPath();
  ctx.moveTo(-6 * k, 7 * k);
  ctx.bezierCurveTo(-10 * k, 11 * k, -10 * k, 17 * k, -6 * k, 21 * k);
  ctx.lineTo(6 * k, 21 * k);
  ctx.bezierCurveTo(10 * k, 17 * k, 10 * k, 11 * k, 6 * k, 7 * k);
  ctx.closePath();
  ctx.fillStyle = '#ffe39a';
  ctx.fill();
  ink(ctx, 2 * k);
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(-6 * k, 5 * k, 12 * k, 3 * k);
  ctx.fillRect(-6 * k, 20 * k, 12 * k, 3 * k);
  ctx.restore();
  ctx.restore();
}

// ───── 슬롯 문양 ─────
export function drawSymbol(ctx, sym, x, y, r, opt = {}) {
  ctx.save();
  ctx.translate(x, y);
  const dim = opt.dim ? 0.35 : 1;
  ctx.globalAlpha *= dim;
  switch (sym) {
    case 'blade': {
      // 초승달 칼날 + 코등이
      ctx.rotate(-0.55);
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, r * 0.35);
      ctx.bezierCurveTo(-r * 0.4, -r * 0.55, r * 0.5, -r * 0.75, r * 1.0, -r * 0.2);
      ctx.bezierCurveTo(r * 0.45, -r * 0.42, -r * 0.3, -r * 0.2, -r * 0.62, r * 0.42);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -r, 0, r * 0.4);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#7f8fe6');
      ctx.fillStyle = g;
      ctx.fill();
      ink(ctx, r * 0.11);
      ctx.beginPath();
      ctx.roundRect(-r * 1.0, r * 0.25, r * 0.5, r * 0.3, r * 0.08);
      ctx.fillStyle = '#d8a548';
      ctx.fill();
      ink(ctx, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, r * 0.5);
      ctx.lineTo(-r * 1.25, r * 0.95);
      ctx.lineWidth = r * 0.22;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = r * 0.12;
      ctx.strokeStyle = '#e2453c';
      ctx.stroke();
      break;
    }
    case 'wave': {
      const crest = (oy, s) => {
        ctx.beginPath();
        ctx.moveTo(-r * s, oy + r * 0.25);
        ctx.bezierCurveTo(-r * s * 0.6, oy - r * 0.45, r * s * 0.2, oy - r * 0.6, r * s * 0.55, oy - r * 0.15);
        ctx.arc(r * s * 0.32, oy - r * 0.1, r * 0.22 * s, -0.2, Math.PI * 0.9, false);
        ctx.bezierCurveTo(r * s * 0.1, oy + r * 0.05, -r * s * 0.3, oy + r * 0.2, -r * s * 0.55, oy + r * 0.5);
        ctx.closePath();
      };
      crest(r * 0.35, 1.0);
      ctx.fillStyle = '#0fae8a';
      ctx.fill();
      ink(ctx, r * 0.1);
      crest(-r * 0.1, 0.8);
      ctx.fillStyle = '#4ff0c4';
      ctx.fill();
      ink(ctx, r * 0.1);
      ctx.beginPath();
      ctx.arc(r * 0.6, -r * 0.65, r * 0.12, 0, TAU);
      ctx.arc(r * 0.85, -r * 0.35, r * 0.08, 0, TAU);
      ctx.fillStyle = '#cff5e8';
      ctx.fill();
      break;
    }
    case 'frost': {
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i / 6) * TAU);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -r);
        ctx.moveTo(0, -r * 0.55);
        ctx.lineTo(-r * 0.28, -r * 0.8);
        ctx.moveTo(0, -r * 0.55);
        ctx.lineTo(r * 0.28, -r * 0.8);
        ctx.lineWidth = r * 0.26;
        ctx.strokeStyle = INK;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineWidth = r * 0.13;
        ctx.strokeStyle = '#7cc8ff';
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.lineTo(Math.sin(a) * r * 0.3, -Math.cos(a) * r * 0.3);
      }
      ctx.closePath();
      ctx.fillStyle = '#e8f8ff';
      ctx.fill();
      ink(ctx, r * 0.09);
      break;
    }
    case 'spark': {
      ctx.beginPath();
      ctx.moveTo(r * 0.25, -r * 1.0);
      ctx.lineTo(-r * 0.55, r * 0.1);
      ctx.lineTo(-r * 0.05, r * 0.1);
      ctx.lineTo(-r * 0.3, r * 1.0);
      ctx.lineTo(r * 0.6, -r * 0.18);
      ctx.lineTo(r * 0.08, -r * 0.18);
      ctx.closePath();
      ctx.fillStyle = '#ffe45c';
      ctx.fill();
      ctx.lineWidth = r * 0.13;
      ctx.strokeStyle = '#7b3fd0';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath();
      ctx.moveTo(r * 0.15, -r * 0.75);
      ctx.lineTo(-r * 0.3, 0);
      ctx.lineTo(-r * 0.15, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'venom': {
      // 독 방울 + 거품
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.05);
      ctx.bezierCurveTo(r * 0.2, -r * 0.5, r * 0.82, -r * 0.1, r * 0.72, r * 0.42);
      ctx.bezierCurveTo(r * 0.6, r * 1.05, -r * 0.6, r * 1.05, -r * 0.72, r * 0.42);
      ctx.bezierCurveTo(-r * 0.82, -r * 0.1, -r * 0.2, -r * 0.5, 0, -r * 1.05);
      const g = ctx.createRadialGradient(-r * 0.2, r * 0.1, 1, 0, r * 0.3, r);
      g.addColorStop(0, '#e6ff9a');
      g.addColorStop(0.55, '#8fd63a');
      g.addColorStop(1, '#3f7a14');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = r * 0.12;
      ctx.strokeStyle = '#4a1f7a';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.fillStyle = '#4a1f7a';
      for (const [bx, by, br] of [[-0.22, 0.3, 0.13], [0.24, 0.42, 0.1], [0.02, 0.62, 0.07]]) {
        ctx.beginPath();
        ctx.arc(bx * r, by * r, br * r, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, -r * 0.05, r * 0.1, r * 0.2, 0.5, 0, TAU);
      ctx.fill();
      break;
    }
    case 'lantern': {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.0);
      ctx.lineTo(0, -r * 0.7);
      ink(ctx, r * 0.1);
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r * 0.6);
      ctx.bezierCurveTo(-r * 0.85, -r * 0.4, -r * 0.85, r * 0.4, -r * 0.4, r * 0.6);
      ctx.lineTo(r * 0.4, r * 0.6);
      ctx.bezierCurveTo(r * 0.85, r * 0.4, r * 0.85, -r * 0.4, r * 0.4, -r * 0.6);
      ctx.closePath();
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 0.8);
      g.addColorStop(0, '#fff3c0');
      g.addColorStop(1, '#ff7a3d');
      ctx.fillStyle = g;
      ctx.fill();
      ink(ctx, r * 0.11);
      ctx.strokeStyle = 'rgba(140,40,10,0.5)';
      ctx.lineWidth = r * 0.06;
      for (const yy of [-0.25, 0.05, 0.35]) {
        ctx.beginPath();
        ctx.ellipse(0, yy * r, r * 0.72, r * 0.08, 0, 0, Math.PI);
        ctx.stroke();
      }
      ctx.fillStyle = '#3a2418';
      ctx.fillRect(-r * 0.45, -r * 0.72, r * 0.9, r * 0.16);
      ctx.fillRect(-r * 0.45, r * 0.56, r * 0.9, r * 0.16);
      ctx.beginPath();
      ctx.moveTo(0, r * 0.72);
      ctx.lineTo(0, r * 1.0);
      ctx.lineWidth = r * 0.12;
      ctx.strokeStyle = '#e2453c';
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// 작은 아이콘(예고 배지·HUD용)
export function drawIcon(ctx, kind, x, y, s, color = '#fff') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'move': {
      ctx.lineWidth = s * 0.22;
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, -s * 0.2);
      ctx.lineTo(0, s * 0.3);
      ctx.lineTo(s * 0.4, -s * 0.2);
      ctx.stroke();
      break;
    }
    case 'sword': {
      ctx.lineWidth = s * 0.2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, -s * 0.45);
      ctx.lineTo(s * 0.35, s * 0.35);
      ctx.moveTo(s * 0.45, -s * 0.45);
      ctx.lineTo(-s * 0.35, s * 0.35);
      ctx.stroke();
      break;
    }
    case 'heavy': {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(s * 0.45, s * 0.4);
      ctx.lineTo(-s * 0.45, s * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#2a0610';
      ctx.fillRect(-s * 0.06, -s * 0.18, s * 0.12, s * 0.32);
      ctx.fillRect(-s * 0.06, s * 0.2, s * 0.12, s * 0.1);
      break;
    }
    case 'target': {
      ctx.lineWidth = s * 0.14;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.38, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.12, 0, TAU);
      ctx.fill();
      break;
    }
    case 'snow': {
      ctx.lineWidth = s * 0.14;
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate((i / 3) * Math.PI);
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.45);
        ctx.lineTo(0, s * 0.45);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'shield': {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(s * 0.42, -s * 0.3);
      ctx.quadraticCurveTo(s * 0.4, s * 0.25, 0, s * 0.5);
      ctx.quadraticCurveTo(-s * 0.4, s * 0.25, -s * 0.42, -s * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'ember': {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.55);
      ctx.bezierCurveTo(s * 0.5, -s * 0.1, s * 0.42, s * 0.45, 0, s * 0.45);
      ctx.bezierCurveTo(-s * 0.42, s * 0.45, -s * 0.5, -s * 0.05, -s * 0.12, -s * 0.2);
      ctx.quadraticCurveTo(-s * 0.05, -s * 0.35, 0, -s * 0.55);
      ctx.fill();
      ctx.fillStyle = '#fff6c0';
      ctx.beginPath();
      ctx.ellipse(0, s * 0.2, s * 0.15, s * 0.2, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.45);
      ctx.bezierCurveTo(-s * 0.7, -s * 0.05, -s * 0.35, -s * 0.6, 0, -s * 0.2);
      ctx.bezierCurveTo(s * 0.35, -s * 0.6, s * 0.7, -s * 0.05, 0, s * 0.45);
      ctx.fill();
      break;
    }
    case 'plus': {
      ctx.lineWidth = s * 0.24;
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, 0);
      ctx.lineTo(s * 0.4, 0);
      ctx.moveTo(0, -s * 0.4);
      ctx.lineTo(0, s * 0.4);
      ctx.stroke();
      break;
    }
    case 'dots': {
      for (const dx of [-0.3, 0, 0.3]) {
        ctx.beginPath();
        ctx.arc(dx * s, 0, s * 0.09, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'eye': {
      ctx.lineWidth = s * 0.12;
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, 0);
      ctx.quadraticCurveTo(0, -s * 0.45, s * 0.5, 0);
      ctx.quadraticCurveTo(0, s * 0.45, -s * 0.5, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.15, 0, TAU);
      ctx.fill();
      break;
    }
    case 'bolt': {
      ctx.beginPath();
      ctx.moveTo(s * 0.1, -s * 0.5);
      ctx.lineTo(-s * 0.3, s * 0.05);
      ctx.lineTo(0, s * 0.05);
      ctx.lineTo(-s * 0.1, s * 0.5);
      ctx.lineTo(s * 0.3, -s * 0.08);
      ctx.lineTo(0, -s * 0.08);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'drop': {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.55);
      ctx.bezierCurveTo(s * 0.45, -s * 0.05, s * 0.4, s * 0.5, 0, s * 0.5);
      ctx.bezierCurveTo(-s * 0.4, s * 0.5, -s * 0.45, -s * 0.05, 0, -s * 0.55);
      ctx.fill();
      break;
    }
    case 'spark4': {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const rr = i % 2 ? s * 0.16 : s * 0.55;
        ctx.lineTo(Math.sin(a) * rr, -Math.cos(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'gear': {
      ctx.lineWidth = s * 0.16;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.26, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i / 8) * TAU);
        ctx.fillRect(-s * 0.08, -s * 0.5, s * 0.16, s * 0.18);
        ctx.restore();
      }
      break;
    }
  }
  ctx.restore();
}

const FUSION_PARTS = {
  glacier: ['frostbite', 'iceMirror'], tempest: ['thunderDrum', 'stormRune'], plague: ['venomFang', 'comboFlute'],
  duel: ['counterMirror', 'shadowShoes'], windfall: ['gamblerCoin', 'bingoBell'], gale: ['whetstone', 'tideBell'], torch: ['emberWick', 'oilFlask'],
};

export function drawRelicIcon(ctx, id, x, y, r) {
  if (FUSION_PARTS[id]) {
    drawRelicIcon(ctx, FUSION_PARTS[id][0], x - r * 0.36, y - r * 0.18, r * 0.74);
    drawRelicIcon(ctx, FUSION_PARTS[id][1], x + r * 0.36, y + r * 0.2, r * 0.74);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const ink2 = (w) => { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.stroke(); };
  switch (id) {
    case 'frostbite': { // 얼음 방울 + 눈 결정
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.9, -r * 0.1, r * 0.8, r * 0.95, 0, r * 0.95);
      ctx.bezierCurveTo(-r * 0.8, r * 0.95, -r * 0.9, -r * 0.1, 0, -r);
      ctx.fillStyle = '#9fdcff';
      ctx.fill();
      ink2(r * 0.12);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = r * 0.13;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const a = (i / 3) * Math.PI;
        ctx.moveTo(Math.cos(a) * r * 0.38, r * 0.25 + Math.sin(a) * r * 0.38);
        ctx.lineTo(-Math.cos(a) * r * 0.38, r * 0.25 - Math.sin(a) * r * 0.38);
        ctx.stroke();
      }
      break;
    }
    case 'thunderDrum': { // 북 + 번개
      ctx.beginPath();
      ctx.ellipse(0, r * 0.1, r * 0.9, r * 0.62, 0, 0, TAU);
      ctx.fillStyle = '#c0392b';
      ctx.fill();
      ink2(r * 0.12);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.12, r * 0.9, r * 0.5, 0, 0, TAU);
      ctx.fillStyle = '#f3e6c8';
      ctx.fill();
      ink2(r * 0.12);
      ctx.beginPath();
      ctx.moveTo(r * 0.12, -r * 0.62);
      ctx.lineTo(-r * 0.3, -r * 0.05);
      ctx.lineTo(0, -r * 0.05);
      ctx.lineTo(-r * 0.14, r * 0.42);
      ctx.lineTo(r * 0.34, -r * 0.2);
      ctx.lineTo(r * 0.04, -r * 0.2);
      ctx.closePath();
      ctx.fillStyle = '#ffd21e';
      ctx.fill();
      ink2(r * 0.08);
      break;
    }
    case 'counterMirror': { // 손거울 + 되돌아가는 화살
      ctx.beginPath();
      ctx.moveTo(0, r * 0.45);
      ctx.lineTo(0, r);
      ctx.lineWidth = r * 0.3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = r * 0.16;
      ctx.strokeStyle = '#d8a548';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r * 0.2, r * 0.72, 0, TAU);
      ctx.fillStyle = '#d8a548';
      ctx.fill();
      ink2(r * 0.12);
      ctx.beginPath();
      ctx.arc(0, -r * 0.2, r * 0.5, 0, TAU);
      ctx.fillStyle = '#dff4ff';
      ctx.fill();
      ctx.strokeStyle = '#3b46b0';
      ctx.lineWidth = r * 0.13;
      ctx.beginPath();
      ctx.arc(0, -r * 0.2, r * 0.26, -0.3, Math.PI * 1.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.12, -r * 0.52);
      ctx.lineTo(r * 0.3, -r * 0.28);
      ctx.lineTo(r * 0.02, -r * 0.22);
      ctx.stroke();
      break;
    }
    case 'gamblerCoin': { // 엽전
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.9, 0, TAU);
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#ffe08a');
      g.addColorStop(1, '#b07a1e');
      ctx.fillStyle = g;
      ctx.fill();
      ink2(r * 0.12);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.66, 0, TAU);
      ctx.strokeStyle = 'rgba(90,50,10,0.6)';
      ctx.lineWidth = r * 0.07;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillRect(-r * 0.26, -r * 0.26, r * 0.52, r * 0.52);
      break;
    }
    case 'emberWick': { // 불꽃
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.95, -r * 0.2, r * 0.8, r * 0.9, 0, r * 0.9);
      ctx.bezierCurveTo(-r * 0.8, r * 0.9, -r * 0.9, 0, -r * 0.25, -r * 0.35);
      ctx.quadraticCurveTo(-r * 0.1, -r * 0.6, 0, -r);
      ctx.fillStyle = '#ff8a2a';
      ctx.fill();
      ink2(r * 0.12);
      ctx.beginPath();
      ctx.ellipse(0, r * 0.38, r * 0.3, r * 0.42, 0, 0, TAU);
      ctx.fillStyle = '#fff3a0';
      ctx.fill();
      break;
    }
    case 'tideBell': { // 방울(종) + 물결
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, r * 0.35);
      ctx.bezierCurveTo(-r * 0.6, -r * 0.2, -r * 0.5, -r * 0.85, 0, -r * 0.85);
      ctx.bezierCurveTo(r * 0.5, -r * 0.85, r * 0.6, -r * 0.2, r * 0.75, r * 0.35);
      ctx.closePath();
      ctx.fillStyle = '#3fd9b0';
      ctx.fill();
      ink2(r * 0.12);
      ctx.beginPath();
      ctx.arc(0, r * 0.52, r * 0.17, 0, TAU);
      ctx.fillStyle = '#d8a548';
      ctx.fill();
      ink2(r * 0.08);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = r * 0.11;
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r * 0.05);
      ctx.quadraticCurveTo(-r * 0.2, -r * 0.3, 0, -r * 0.05);
      ctx.quadraticCurveTo(r * 0.2, r * 0.2, r * 0.4, -r * 0.05);
      ctx.stroke();
      break;
    }
    case 'whetstone': { // 숫돌 위 칼날
      ctx.beginPath();
      ctx.roundRect(-r * 0.85, r * 0.3, r * 1.7, r * 0.5, r * 0.12);
      ctx.fillStyle = '#8a8fa8';
      ctx.fill();
      ink2(r * 0.12);
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, r * 0.2);
      ctx.bezierCurveTo(-r * 0.3, -r * 0.7, r * 0.5, -r * 0.95, r * 0.9, -r * 0.6);
      ctx.bezierCurveTo(r * 0.4, -r * 0.65, -r * 0.1, -r * 0.3, -r * 0.5, r * 0.25);
      ctx.closePath();
      ctx.fillStyle = '#eef2ff';
      ctx.fill();
      ink2(r * 0.1);
      break;
    }
    case 'shadowShoes': { // 신 + 잔상
      ctx.strokeStyle = '#8fe8ff';
      ctx.lineWidth = r * 0.12;
      for (const yy of [-0.35, 0.05, 0.45]) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.95, yy * r);
        ctx.lineTo(-r * 0.5, yy * r);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, -r * 0.6);
      ctx.lineTo(r * 0.05, -r * 0.6);
      ctx.quadraticCurveTo(r * 0.15, -r * 0.05, r * 0.85, r * 0.2);
      ctx.quadraticCurveTo(r * 1.0, r * 0.6, r * 0.6, r * 0.62);
      ctx.lineTo(-r * 0.35, r * 0.62);
      ctx.closePath();
      ctx.fillStyle = '#3a4a8a';
      ctx.fill();
      ink2(r * 0.12);
      ctx.fillStyle = '#f3e6c8';
      ctx.fillRect(-r * 0.35, r * 0.42, r * 1.05, r * 0.14);
      break;
    }
    case 'venomFang': { // 독니
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.8);
      ctx.quadraticCurveTo(r * 0.5, -r * 0.6, r * 0.1, r * 0.95);
      ctx.quadraticCurveTo(-r * 0.1, -r * 0.1, -r * 0.6, -r * 0.8);
      ctx.fillStyle = '#f6f0e4';
      ctx.fill();
      ink2(r * 0.12);
      ctx.beginPath();
      ctx.moveTo(r * 0.5, r * 0.1);
      ctx.bezierCurveTo(r * 0.9, r * 0.5, r * 0.8, r * 0.95, r * 0.5, r * 0.95);
      ctx.bezierCurveTo(r * 0.2, r * 0.95, r * 0.1, r * 0.5, r * 0.5, r * 0.1);
      ctx.fillStyle = '#8fd63a';
      ctx.fill();
      ink2(r * 0.09);
      break;
    }
    case 'stormRune': { // 구름 + 번개
      ctx.beginPath();
      ctx.arc(-r * 0.4, -r * 0.2, r * 0.42, 0, TAU);
      ctx.arc(r * 0.1, -r * 0.45, r * 0.5, 0, TAU);
      ctx.arc(r * 0.5, -r * 0.1, r * 0.38, 0, TAU);
      ctx.fillStyle = '#8a7ad0';
      ctx.fill();
      ink2(r * 0.1);
      ctx.fillStyle = '#8a7ad0';
      ctx.fillRect(-r * 0.5, -r * 0.35, r * 1.0, r * 0.4);
      ctx.beginPath();
      ctx.moveTo(r * 0.15, r * 0.05);
      ctx.lineTo(-r * 0.3, r * 0.55);
      ctx.lineTo(0, r * 0.55);
      ctx.lineTo(-r * 0.18, r * 1.0);
      ctx.lineTo(r * 0.38, r * 0.4);
      ctx.lineTo(r * 0.08, r * 0.4);
      ctx.closePath();
      ctx.fillStyle = '#ffe45c';
      ctx.fill();
      ink2(r * 0.08);
      break;
    }
    case 'bingoBell': { // 금방울 + 별
      ctx.beginPath();
      ctx.arc(0, r * 0.1, r * 0.75, 0, TAU);
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#fff0b0');
      g.addColorStop(1, '#c8861e');
      ctx.fillStyle = g;
      ctx.fill();
      ink2(r * 0.12);
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, r * 0.25);
      ctx.lineTo(r * 0.5, r * 0.25);
      ctx.moveTo(0, r * 0.25);
      ctx.lineTo(0, r * 0.7);
      ctx.lineWidth = r * 0.1;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r * 0.82, r * 0.18, 0, TAU);
      ctx.fillStyle = '#e2453c';
      ctx.fill();
      ink2(r * 0.07);
      break;
    }
    case 'iceMirror': { // 얼음 거울
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.75, -r * 0.35);
      ctx.lineTo(r * 0.6, r * 0.7);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.6, r * 0.7);
      ctx.lineTo(-r * 0.75, -r * 0.35);
      ctx.closePath();
      const g = ctx.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#6ab8f0');
      ctx.fillStyle = g;
      ctx.fill();
      ink2(r * 0.12);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * 0.4);
      ctx.lineTo(r * 0.1, -r * 0.7);
      ctx.moveTo(-r * 0.35, 0);
      ctx.lineTo(r * 0.35, -r * 0.5);
      ctx.stroke();
      break;
    }
    case 'comboFlute': { // 피리 + 음표
      ctx.save();
      ctx.rotate(-0.6);
      ctx.beginPath();
      ctx.roundRect(-r * 0.95, -r * 0.16, r * 1.9, r * 0.32, r * 0.14);
      ctx.fillStyle = '#c9a46a';
      ctx.fill();
      ink2(r * 0.1);
      ctx.fillStyle = INK;
      for (const hx of [-0.4, -0.05, 0.3, 0.62]) {
        ctx.beginPath();
        ctx.arc(hx * r, 0, r * 0.07, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#ff9ac0';
      ctx.beginPath();
      ctx.ellipse(r * 0.45, r * 0.6, r * 0.2, r * 0.15, -0.4, 0, TAU);
      ctx.fill();
      ctx.fillRect(r * 0.58, r * 0.05, r * 0.08, r * 0.55);
      break;
    }
    case 'oilFlask': { // 호리병
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.95);
      ctx.lineTo(r * 0.2, -r * 0.95);
      ctx.lineTo(r * 0.2, -r * 0.45);
      ctx.bezierCurveTo(r * 0.95, -r * 0.1, r * 0.85, r * 0.95, 0, r * 0.95);
      ctx.bezierCurveTo(-r * 0.85, r * 0.95, -r * 0.95, -r * 0.1, -r * 0.2, -r * 0.45);
      ctx.closePath();
      ctx.fillStyle = '#ffb06a';
      ctx.fill();
      ink2(r * 0.12);
      ctx.beginPath();
      ctx.ellipse(0, r * 0.38, r * 0.5, r * 0.36, 0, 0, TAU);
      ctx.fillStyle = '#ffe9a8';
      ctx.fill();
      ctx.fillStyle = '#5a3a2a';
      ctx.fillRect(-r * 0.26, -r * 1.02, r * 0.52, r * 0.2);
      break;
    }
  }
  ctx.restore();
}

// ───── 북 도깨비 (지그재그 이동형) ─────
// a: { t, flash, frozen, close(0~1 북채 들어올림), lean, squash, hop, fury, exposed, poison }
export function drawDrum(ctx, x, y, k, a) {
  const T = tinter(a);
  const t = a.t || 0;
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 26 * k);
  const hop = a.frozen ? 0 : Math.abs(Math.sin(t * 6)) * 5 * k;
  ctx.translate(0, -hop - (a.hop || 0));
  const sq = a.squash || 0;
  ctx.scale(1 + sq * 0.16, 1 - sq * 0.16);
  ctx.rotate((a.lean || 0) + (a.frozen ? 0 : Math.sin(t * 3) * 0.06));
  const close = a.close || 0;
  // 다리
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(s * 11 * k - 5.5 * k, -11 * k, 11 * k, 11 * k, 4 * k);
    fillInk(ctx, T('#2a1a3a'), 2.4 * k);
  }
  // 북채 든 팔
  const wig = a.frozen ? 0 : Math.sin(t * 9) * 0.35;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * 28 * k, -44 * k);
    ctx.rotate(s * (0.9 - close * 1.5) + (s > 0 ? wig : -wig) * (1 - close));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -26 * k);
    ink(ctx, 6 * k);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -26 * k);
    ctx.lineWidth = 3 * k;
    ctx.strokeStyle = T('#c78a52');
    ctx.stroke();
    ellipse(ctx, 0, -28 * k, 5.5 * k, 5.5 * k);
    fillInk(ctx, T('#f3e6c8'), 2 * k);
    ctx.restore();
  }
  // 북통 옆면(위에서 내려다보아 아래쪽으로 두께가 보인다)
  ellipse(ctx, 0, -33 * k, 31 * k, 27 * k);
  fillInk(ctx, T(a.fury ? '#8a1c16' : '#6a2418'), 3.2 * k);
  ctx.strokeStyle = T('#e8c070');
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.ellipse(0, -31 * k, 27 * k, 23 * k, 0, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();
  // 북 몸통(나무 테)
  ellipse(ctx, 0, -42 * k, 31 * k, 29 * k);
  fillInk(ctx, T(a.fury ? '#c0281e' : '#9a3a2a'), 3.2 * k);
  // 금장 못
  ctx.fillStyle = T('#e8c070');
  for (let i = 0; i < 10; i++) {
    const an = (i / 10) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(an) * 27 * k, -42 * k + Math.sin(an) * 25 * k, 2 * k, 0, TAU);
    ctx.fill();
  }
  // 북 가죽(얼굴)
  ellipse(ctx, 0, -42 * k, 22.5 * k, 20.5 * k);
  fillInk(ctx, T('#f6ead0'), 2.4 * k);
  // 뿔
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 12 * k, -67 * k);
    ctx.lineTo(s * 20 * k, -82 * k);
    ctx.lineTo(s * 23 * k, -64 * k);
    ctx.closePath();
    fillInk(ctx, T('#ffd27a'), 2.2 * k);
  }
  // 눈
  const angry = close > 0.2 || a.fury;
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 9 * k, -46 * k, 5 * k, 6 * k);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ink(ctx, 1.8 * k);
    ellipse(ctx, s * 9 * k, -45 * k, 2.4 * k, 3 * k);
    ctx.fillStyle = a.exposed ? '#a55cff' : INK;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 3 * k, angry ? -51 * k : -54 * k);
    ctx.lineTo(s * 15 * k, angry ? -56 * k : -54 * k);
    ink(ctx, 2.6 * k);
  }
  // 입
  ctx.beginPath();
  ctx.moveTo(-11 * k, -35 * k);
  ctx.quadraticCurveTo(0, -24 * k, 11 * k, -35 * k);
  ctx.closePath();
  fillInk(ctx, '#3a0d18', 2 * k);
  ctx.fillStyle = '#fff6e6';
  for (const tx of [-7, 7]) {
    ctx.beginPath();
    ctx.moveTo((tx - 2.5) * k, -35 * k);
    ctx.lineTo(tx * k, -29 * k);
    ctx.lineTo((tx + 2.5) * k, -35 * k);
    ctx.fill();
  }
  if (a.frozen) frostOverlay(ctx, k, 62 * k);
  ctx.restore();
}

// ───── 상점 주인: 보따리 도깨비 ─────
// 큰 보따리를 멘 느긋한 도깨비. mood: 'idle' | 'happy' | 'sorry'
export function drawMerchant(ctx, x, y, k, mood = 'idle', t = 0) {
  ctx.save();
  ctx.translate(x, y);
  const bob = Math.sin(t * 2.2) * 1.5 * k;
  ctx.translate(0, bob);
  // 보따리(등 뒤)
  ctx.beginPath();
  ctx.ellipse(-20 * k, -46 * k, 34 * k, 30 * k, -0.2, 0, TAU);
  fillInk(ctx, '#7a4a8a', 3 * k);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2 * k;
  for (const a of [-0.5, 0, 0.5]) {
    ctx.beginPath();
    ctx.arc(-20 * k, -46 * k, 22 * k, a - 0.3, a + 0.3);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(-34 * k, -74 * k, 9 * k, 6 * k, -0.4, 0, TAU);
  fillInk(ctx, '#9a62aa', 2.4 * k);
  // 몸(도포)
  ctx.beginPath();
  ctx.moveTo(-26 * k, 0);
  ctx.quadraticCurveTo(-30 * k, -40 * k, -12 * k, -52 * k);
  ctx.lineTo(18 * k, -52 * k);
  ctx.quadraticCurveTo(34 * k, -40 * k, 30 * k, 0);
  ctx.closePath();
  fillInk(ctx, '#2f6a5a', 3 * k);
  ctx.fillStyle = '#f3d38a';
  ctx.fillRect(-25 * k, -22 * k, 54 * k, 5 * k);
  // 멜빵 끈
  ctx.beginPath();
  ctx.moveTo(-8 * k, -52 * k);
  ctx.lineTo(-20 * k, -14 * k);
  ctx.lineWidth = 5 * k;
  ctx.strokeStyle = '#5a3a2a';
  ctx.stroke();
  // 머리
  ellipse(ctx, 4 * k, -70 * k, 24 * k, 21 * k);
  fillInk(ctx, '#e8a06a', 3 * k);
  // 뿔 하나 + 머리털
  ctx.beginPath();
  ctx.moveTo(-2 * k, -89 * k);
  ctx.lineTo(4 * k, -108 * k);
  ctx.lineTo(11 * k, -89 * k);
  ctx.closePath();
  fillInk(ctx, '#fff0c0', 2.4 * k);
  ctx.beginPath();
  ctx.moveTo(-18 * k, -80 * k);
  ctx.quadraticCurveTo(4 * k, -98 * k, 26 * k, -80 * k);
  ctx.quadraticCurveTo(4 * k, -86 * k, -18 * k, -80 * k);
  fillInk(ctx, INK, 1.5 * k);
  // 눈
  for (const s of [-1, 1]) {
    const ex = 4 * k + s * 9 * k;
    ctx.beginPath();
    if (mood === 'happy') {
      ctx.moveTo(ex - 5 * k, -70 * k);
      ctx.quadraticCurveTo(ex, -77 * k, ex + 5 * k, -70 * k);
      ink(ctx, 2.6 * k);
    } else {
      ellipse(ctx, ex, -71 * k, 4 * k, mood === 'sorry' ? 3 * k : 5 * k);
      ctx.fillStyle = INK;
      ctx.fill();
      ellipse(ctx, ex - 1 * k, -73 * k, 1.4 * k, 1.4 * k);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
    // 눈썹
    ctx.beginPath();
    ctx.moveTo(ex - 6 * k, (mood === 'sorry' ? -78 : -80) * k + (mood === 'sorry' ? s * 2 * k : 0));
    ctx.lineTo(ex + 6 * k, (mood === 'sorry' ? -78 : -80) * k - (mood === 'sorry' ? s * 2 * k : 0));
    ink(ctx, 2.4 * k);
  }
  // 볼
  ctx.fillStyle = 'rgba(226,69,60,0.45)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(4 * k + s * 16 * k, -62 * k, 4.5 * k, 3.2 * k, 0, 0, TAU);
    ctx.fill();
  }
  // 입(송곳니 하나)
  ctx.beginPath();
  if (mood === 'sorry') {
    ctx.moveTo(-3 * k, -58 * k);
    ctx.quadraticCurveTo(4 * k, -61 * k, 11 * k, -58 * k);
    ink(ctx, 2.4 * k);
  } else {
    ctx.moveTo(-5 * k, -61 * k);
    ctx.quadraticCurveTo(4 * k, mood === 'happy' ? -48 * k : -53 * k, 13 * k, -61 * k);
    ctx.closePath();
    fillInk(ctx, '#3a0d18', 2.2 * k);
    ctx.fillStyle = '#fff6e6';
    ctx.beginPath();
    ctx.moveTo(7 * k, -61 * k);
    ctx.lineTo(9 * k, -56 * k);
    ctx.lineTo(11 * k, -61 * k);
    ctx.fill();
  }
  // 손 + 금화
  ellipse(ctx, 34 * k, -30 * k, 8 * k, 7 * k);
  fillInk(ctx, '#e8a06a', 2.4 * k);
  ctx.beginPath();
  ctx.ellipse(36 * k, -42 * k, 8 * k, 6.5 * k, 0, 0, TAU);
  fillInk(ctx, '#f0b82e', 2 * k);
  ctx.beginPath();
  ctx.moveTo(32 * k, -43 * k);
  ctx.lineTo(40 * k, -41 * k);
  ctx.lineWidth = 1.6 * k;
  ctx.strokeStyle = '#8a5a10';
  ctx.stroke();
  ctx.restore();
}

// ───── 폭죽 도깨비 ─────
// 등에 폭죽 다발을 멘 둥근 도깨비(위에서 비스듬히 내려다본 모습). 쓰러지면 터진다.
export function drawBomber(ctx, x, y, k, a) {
  const T = tinter(a);
  const t = a.t || 0;
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 24 * k);
  const bob = a.frozen ? 0 : Math.abs(Math.sin(t * 5)) * 3 * k;
  ctx.translate(0, -bob - (a.hop || 0));
  const sq = a.squash || 0;
  ctx.scale(1 + sq * 0.16, 1 - sq * 0.16);
  ctx.rotate((a.lean || 0) + (a.frozen ? 0 : Math.sin(t * 2.4) * 0.05));
  const close = a.close || 0;
  // 등에 멘 폭죽 다발(뒤쪽 = 화면 위쪽)
  const tubes = [[-13, '#d8342c'], [0, '#f0b83a'], [13, '#d8342c']];
  for (const [tx, col] of tubes) {
    ctx.save();
    ctx.translate(tx * k, -62 * k);
    ctx.rotate(tx * 0.012);
    ctx.beginPath();
    ctx.roundRect(-6 * k, -22 * k, 12 * k, 34 * k, 3 * k);
    fillInk(ctx, T(col), 2.4 * k);
    ctx.fillStyle = T('#fff2c8');
    ctx.fillRect(-6 * k, -8 * k, 12 * k, 4 * k);
    ellipse(ctx, 0, -22 * k, 6 * k, 2.6 * k);
    fillInk(ctx, T('#5a3a2a'), 1.8 * k);
    ctx.restore();
  }
  // 심지와 불꽃
  ctx.beginPath();
  ctx.moveTo(0, -84 * k);
  ctx.quadraticCurveTo(8 * k, -94 * k, 3 * k, -100 * k);
  ctx.lineWidth = 2.2 * k;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (!a.frozen) {
    const fl = 0.7 + Math.sin(t * 22) * 0.3 + close * 0.6;
    drawGlow(ctx, 3 * k, -101 * k, 12 * k * fl, '#ffb347', 0.9);
    ctx.fillStyle = '#fff6c0';
    ctx.beginPath();
    ctx.arc(3 * k, -101 * k, 2.6 * k * fl, 0, TAU);
    ctx.fill();
  }
  // 발
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 12 * k, -4 * k, 8 * k, 5 * k);
    fillInk(ctx, T('#3a2030'), 2.2 * k);
  }
  // 몸(위에서 보아 짧고 둥글다)
  ellipse(ctx, 0, -24 * k, 25 * k, 20 * k);
  fillInk(ctx, T(a.fury ? '#ff5a3c' : '#e8663c'), 3 * k);
  // 멜빵
  ctx.beginPath();
  ctx.moveTo(-17 * k, -36 * k);
  ctx.lineTo(10 * k, -10 * k);
  ctx.moveTo(17 * k, -36 * k);
  ctx.lineTo(-10 * k, -10 * k);
  ctx.lineWidth = 3.4 * k;
  ctx.strokeStyle = T('#6a3a22');
  ctx.stroke();
  // 머리(정수리가 넓게 보인다)
  ellipse(ctx, 0, -46 * k, 23 * k, 19 * k);
  fillInk(ctx, T(a.fury ? '#ff7048' : '#f58a4a'), 3 * k);
  ellipse(ctx, -6 * k, -55 * k, 9 * k, 5 * k, -0.3);
  ctx.fillStyle = 'rgba(255,230,190,0.3)';
  ctx.fill();
  // 뿔
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 9 * k, -60 * k);
    ctx.lineTo(s * 16 * k, -73 * k);
    ctx.lineTo(s * 19 * k, -57 * k);
    ctx.closePath();
    fillInk(ctx, T('#fff2c8'), 2 * k);
  }
  // 얼굴(머리 아래쪽에 몰려 있다)
  const angry = close > 0.2 || a.fury;
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 9 * k, -42 * k, 5 * k, 5.5 * k);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ink(ctx, 1.8 * k);
    ellipse(ctx, s * 9 * k, -40.5 * k, 2.4 * k, 2.8 * k);
    ctx.fillStyle = a.exposed ? '#a55cff' : INK;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 3 * k, angry ? -46 * k : -49 * k);
    ctx.lineTo(s * 15 * k, angry ? -51 * k : -49 * k);
    ink(ctx, 2.4 * k);
  }
  ctx.beginPath();
  ctx.moveTo(-8 * k, -33 * k);
  ctx.quadraticCurveTo(0, -27 * k + close * 3 * k, 8 * k, -33 * k);
  ctx.closePath();
  fillInk(ctx, '#3a0d18', 1.8 * k);
  if (a.frozen) frostOverlay(ctx, k, 70 * k);
  ctx.restore();
}

// ───── 약탕 도깨비 ─────
// 김이 오르는 약탕기를 안고 있는 작은 도깨비. 다친 동료를 고친다.
export function drawHealer(ctx, x, y, k, a) {
  const T = tinter(a);
  const t = a.t || 0;
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 24 * k);
  const bob = a.frozen ? 0 : Math.sin(t * 3) * 2 * k;
  ctx.translate(0, -bob - (a.hop || 0));
  const sq = a.squash || 0;
  ctx.scale(1 + sq * 0.16, 1 - sq * 0.16);
  ctx.rotate((a.lean || 0) + (a.frozen ? 0 : Math.sin(t * 2) * 0.04));
  const close = a.close || 0;
  // 몸(도포)
  ctx.beginPath();
  ctx.moveTo(-22 * k, -2 * k);
  ctx.quadraticCurveTo(-26 * k, -34 * k, 0, -44 * k);
  ctx.quadraticCurveTo(26 * k, -34 * k, 22 * k, -2 * k);
  ctx.quadraticCurveTo(0, 5 * k, -22 * k, -2 * k);
  ctx.closePath();
  fillInk(ctx, T('#3f8f6a'), 3 * k);
  // 머리
  ellipse(ctx, 0, -58 * k, 21 * k, 18 * k);
  fillInk(ctx, T('#9ad88a'), 3 * k);
  ellipse(ctx, -6 * k, -66 * k, 8 * k, 4.5 * k, -0.3);
  ctx.fillStyle = 'rgba(255,255,230,0.3)';
  ctx.fill();
  // 정수리의 약초 잎
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(0, -74 * k);
    ctx.rotate(s * 0.6 + (a.frozen ? 0 : Math.sin(t * 3 + s) * 0.12));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 9 * k, -8 * k, s * 2 * k, -18 * k);
    ctx.quadraticCurveTo(-s * 5 * k, -8 * k, 0, 0);
    fillInk(ctx, T('#4fbf5a'), 2 * k);
    ctx.restore();
  }
  // 얼굴
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 8 * k, -54 * k, 4.2 * k, 5 * k);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ink(ctx, 1.7 * k);
    ellipse(ctx, s * 8 * k, -52.8 * k, 2 * k, 2.6 * k);
    ctx.fillStyle = a.exposed ? '#a55cff' : INK;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, -47 * k, 4 * k, 0.15 * Math.PI, 0.85 * Math.PI);
  ink(ctx, 2 * k);
  // 약탕기(위에서 보여 입구가 타원으로 보인다)
  const py = -22 * k - close * 8 * k;
  ctx.beginPath();
  ctx.moveTo(-20 * k, py - 4 * k);
  ctx.quadraticCurveTo(-24 * k, py + 20 * k, 0, py + 22 * k);
  ctx.quadraticCurveTo(24 * k, py + 20 * k, 20 * k, py - 4 * k);
  ctx.closePath();
  fillInk(ctx, T('#5a4a6a'), 3 * k);
  ellipse(ctx, 0, py - 4 * k, 20 * k, 8 * k);
  fillInk(ctx, T('#3a2f4a'), 2.6 * k);
  ellipse(ctx, 0, py - 3.5 * k, 16 * k, 5.6 * k);
  ctx.fillStyle = T('#7cf0a0');
  ctx.fill();
  // 손
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 22 * k, py + 4 * k, 5.5 * k, 5 * k);
    fillInk(ctx, T('#9ad88a'), 2 * k);
  }
  // 김
  if (!a.frozen) {
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.6 + i / 3) % 1;
      drawGlow(ctx, (i - 1) * 8 * k + Math.sin(t * 2 + i * 2) * 4 * k, py - 10 * k - u * 30 * k, (5 + u * 8) * k, '#b8ffd0', 0.5 * (1 - u));
    }
  }
  if (a.frozen) frostOverlay(ctx, k, 72 * k);
  ctx.restore();
}

// ───── 멧돼지 ─────
// 위에서 비스듬히 보아 등줄기가 길게 보인다. charge = 콧김을 뿜으며 돌진 준비, raise = 들이받기 직전
export function drawBoar(ctx, x, y, k, a) {
  const T = tinter(a);
  const t = a.t || 0;
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 30 * k);
  const charge = a.charge ? 1 : 0;
  const raise = a.raise || 0;
  const shake = a.frozen ? 0 : charge * Math.sin(t * 30) * 1.4 * k;
  ctx.translate(shake, -(a.hop || 0) - raise * 10 * k);
  const sq = a.squash || 0;
  ctx.scale(1 + sq * 0.14, 1 - sq * 0.14);
  ctx.rotate((a.lean || 0) * 0.6);
  const hot = a.fury || charge;
  // 꼬리
  ctx.beginPath();
  ctx.moveTo(0, -78 * k);
  ctx.quadraticCurveTo(8 * k, -90 * k, -2 * k, -92 * k);
  ink(ctx, 3 * k);
  // 몸통(등)
  ellipse(ctx, 0, -46 * k, 29 * k, 34 * k);
  fillInk(ctx, T(hot ? '#7a4a34' : '#6a4a3a'), 3.2 * k);
  // 등줄기 갈기
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const yy = (-74 + i * 9) * k;
    ctx.moveTo(-5 * k, yy + 5 * k);
    ctx.lineTo(0, yy - (3 + charge * 3) * k);
    ctx.lineTo(5 * k, yy + 5 * k);
  }
  ctx.lineWidth = 2.4 * k;
  ctx.strokeStyle = T('#2e1c18');
  ctx.lineJoin = 'round';
  ctx.stroke();
  // 앞발
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 19 * k, -5 * k, 7 * k, 5 * k);
    fillInk(ctx, T('#2e1c18'), 2.2 * k);
  }
  // 귀
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 13 * k, -40 * k);
    ctx.lineTo(s * 25 * k, -48 * k);
    ctx.lineTo(s * 22 * k, -31 * k);
    ctx.closePath();
    fillInk(ctx, T('#8a5a44'), 2.2 * k);
  }
  // 머리
  ellipse(ctx, 0, -24 * k, 22 * k, 19 * k);
  fillInk(ctx, T(hot ? '#8e5438' : '#80584a'), 3 * k);
  // 엄니
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 13 * k, -12 * k);
    ctx.quadraticCurveTo(s * 24 * k, -12 * k, s * 22 * k, -26 * k);
    ctx.quadraticCurveTo(s * 17 * k, -17 * k, s * 11 * k, -17 * k);
    ctx.closePath();
    fillInk(ctx, T('#fff6e0'), 2 * k);
  }
  // 코
  ellipse(ctx, 0, -11 * k, 11 * k, 8 * k);
  fillInk(ctx, T('#e8a090'), 2.6 * k);
  ctx.fillStyle = INK;
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 4 * k, -11 * k, 2 * k, 3 * k);
    ctx.fill();
  }
  // 눈
  for (const s of [-1, 1]) {
    ellipse(ctx, s * 10 * k, -29 * k, 3.6 * k, 4 * k);
    ctx.fillStyle = hot ? '#ff4030' : a.exposed ? '#a55cff' : '#fff';
    ctx.fill();
    ink(ctx, 1.6 * k);
    if (!hot) {
      ellipse(ctx, s * 10 * k, -28 * k, 1.8 * k, 2.2 * k);
      ctx.fillStyle = INK;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(s * 4 * k, -32 * k);
    ctx.lineTo(s * 16 * k, -36 * k);
    ink(ctx, 2.6 * k);
  }
  // 콧김
  if (charge && !a.frozen) {
    for (const s of [-1, 1]) {
      const u = (t * 2.2 + (s > 0 ? 0.5 : 0)) % 1;
      drawGlow(ctx, s * (8 + u * 16) * k, (-6 + u * 12) * k, (4 + u * 8) * k, '#ffffff', 0.7 * (1 - u));
    }
  }
  if (a.frozen) frostOverlay(ctx, k, 80 * k);
  ctx.restore();
}

// 정예 표시: 발밑의 금빛 테와 머리 위 작은 관
export function drawEliteRing(ctx, x, y, k, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= 0.75 + Math.sin(t * 4) * 0.25;
  ctx.lineWidth = 3 * k;
  ctx.strokeStyle = '#ffd84a';
  ellipse(ctx, 0, 0, 34 * k, 15 * k);
  ctx.stroke();
  ctx.lineWidth = 1.4 * k;
  ctx.strokeStyle = '#fff2b0';
  ellipse(ctx, 0, 0, 40 * k, 18 * k);
  ctx.stroke();
  ctx.restore();
}
export function drawEliteCrown(ctx, x, y, k) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-10 * k, 5 * k);
  ctx.lineTo(-12 * k, -6 * k);
  ctx.lineTo(-5 * k, 0);
  ctx.lineTo(0, -9 * k);
  ctx.lineTo(5 * k, 0);
  ctx.lineTo(12 * k, -6 * k);
  ctx.lineTo(10 * k, 5 * k);
  ctx.closePath();
  fillInk(ctx, '#ffd84a', 2 * k);
  ctx.restore();
}
