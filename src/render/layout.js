// 세로 화면 레이아웃. 논리 폭 540 고정, 높이는 기기 비율에 맞춰 가변.
import { ROWS, LANES } from '../core/data.js';

export const W = 540;
export const LANE_SPACING = 166;
export const REEL_CELL = 52; // 릴 한 칸 높이(창에 3칸이 온전히 보인다)
export const REEL_PEEK = 17; // 창 위·아래로 걸쳐 보이는 다음 문양의 높이

export function computeLayout(H) {
  const L = { W, H };
  L.hudH = 66;
  L.btn = { y: H - 94, h: 94 };
  L.slot = { y: L.btn.y - 310, h: 310 }; // 위에서부터: 유물 줄, 코인 쟁반, 릴 3×3(+위아래 걸침), 이름패
  L.info = { y: L.slot.y - 40, h: 40 };
  L.playerY = L.info.y - 6;
  L.fieldBottom = L.playerY - 84;
  const maxField = 600;
  // HUD 아래에 여유(유물 줄 + 맨 뒷줄 적의 머리)를 둬서 HUD가 적을 가리지 않게 한다
  L.fieldTop = Math.max(L.hudH + 46, L.fieldBottom - maxField);
  L.fieldH = L.fieldBottom - L.fieldTop;
  L.ch = L.fieldH / ROWS;
  L.cx = W / 2;
  L.SW = W;
  L.SH = H;
  return L;
}

export const UI_H = 444; // 안내 줄 + 슬롯 + 버튼의 높이
export const WIDE_W = W * 2;

// 가로형: 화면 높이 SH만큼의 전장 + 오른쪽 칸. 내부 좌표의 split(=안내 줄 위쪽) 아래가 오른쪽 칸으로 간다.
export function computeWideLayout(SH) {
  const L = computeLayout(SH + UI_H - 30); // 주인공 발밑 단이 잘리지 않게 전장을 조금 올린다
  L.wide = true;
  L.SW = WIDE_W;
  L.SH = SH;
  L.split = L.info.y;
  L.uiY = Math.round((SH - UI_H) / 2);
  return L;
}

// 내부 좌표 → 화면 좌표
export function toScreen(L, x, y) {
  if (!L.wide || y < L.split) return { x, y };
  return { x: x + W, y: y - L.split + L.uiY };
}

// 화면 좌표 → 내부 좌표(빈 곳이면 null)
export function fromScreen(L, sx, sy) {
  if (!L.wide) return { x: sx, y: sy };
  if (sx < W) return { x: sx, y: Math.min(sy, L.split - 0.01) };
  const y = sy - L.uiY + L.split;
  return y >= L.split ? { x: sx - W, y } : null;
}

export function rowScale(L, rowF) {
  return 0.95 + 0.05 * Math.max(0, Math.min(1, (rowF + 0.5) / ROWS));
}

// 칸 중심(적의 발 위치) — rowF는 소수 가능(이동 애니메이션)
export function cellPos(L, laneF, rowF) {
  const s = rowScale(L, rowF);
  const y = L.fieldTop + (rowF + 0.5) * L.ch + L.ch * 0.28;
  const x = L.cx + (laneF - 1) * LANE_SPACING * s;
  return { x, y, s, k: s * Math.min(1.08, L.ch / 86) };
}

export function laneX(L, lane, y) {
  const rowF = (y - L.fieldTop) / L.ch - 0.5;
  return L.cx + (lane - 1) * LANE_SPACING * rowScale(L, rowF);
}

export function laneAt(L, x, y) {
  if (y < L.fieldTop - 20 || y > L.info.y + 4) return -1;
  const rowF = Math.min(ROWS - 0.5, (y - L.fieldTop) / L.ch - 0.5);
  const s = rowScale(L, rowF);
  const l = Math.round((x - L.cx) / (LANE_SPACING * s)) + 1;
  return Math.max(0, Math.min(LANES - 1, l));
}

// 레인 사다리꼴의 왼쪽/오른쪽 경계 x
export function laneEdges(L, lane, y) {
  const rowF = (y - L.fieldTop) / L.ch - 0.5;
  const s = rowScale(L, rowF);
  const c = L.cx + (lane - 1) * LANE_SPACING * s;
  const hw = (LANE_SPACING * s) / 2;
  return [c - hw, c + hw];
}

// 슬롯 창 위치
export function reelRect(L, i) {
  const w = 108;
  const h = REEL_CELL * 3 + REEL_PEEK * 2;
  const gap = 10;
  const x0 = 32;
  return { x: x0 + i * (w + gap), y: L.slot.y + 86, w, h };
}

// 슬롯머신 몸체(릴 3개를 감싸는 사당)와 오른쪽 레버
export function cabinetRect(L) {
  const a = reelRect(L, 0);
  const c = reelRect(L, 2);
  return { x: a.x - 16, y: L.slot.y + 34, w: c.x + c.w + 16 - (a.x - 16), h: L.slot.h - 36 };
}

export function leverRect(L) {
  const cab = cabinetRect(L);
  const x = cab.x + cab.w + 6;
  return { x, y: L.slot.y + 4, w: W - 8 - x, h: L.slot.h - 6, cx: x + (W - 8 - x) / 2 + 4, top: L.slot.y + 44, bottom: L.slot.y + 134 };
}

// 3×3 판의 칸 중심(col=릴, row 0=위 1=가운데 2=아래)
export function slotCell(L, col, row) {
  const r = reelRect(L, col);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 + (row - 1) * REEL_CELL };
}

// 릴 위의 "빙고 기술" 줄
export function bingoRect(L) {
  const a = reelRect(L, 0);
  const c = reelRect(L, 2);
  return { x: a.x, y: L.slot.y + 25, w: c.x + c.w - a.x, h: 24 };
}

// 슬롯머신 윗면의 코인 쟁반
export function trayRect(L) {
  const c = cabinetRect(L);
  return { x: c.x + 8, y: L.slot.y + 40, w: c.w - 16, h: 38 };
}
