// 설정·기록 저장 (localStorage가 막힌 환경에서도 게임은 정상 동작)
const KEY = 'lantern-gambit-v1';

const DEFAULTS = {
  settings: { bgm: 0.55, sfx: 0.8, mute: false, shake: true, flash: true, assist: false },
  meta: { runs: 0, wins: 0, best: 0, tips: [] },
};

export function loadStore() {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    data = {};
  }
  const store = {
    settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
    meta: { ...DEFAULTS.meta, ...(data.meta || {}) },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify({ settings: store.settings, meta: store.meta }));
      } catch {
        /* 저장 불가 환경 */
      }
    },
  };
  return store;
}
