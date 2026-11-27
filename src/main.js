import { Game } from './game.js';
import { Audio } from './audio/audio.js';
import { Overlay } from './ui/overlay.js';
import { loadStore } from './save.js';
import { setLang, defaultLang } from './i18n.js';

const canvas = document.getElementById('game');
const stage = document.getElementById('stage');
const store = loadStore();
if (!store.settings.lang) store.settings.lang = defaultLang(); // 처음에는 브라우저 언어를 따른다
setLang(store.settings.lang);
const audio = new Audio();
let paused = false;
let game;

const overlay = new Overlay(document.getElementById('overlay'), {
  start: () => game.startRun(),
  resume: () => game.resumeRun(),
  getSaved: () => store.run,
  setHeirloom: (id) => {
    store.meta.heirloom = id;
    store.save();
  },
  abandon: () => game.clearCheckpoint(),
  replayTutorial: () => {
    // 입문 판을 처음부터: 따라 하기, 단계별 구성, 한 번만 나오는 설명을 모두 되돌린다
    store.meta.tutorialDone = false;
    store.meta.guideDone = false;
    store.meta.tips = [];
    store.meta.seenEnemies = [];
    game.tipsSeen.clear();
    store.save();
  },
  title: () => {
    game.mode = 'title';
    game.st = null;
    game.setupTitleScene();
    overlay.showTitle(store.meta);
  },
  sound: (n) => {
    audio.unlock();
    audio.play(n);
  },
  getSettings: () => store.settings,
  setSetting: (k, v) => {
    store.settings[k] = v;
    store.save();
    game.applySettings(store.settings);
    if (k === 'layout') fitStage();
    if (k === 'fullscreen') applyFullscreen(v);
    if (k === 'winSize') applyWinSize(v);
  },
  pause: (p) => (paused = p),
});

// PC 실행 파일(Electron)에서는 window.desktop 으로 창을 다룬다. 브라우저에서는 브라우저의 전체 화면 기능을 쓴다.
const desk = window.desktop || null;
function applyFullscreen(on) {
  if (desk) desk.setFullscreen(!!on);
  else if (on) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen?.();
}
function applyWinSize(v) {
  const m = /^(\d+)x(\d+)$/.exec(v || '');
  if (desk && m && !store.settings.fullscreen) desk.setSize(Number(m[1]), Number(m[2]));
}
if (desk) {
  // 지난번에 고른 창 상태로 시작
  applyWinSize(store.settings.winSize);
  if (store.settings.fullscreen) applyFullscreen(true);
} else {
  // 브라우저는 사용자의 동작 없이 전체 화면이 될 수 없다 → 실제 상태를 따라간다
  store.settings.fullscreen = false;
  document.addEventListener('fullscreenchange', () => {
    store.settings.fullscreen = !!document.fullscreenElement;
    store.save();
  });
}
window.addEventListener('keydown', (e) => {
  if ((e.altKey && e.key === 'Enter') || (desk && e.key === 'F11')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    const on = !store.settings.fullscreen;
    store.settings.fullscreen = on;
    store.save();
    applyFullscreen(on);
  }
}, true);

game = new Game(canvas, audio, store, overlay);
window.__game = game; // 디버그·자동 테스트용
// 자동 테스트용: 브라우저가 백그라운드여도 프레임을 직접 진행시킨다
window.__tick = async (frames = 1, ms = 1000 / 60) => {
  for (let i = 0; i < frames; i++) {
    if (game.virtualClock == null) game.virtualClock = performance.now();
    game.virtualClock += ms;
    game.update(ms / 1000);
    for (let k = 0; k < 8; k++) await Promise.resolve(); // 비동기 연출 흐름이 진행되도록
  }
  game.draw();
};

