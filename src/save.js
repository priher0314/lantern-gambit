// 설정·기록 저장 (localStorage가 막힌 환경에서도 게임은 정상 동작)
const KEY = 'lantern-gambit-v1';
export const SAVE_VERSION = 2; // 저장된 판의 형식이 바뀌면 올린다

const DEFAULTS = {
  settings: { bgm: 0.55, sfx: 0.8, mute: false, shake: true, flash: true, assist: false, lang: null, layout: 'portrait' },
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
    // 진행 중인 판(밤이 시작될 때·상점·길 선택에서 자동 저장). 규칙이 바뀐 버전의 저장은 버린다.
    run: data.run && data.run.v === SAVE_VERSION ? data.run : null,
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify({ settings: store.settings, meta: store.meta, run: store.run }));
      } catch {
        /* 저장 불가 환경 */
      }
    },
  };
  return store;
}
