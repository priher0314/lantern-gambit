// 릴 결과 → 공격 패 판정
// 규칙: 세 칸이 모두 같으면 잭팟(3단계 1발), 인접한 두 칸이 같으면 연결(2단계 1발 + 나머지 1단계).
// 양 끝(1번·3번)만 같은 경우는 인접하지 않으므로 연결되지 않는다.

export function evaluateReels(reels) {
  const s = reels.map((r) => r.symbol);
  const g = reels.map((r) => (r.gilded ? 1 : 0));
  const mk = (symbol, tier, idx) => ({
    id: idx.join(''),
    symbol,
    tier,
    reels: idx,
    gild: idx.reduce((a, i) => a + g[i], 0),
    used: false,
  });
  if (s[0] === s[1] && s[1] === s[2]) return [mk(s[0], 3, [0, 1, 2])];
  if (s[0] === s[1]) return [mk(s[0], 2, [0, 1]), mk(s[2], 1, [2])];
  if (s[1] === s[2]) return [mk(s[0], 1, [0]), mk(s[1], 2, [1, 2])];
  return [mk(s[0], 1, [0]), mk(s[1], 1, [1]), mk(s[2], 1, [2])];
}

export function shotForReel(shots, reelIndex) {
  return shots.findIndex((sh) => sh.reels.includes(reelIndex));
}

// 3×3 판(grid[열][행], 행 0=위 1=가운데 2=아래)에서 같은 문양 3개가 한 줄이 되면 "빙고".
// 가운데 가로줄은 기존 잭팟 규칙이 처리한다. 세로줄은 릴 띠 배열로 정해져 운이 아니므로 빙고에서 제외(띠에는 같은 문양이 연달아 놓이지 않는다).
export const BINGO_LINES = [
  { id: 'r0', cells: [[0, 0], [1, 0], [2, 0]] },
  { id: 'r2', cells: [[0, 2], [1, 2], [2, 2]] },
  { id: 'd0', cells: [[0, 0], [1, 1], [2, 2]] },
  { id: 'd1', cells: [[0, 2], [1, 1], [2, 0]] },
];

export function evaluateLines(grid) {
  const out = [];
  for (const ln of BINGO_LINES) {
    const [a, b, c] = ln.cells.map(([col, row]) => grid[col][row]);
    if (a === b && b === c) out.push({ id: ln.id, symbol: a, cells: ln.cells });
  }
  return out;
}
