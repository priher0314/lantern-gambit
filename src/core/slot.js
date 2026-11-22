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