function fitStage() {
  game.resize();
  stage.style.width = canvas.style.width;
  stage.style.height = canvas.style.height;
}
window.addEventListener('resize', fitStage);
window.addEventListener('orientationchange', () => setTimeout(fitStage, 200));
// 주소창 접힘·탭 전환 등 resize 이벤트 없이 크기가 바뀌는 경우까지 대응
let lastSize = '';
if ('ResizeObserver' in window) {
  new ResizeObserver(() => {
    const s = `${window.innerWidth}x${window.innerHeight}`;
    if (s !== lastSize && window.innerWidth > 0) {
      lastSize = s;
      fitStage();
    }
  }).observe(document.documentElement);
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!paused) game.onPointerDown(e);
});
canvas.addEventListener('pointermove', (e) => {
  if (!paused) game.onPointerMove(e);
});
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!paused) game.onContext(e);
});
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(t, () => game.onPointerUp());
window.addEventListener('keydown', (e) => {
  const layer = document.querySelector('.ov-layer.on');
  if (layer) {
    if (e.repeat) return;
    const click = (el) => {
      if (!el || el.disabled) return false;
      e.preventDefault();
      el.click();
      return true;
    };
    if (/^[1-9]$/.test(e.key)) click(layer.querySelectorAll('.rw-card')[Number(e.key) - 1]);
    else if (e.key === 'Enter') click(layer.querySelector('.rw-go:not([disabled])') || layer.querySelector('.shop [data-a="leave"]') || layer.querySelector('.btn-primary:not([disabled])'));
    else if (e.key === 'Escape') click(layer.querySelector('[data-a="close"]') || layer.querySelector('[data-a="back"]'));
    return;
  }
  if (!paused) game.onKey(e);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && audio.ctx) audio.ctx.suspend();
  else if (audio.ctx) audio.ctx.resume();
});

// ───── 게임패드 ─────
// 표준 배치(엑스박스 기준). 플레이스테이션·스위치 패드도 브라우저가 같은 번호로 맞춰 준다.
const PAD_BTN = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const PAD_REPEAT = new Set(['up', 'down', 'left', 'right']);
const padHeld = new Map(); // 버튼 이름 → 다음에 다시 입력될 시각
let padEl = null; // 선택 화면에서 지금 가리키는 항목

