// 반응(막기/회피) 타이밍 판정. offset = 입력 시각 - 적중 시각 (ms, 음수 = 이름)

export const WINDOWS = {
  guard: { perfect: 75, good: 170 },
  dodge: { perfect: 55, good: 125 },
};

// 공격 예고(줄어드는 고리) 시간
export const WINDUP = {
  melee: 820,
  heavy: 1150,
  ranged: 1000,
  volley: 780,
};

export function judge(action, offsetMs, assist = 1) {
  const w = WINDOWS[action];
  if (!w) return 'miss';
  const a = Math.abs(offsetMs);
  if (a <= w.perfect * assist) return 'perfect';
  if (a <= w.good * assist) return 'good';
  return 'miss';
}

// 이 시간(적중 후) 동안 입력이 없으면 '무반응' 확정
export function lateLimit(assist = 1) {
  return Math.max(WINDOWS.guard.good, WINDOWS.dodge.good) * assist;
}
