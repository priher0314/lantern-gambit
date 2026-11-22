import { Game } from './game.js';
import { Audio } from './audio/audio.js';
import { Overlay } from './ui/overlay.js';
import { loadStore } from './save.js';

const canvas = document.getElementById('game');
const stage = document.getElementById('stage');
const store = loadStore();
const audio = new Audio();
let paused = false;
let game;

const overlay = new Overlay(document.getElementById('overlay'), {
  start: () => game.startRun(),
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
  },
  pause: (p) => (paused = p),
});

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
  if (!paused) game.onKey(e);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && audio.ctx) audio.ctx.suspend();
  else if (audio.ctx) audio.ctx.resume();
});

let last = performance.now();
function frame(now) {
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
