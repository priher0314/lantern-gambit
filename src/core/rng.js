// 시드 기반 난수 — 상태를 숫자 하나(st.rng)에 저장하므로 전투 상태를 복제하면 난수도 함께 복제된다.
// 덕분에 "공격 미리보기(복제본에서 실행)"와 "실제 공격"이 항상 같은 결과를 낸다.

export function rand(st) {
  let s = (st.rng + 0x6d2b79f5) >>> 0;
  st.rng = s;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(st, n) {
  return Math.floor(rand(st) * n);
}

export function pickDistinct(st, n, k) {
  const pool = [];
  for (let i = 0; i < n; i++) pool.push(i);
  const out = [];
  for (let i = 0; i < k && pool.length; i++) out.push(pool.splice(randInt(st, pool.length), 1)[0]);
  return out.sort((a, b) => a - b);
}

export function shuffle(st, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(st, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}
