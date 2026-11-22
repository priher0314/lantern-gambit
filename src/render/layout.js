// 세로 화면 레이아웃. 논리 폭 540 고정, 높이는 기기 비율에 맞춰 가변.
import { ROWS, LANES } from '../core/data.js';

export const W = 540;
export const LANE_SPACING = 166;

export function computeLayout(H) {
  const L = { W, H };
  L.hudH = 66;
  L.btn = { y: H - 102, h: 102 };
  L.slot = { y: L.btn.y - 200, h: 200 };
  L.info = { y: L.slot.y - 40, h: 40 };
  L.playerY = L.info.y - 6;
  L.fieldBottom = L.playerY - 84;
  const maxField = 600;
  // HUD 아래에 여유(유물 줄 + 맨 뒷줄 적의 머리)를 둬서 HUD가 적을 가리지 않게 한다
  L.fieldTop = Math.max(L.hudH + 62, L.fieldBottom - maxField);
  L.fieldH = L.fieldBottom - L.fieldTop;
  L.ch = L.fieldH / ROWS;
  L.cx = W / 2;
  return L;
}

export function rowScale(L, rowF) {
  return 0.7 + 0.3 * Math.max(0, Math.min(1, (rowF + 0.5) / ROWS));
}

// 칸 중심(적의 발 위치) — rowF는 소수 가능(이동 애니메이션)
export function cellPos(L, laneF, rowF) {
  const s = rowScale(L, rowF);
  const y = L.fieldTop + (rowF + 0.5) * L.ch + L.ch * 0.28;
  const x = L.cx + (laneF - 1) * LANE_SPACING * s;
  return { x, y, s, k: s * Math.min(1.12, L.ch / 76) };
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
  const w = 110;
  const h = 122;
  const gap = 12;
  const x0 = 34;
  return { x: x0 + i * (w + gap), y: L.slot.y + 30, w, h };
}

// 슬롯머신 몸체(릴 3개를 감싸는 사당)와 오른쪽 레버
export function cabinetRect(L) {
  const a = reelRect(L, 0);
  const c = reelRect(L, 2);
  return { x: a.x - 16, y: L.slot.y + 6, w: c.x + c.w + 16 - (a.x - 16), h: L.slot.h - 8 };
}

export function leverRect(L) {
  const cab = cabinetRect(L);
  const x = cab.x + cab.w + 6;
  return { x, y: L.slot.y + 4, w: W - 8 - x, h: L.slot.h - 6, cx: x + (W - 8 - x) / 2 + 4, top: L.slot.y + 44, bottom: L.slot.y + 134 };
}