function padFocusables(layer) {
  return [...layer.querySelectorAll('button, .rw-card, select, input, .heir')].filter((el) => !el.disabled && !el.classList.contains('cant') && el.offsetParent !== null);
}
function padFocus(el) {
  if (padEl && padEl !== el) padEl.classList.remove('pad-focus');
  padEl = el;
  if (!el) return;
  el.classList.add('pad-focus');
  try { el.focus({ preventScroll: true }); } catch { /* 초점을 받을 수 없는 요소 */ }
  el.scrollIntoView({ block: 'nearest' });
}
function padDefault(layer) {
  const list = padFocusables(layer);
  return layer.querySelector('.rw-card.sel') || list.find((el) => el.classList.contains('rw-card')) || list.find((el) => el.classList.contains('btn-primary')) || list[0] || null;
}
// 누른 방향에 있는 가장 가까운 항목으로 옮긴다
function padMove(layer, dir) {
  const list = padFocusables(layer);
  if (!padEl || !padEl.isConnected || !list.includes(padEl)) return padFocus(padDefault(layer));
  // 설정 화면의 한 줄(글자 + 칸)은 줄 전체를 기준으로 삼아야 위아래 이동이 줄을 건너뛰지 않는다
  const rectOf = (el) => (el.closest('label.row') || el).getBoundingClientRect();
  const a = rectOf(padEl);
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of list) {
    if (el === padEl) continue;
    const r = rectOf(el);
    const dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
    const main = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    const side = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    if (main < 6) continue;
    const score = main + side * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) {
    overlayHooksSound();
    padFocus(best);
  }
}
function overlayHooksSound() {
  audio.unlock();
  audio.play('select');
}
function padOverlay(layer, btn) {
  if (padEl && !padEl.isConnected) padEl = null;
  if (btn === 'b' || btn === 'start') {
    const back = layer.querySelector('[data-a="close"]') || layer.querySelector('[data-a="back"]');
    if (back) back.click();
    return;
  }
  if (btn === 'up' || btn === 'down' || btn === 'left' || btn === 'right') {
    // 슬라이더·선택 칸 위에서는 좌우로 값을 바꾼다
    if (padEl && padEl.isConnected && (btn === 'left' || btn === 'right')) {
      const d = btn === 'left' ? -1 : 1;
      if (padEl.tagName === 'INPUT' && padEl.type === 'range') {
        const v = clampNum(Number(padEl.value) + d * Number(padEl.step || 1), Number(padEl.min), Number(padEl.max));
        padEl.value = String(Math.round(v * 100) / 100);
        padEl.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (padEl.tagName === 'SELECT') {
        const n = padEl.options.length;
        const k = padEl.dataset.k;
        padEl.selectedIndex = (padEl.selectedIndex + d + n) % n;
        padEl.dispatchEvent(new Event('input', { bubbles: true }));
        // 화면이 다시 그려졌으면 같은 칸을 다시 가리킨다
        const again = k && document.querySelector(`.ov-layer.on [data-k="${k}"]`);
        if (again) padFocus(again);
        return;
      }
    }
    padMove(layer, btn);
    return;
  }
  if (btn === 'a') {
    if (!padEl || !padEl.isConnected) return padFocus(padDefault(layer));
    const el = padEl;
    const k = el.dataset.k;
    const wasCard = el.classList.contains('rw-card') && !el.classList.contains('shop-item');
    el.click();
    const now = document.querySelector('.ov-layer.on');
    if (!now) return;
    if (wasCard && el.isConnected) {
      // 카드를 골랐으면 바로 확인 버튼으로
      const go = now.querySelector('.rw-go:not([disabled])');
      if (go) padFocus(go);
    } else if (k && !el.isConnected) {
      const again = now.querySelector(`[data-k="${k}"]`);
      if (again) padFocus(again);
    }
  }
}
function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function padInput(btn) {
  game.padActive = true;
  audio.unlock();
  const layer = document.querySelector('.ov-layer.on');
  if (layer) padOverlay(layer, btn);
  else if (!paused) game.onPad(btn);
}
window.__pad = padInput; // 자동 테스트용: 패드 버튼을 누른 것처럼
function pollPad(now) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const down = new Set();
  for (const p of pads) {
    if (!p || !p.connected) continue;
    p.buttons.forEach((b, i) => {
      if (PAD_BTN[i] && (b.pressed || b.value > 0.5)) down.add(PAD_BTN[i]);
    });
    const [ax = 0, ay = 0] = p.axes;
    if (ax < -0.55) down.add('left');
    if (ax > 0.55) down.add('right');
    if (ay < -0.55) down.add('up');
    if (ay > 0.55) down.add('down');
  }
  for (const name of [...padHeld.keys()]) if (!down.has(name)) padHeld.delete(name);
  for (const name of down) {
    const next = padHeld.get(name);
    if (next === undefined) {
      padHeld.set(name, PAD_REPEAT.has(name) ? now + 360 : Infinity);
      padInput(name);
    } else if (now >= next) {
      padHeld.set(name, now + 140);
      padInput(name);
    }
  }
  // 선택 화면이 새로 열렸으면 첫 항목을 가리켜 둔다
  if (game.padActive) {
    const layer = document.querySelector('.ov-layer.on');
    if (layer && (!padEl || !padEl.isConnected)) padFocus(padDefault(layer));
  }
}
// 마우스·키보드를 쓰면 패드 표시를 거둔다
for (const t of ['pointerdown', 'keydown']) {
  window.addEventListener(t, () => {
    if (!game || !game.padActive) return;
    game.padActive = false;
    if (padEl) padEl.classList.remove('pad-focus');
    padEl = null;
  }, true);
}

let last = performance.now();
function frame(now) {
  pollPad(now);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.virtualClock == null && (!paused || game.mode !== 'battle')) game.update(dt);
  game.draw();
  requestAnimationFrame(frame);
}

async function boot() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('20px "Jua"'), document.fonts.load('20px "Black Han Sans"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* 폰트 없이 진행 */
  }
  fitStage();
  overlay.showTitle(store.meta);
  requestAnimationFrame(frame);
}
boot();
