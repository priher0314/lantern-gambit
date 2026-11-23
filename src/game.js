// 게임 흐름·입력·연출 재생 담당. 규칙 판정은 전부 core/battle.js가 한다.
import * as B from './core/battle.js';
import { RUN_LENGTH, ENEMIES, SYMBOLS, SHOT_NAMES, shotDesc, shotStats, RELICS, FUSIONS, EVOLVE_AT, MAX_TIER, AFFINITY, WEAK_BONUS, RESIST_CUT, STAMINA } from './core/data.js';
import { createRun, battleOptions, recordBattle, rollStartChoices, applyReward, advance, generateNight, rollPaths, bankBattle, rollShop, tutorialNight } from './core/run.js';
import { SAVE_VERSION } from './save.js';
import { setLang } from './i18n.js';
import { judge, lateLimit } from './core/timing.js';
import { shotForReel, BINGO_LINES } from './core/slot.js';
import { hashSeed } from './core/rng.js';
import { FX } from './render/fx.js';
import { W, computeLayout, cellPos, laneAt, reelRect, leverRect, bingoRect, slotCell, cabinetRect, trayRect, LANE_SPACING } from './render/layout.js';
import { Renderer, REEL_CELL } from './render/scene.js';
import { REEL_PEEK, computeWideLayout, toScreen, fromScreen, WIDE_W } from './render/layout.js';
import { MODS } from './core/data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MODS_NAME = (m) => ({ fullMoon: '보름달', rage: '성난 밤', gust: '빠른 걸음', fog: '안개' }[m] || m);
const ease = (t) => 1 - (1 - t) ** 3;

const EL_COLORS = {
  blade: ['#ffffff', '#cfd8ff', '#8fa8ff'],
  wave: ['#8fffe2', '#4ff0c4', '#0fae8a'],
  frost: ['#ffffff', '#d6f3ff', '#7cc8ff'],
  spark: ['#ffffff', '#ffe45c', '#b77cff'],
  counter: ['#ffffff', '#ffe08a', '#ff9f1a'],
  venom: ['#e6ff9a', '#a6f04a', '#6a2fb0'],
  bomb: ['#fff2c8', '#ff8a3d', '#d8342c'],
  ice: ['#ffffff', '#d6f3ff', '#9fdcff'],
};

const CONCEPTS = {
  stamina: {
    kicker: '알아두기', title: '기력', color: '#7fe8ff',
    lines: [
      { label: '대가', text: '막기 1, 회피 2. 모자라면 타이밍이 맞아도 맞는다.', color: '#ffb8c8' },
      { label: '절약', text: '퍼펙트 회피는 기력 1만 든다.', color: '#ffe08a' },
      { label: '얻기', text: '매 턴 +2. 등불 문양을 쓰면 더 찬다.', color: '#8fffe2' },
    ],
  },
  hold: {
    kicker: '알아두기', title: '릴 고정', color: '#d9a0ff',
    lines: [
      { label: '효과', text: '고정한 릴은 다시 돌려도 그대로 남는다.' },
      { label: '사용', text: '릴 위의 자물쇠를 누른다. (A · S · D 키, 우클릭)', color: '#8fffe2' },
      { label: '조건', text: '두 개까지. 공격을 시작하기 전에만.', color: '#ffb8c8' },
    ],
  },
  snipe: {
    kicker: '알아두기', title: '저격', color: '#ffd84a',
    lines: [
      { label: '효과', text: '레인의 맨 앞이 아닌 적을 골라 맞힌다.' },
      { label: '사용', text: '뒤에 있는 적을 직접 누른다. (F 키 · 패드 위아래)', color: '#8fffe2' },
      { label: '조건', text: '턴마다 1번. 레인 전체 공격에는 필요 없다.', color: '#ffb8c8' },
    ],
  },
  bane: {
    kicker: '알아두기', title: '약점과 저항', color: '#ffb347',
    lines: [
      { label: '약점', text: '잘 듣는 기술로 치면 피해 +2.', color: '#ffd84a' },
      { label: '저항', text: '안 듣는 기술로 직접 치면 피해 -1.', color: '#b8b0c8' },
      { label: '표시', text: '기술을 고르면 적 옆에 표시된다. 적을 우클릭해도 보인다.', color: '#8fffe2' },
    ],
  },
  reroll: {
    kicker: '알아두기', title: '다시 돌리기', color: '#d9a0ff',
    lines: [
      { label: '효과', text: '공격 전에 릴을 전부 다시 돌린다.' },
      { label: '대가', text: '버튼에 적힌 일이 먼저 일어난다.', color: '#ffb8c8' },
      { label: '보상', text: '금빛 릴 +1.', color: '#ffe08a' },
    ],
  },
  gild: {
    kicker: '알아두기', title: '금빛 릴', color: '#ffd27a',
    lines: [
      { label: '효과', text: '그 칸의 공격이 피해 +1, 효과 +1.' },
      { label: '얻기', text: '다시 돌리기 · 퍼펙트 막기/회피.' },
    ],
  },
  coin: {
    kicker: '알아두기', title: '코인 버는 법', color: '#ffd84a',
    lines: [
      { label: '연속 처치', text: '한 턴에 3마리째부터 +1, 5마리째부터 +2.' },
      { label: '퍼펙트', text: '막기·회피를 정확히 하면 +1.' },
      { label: '빙고', text: '한 줄마다 +1.' },
      { label: '절약', text: '밤 내내 다시 돌리기를 안 쓰면 클리어 때 +3.' },
      { label: '클리어', text: '밤을 넘기면 보너스. 험한 길은 2배.' },
    ],
  },
  bingo: {
    kicker: '알아두기', title: '빙고!', color: '#ffe08a',
    lines: [
      { label: '효과', text: '위·아래 줄이나 대각선 3칸이 같으면 보너스 기술 +1.' },
      { label: '조커', text: '방어막 문양은 아무 문양으로나 쳐 준다.' },
      { label: '사용', text: '릴 위의 금색 줄을 눌러 고른다.' },
    ],
  },
};

const INTENT_TEXT = {
  move: (it) => (it.dash ? '맨 앞까지 돌진한다.' : `${it.steps}칸 다가온다.`),
  rev: () => '콧김을 뿜는다. 다음 차례에 돌진.',
  mend: (it) => `다친 적 하나를 ${it.amount} 회복시킨다.`,
  brace: () => '강타 준비. 다음 차례에 내려친다.',
  aim: () => '조준. 다음 차례에 쏜다.',
  charge: () => '충전 시작. 그동안 받는 피해 +2.',
  summon: () => '우산 도깨비를 부른다.',
  shift: () => '옆 레인으로 옮긴다.',
  frozen: () => '얼어서 못 움직인다.',
  wait: (it) => (it.slow ? '느려서 이번엔 안 움직인다.' : '앞이 막혀 기다린다.'),
  attack: (it) => {
    if (it.style === 'heavy') return `강타 ${it.dmg} — 붉은 고리, 회피!`;
    if (it.style === 'volley') return `불씨 ${it.hits}발 (각 ${it.dmg}) — 한 발씩 막기.`;
    if (it.style === 'ranged') return `불씨 ${it.dmg} — 막기.`;
    return `공격 ${it.dmg} — 금빛 고리, 막기.`;
  },
};

export class Game {
  constructor(canvas, audio, store, overlay) {
    this.canvas = canvas;
    this.audio = audio;
    this.store = store;
    this.overlay = overlay;
    this.renderer = new Renderer(canvas);
    this.fx = new FX();
    this.uiFx = new FX(); // 슬롯·버튼 위에 그리는 이펙트(흔들리지 않음)
    this.lever = { pull: 0, t: -1, ok: false };
    this.slotJolt = 0;
    this.card = null;
    this.cardQueue = [];
    this.relicPulse = {};
    this.stamps = [];
    this.comboBadges = []; // "동결 + 절단" 처럼 무엇과 무엇이 만나 터졌는지
    this.relicLinks = []; // 발동한 유물에서 효과가 난 곳으로 이어지는 빛줄기(화면 좌표)
    this.cutin = null;
    this.hold = null;
    this.battleCount = RUN_LENGTH;
    this.coinPulse = 0;
    this.pile = 0; // 쟁반에 쌓인 코인 수
    this.coinShown = 0; // 쌓였거나 날아가는 중인 코인 수
    this.flies = [];
    this.landAt = {}; // 코인이 쟁반에 떨어진 시각(통통 튀는 연출)
    this.banked = false;
    this.mode = 'title';
    this.views = new Map();
    this.projs = [];
    this.afterimages = [];
    this.timers = [];
    this.tweens = [];
    this.time = 0;
    this.rt = 0;
    this.hitstop = 0;
    this.timeScale = 1;
    this.busy = false;
    this.buttons = [];
    this.ui = { phase: 'idle', sel: null, hoverLane: -1, armedLane: -1, preview: null, react: null, counter: null };
    this.info = null;
    this.banner = null;
    this.hud = { hp: 16, hpLag: 16 };
    this.player = { x: W / 2, tx: W / 2, t: 0, pose: 'idle', poseT: 1, dir: 0, flash: 0 };
    this.strips = [['blade', 'wave', 'frost', 'spark', 'lantern'], ['wave', 'frost', 'spark', 'lantern', 'blade'], ['frost', 'spark', 'lantern', 'blade', 'wave']];
    this.reels = [0, 1, 2].map((i) => ({ pos: i * 2, vel: 0, spinning: false, tween: null, bump: 0, flashT: 0 }));
    this.tipsSeen = new Set(store.meta.tips || []);
    this.applySettings(store.settings);
    this.resize();
    this.setupTitleScene();
  }

  applySettings(s) {
    this.settings = s;
    setLang(s.lang);
    this.fx.opts.shake = s.shake;
    this.fx.opts.flash = s.flash;
    this.uiFx.opts.shake = s.shake;
    this.uiFx.opts.flash = s.flash;
    this.audio.setVolume({ bgm: s.bgm, sfx: s.sfx, mute: s.mute });
  }

  // ─────────────── 화면 크기 ───────────────
  resize() {
    // 탭이 숨겨진 상태로 로드되면 크기가 0일 수 있다 → 기본값으로 대체
    const vw = window.innerWidth || document.documentElement.clientWidth || 540;
    const vh = window.innerHeight || document.documentElement.clientHeight || 960;
    // 화면 방향: 세로(기본) / 가로(왼쪽 전장 + 오른쪽 슬롯)
    // 자동 = 창이 옆으로 넓으면 가로형
    const wide = this.settings.layout === 'wide' || (this.settings.layout !== 'portrait' && vw > vh * 1.15);
    let scale;
    if (wide) {
      const SH = clamp(Math.round((WIDE_W * vh) / vw), 580, 760);
      scale = Math.min(vw / WIDE_W, vh / SH);
      this.L = computeWideLayout(SH);
    } else {
      const H = clamp(Math.round((W * vh) / vw), 960, 1200);
      scale = Math.min(vw / W, vh / H);
      this.L = computeLayout(H);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssScale = scale;
    this.renderer.resize(this.L, scale * dpr);
    this.canvas.style.width = `${this.L.SW * scale}px`;
    this.canvas.style.height = `${this.L.SH * scale}px`;
    this.gearRect = { x: W - 50, y: 12, w: 40, h: 42 };
    this.helpRect = { x: W - 96, y: 12, w: 40, h: 42 };
    this.overlay.fit(this.L.SW * scale, this.L.SH * scale, scale, wide);
    if (!this.player.x) this.player.x = W / 2;
  }

  toLogical(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return fromScreen(this.L, ((clientX - r.left) / r.width) * this.L.SW, ((clientY - r.top) / r.height) * this.L.SH) || { x: -999, y: -999 };
  }

  // ─────────────── 타이틀 장면 ───────────────
  setupTitleScene() {
    this.views.clear();
    const demo = [['kasa', 0, 3], ['mask', 1, 2], ['archer', 2, 1], ['kasa', 2, 4]];
    demo.forEach(([type, lane, row], i) => {
      const v = this.makeView({ id: 1000 + i, type, lane, row, hp: ENEMIES[type].hp, maxHp: ENEMIES[type].hp, shieldHp: ENEMIES[type].shieldHp || 0 });
      v.spawnT = 1;
      this.views.set(v.id, v);
    });
  }

  makeView(e) {
    return {
      id: e.id, type: e.type, lane: e.lane, row: e.row, hpShown: e.hp, maxHp: e.maxHp,
      t: Math.random() * 10, flash: 0, knock: 0, squash: 0, hop: 0, lean: 0, lunge: 0,
      close: 0, raise: 0, slam: 0, chargeA: 0, puff: 0, blockT: 0,
      frozen: e.frozen || 0, exposed: !!e.exposed, fury: e.fury || 0, braced: !!e.braced, charge: !!e.charge,
      vulnerable: !!e.vulnerable, phase2: !!e.phase2, shieldBroken: !!e.shieldBroken,
      poison: e.poison || 0, shieldHp: e.shieldHp || 0, kick: 0, pop: 0, hpLag: e.hp, lagHold: 0, wet: e.wet || 0,
      elite: !!e.elite, sizeMul: e.elite ? 1.14 : 1,
      spawnT: 0, dying: 0, ox: 0, oy: 0,
    };
  }

  // ─────────────── 런/전투 시작 ───────────────
  startRun(seed, charId) {
    this.audio.unlock();
    this.audio.startBgm();
    const s = seed ?? hashSeed(String(Date.now()));
    const meta0 = this.store.meta;
    const first = !meta0.tutorialDone;
    // 따라 하기를 마친 뒤부터는 캐릭터를 고른다
    if (!first && charId === undefined) {
      this.overlay.showCharacters(meta0.lastChar || 'blade', (id) => this.startRun(seed, id));
      return;
    }
    if (charId) meta0.lastChar = charId;
    // 단계와 가져온 유물(첫 판 따라 하기에서는 쓰지 않는다)
    this.run = createRun(s, first ? {} : { tier: meta0.tier || 0, heirloom: meta0.heirloom || null, char: charId || 'blade' });
    // 개발용: ?stage=2 로 특정 전투부터 시작
    const devStage = Number(new URLSearchParams(location.search).get('stage'));
    if (devStage > 0 && devStage < RUN_LENGTH) {
      this.run.stage = devStage;
      this.run.def = generateNight(this.run, devStage, new URLSearchParams(location.search).has('risky'));
      this.run.coins = 40;
    }
    else if (!this.store.meta.tutorialDone) {
      // 첫 판: 첫째 밤을 따라 하기로 진행한다
      this.run.tutorial = true;
      this.run.def = tutorialNight();
    }
    this.store.meta.runs = (this.store.meta.runs || 0) + 1;
    this.store.run = null;
    this.store.save();
    this.mode = 'reward';
    this.st = null;
    this.views.clear();
    this.card = null;
    this.cardQueue = [];
    this.overlay.showPick({
      title: '무엇을 들고 갈까요?',
      req: '유물 하나, 또는 유물 없이 코인',
      ids: rollStartChoices(this.run),
      go: '이걸로 시작',
      run: this.run,
      used: this.store.meta.relicsUsed || [],
    }, (id) => {
      this.takeReward(id);
      this.startBattle();
    });
  }

  // ───── 자동 저장 ─────
  // at: 'battle'(밤 시작) | 'shop'(상점) | 'path'(길 선택). 이어하면 그 지점부터 다시 시작한다.
  checkpoint(at, extra = {}) {
    this.store.run = { v: SAVE_VERSION, at, run: structuredClone(this.run), ...structuredClone(extra) };
    this.store.save();
  }

  clearCheckpoint() {
    this.store.run = null;
    this.store.save();
  }

  resumeRun() {
    const s = this.store.run;
    if (!s) return this.startRun();
    this.audio.unlock();
    this.audio.startBgm();
    this.run = structuredClone(s.run);
    this.st = null;
    this.views.clear();
    this.card = null;
    this.cardQueue = [];
    if (s.at === 'shop') {
      this.mode = 'reward';
      this.openShop(structuredClone(s.shop), s.bank);
    } else if (s.at === 'path') {
      this.mode = 'reward';
      this.choosePath();
    } else this.startBattle();
  }

  openShop(shop, bank) {
    this.checkpoint('shop', { shop, bank });
    this.overlay.showShop(this.run, shop, bank, (id) => {
      this.noteRelic(id);
      this.checkpoint('shop', { shop, bank });
    }, () => this.choosePath());
  }

  takeReward(id) {
    applyReward(this.run, id);
    this.audio.play('buy');
    if (RELICS[id]) {
      const u = new Set(this.store.meta.relicsUsed || []);
      u.add(id);
      this.store.meta.relicsUsed = [...u];
      this.store.save();
    }
  }

  // ───── 코인 쟁반 ─────
  trayTarget() {
    return (this.run ? this.run.coins : 0) + (this.st && this.mode === 'battle' && !this.banked ? this.st.coins : 0);
  }

  // i번째 코인이 놓일 자리(같은 번호는 항상 같은 자리 → 쌓인 모양이 유지된다)
  coinSpot(i) {
    const tr = trayRect(this.L);
    const rnd = (k) => {
      const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    const w = tr.w - 70; // 오른쪽은 개수 표지
    return { x: tr.x + 11 + rnd(1) * (w - 22), y: tr.y + 9 + rnd(2) * (tr.h - 18), rot: rnd(3) * Math.PI };
  }

  relicRect(i) {
    const c = cabinetRect(this.L);
    const n = Math.max(1, this.shownRelics.length);
    const step = Math.min(32, (c.w - 8) / n);
    return { x: c.x + 4 + i * step, y: this.L.slot.y + 3, w: 28, h: 28 };
  }

  buzz(ms) {
    if (!this.settings.shake || !navigator.vibrate) return;
    try {
      navigator.vibrate(ms);
    } catch {
      /* 진동 미지원 */
    }
  }

  // ───── 첫 판 따라 하기 ─────
  // 지금 눌러야 할 곳과 한 줄 설명을 돌려준다(없으면 null). 입력을 막지는 않는다.
  coachHint() {
    const c = this.coach;
    const st = this.st;
    if (!c || c.done || !st || this.mode !== 'battle' || this.card || this.cutin) return null;
    const ui = this.ui;
    const L = this.L;
    const btn = (id) => this.buttons.find((b) => b.id === id);
    if (ui.phase === 'spin' && !this.busy) {
      return { rect: leverRect(L), text: st.turn === 1 ? '레버를 당겨 이번 턴의 공격을 뽑으세요' : '다시 레버를 당기세요', key: 'Space' };
    }
    if (ui.phase === 'aim' && !this.busy && ui.sel != null && st.shots[ui.sel]) {
      const field = { x: 24, y: L.fieldTop + 10, w: W - 48, h: L.fieldBottom - L.fieldTop - 20 };
      const a = reelRect(L, 0);
      const b = reelRect(L, 2);
      const reels = { x: a.x, y: a.y, w: b.x + b.w - a.x, h: a.h };
      if (st.turn >= 2 && !c.rerollSeen && st.shotsFired === 0 && B.canReroll(st) && btn('reroll')) {
        return { rect: btn('reroll'), text: '결과가 아쉬우면 다시 돌리기. 대가가 버튼에 적혀 있습니다. 안 써도 됩니다', key: 'R' };
      }
      if (st.shots[ui.sel].symbol === 'lantern') return { rect: reels, text: '방어막 문양입니다. 밝은 칸을 한 번 더 누르면 방어막을 얻습니다', key: 'Q W E' };
      if (!c.fired) return { rect: field, text: '가운데 줄 3칸이 이번 턴의 공격입니다. 적이 있는 레인을 눌러 쏘세요', key: '1 2 3' };
      if (st.turn === 1) return { rect: field, text: '남은 공격도 쏘세요. 슬롯의 다른 문양을 누르면 순서를 바꿀 수 있습니다', key: '1 2 3' };
      return null;
    }
    if (ui.phase === 'react' && ui.react && !ui.react.input && !c.reacted) {
      const heavy = ui.react.attack.style === 'heavy';
      const b = btn(heavy ? 'dodge' : 'guard');
      if (b) return { rect: b, text: heavy ? '붉은 고리는 회피!' : '고리가 원에 닿는 순간 막기! 정확하면 되받아칩니다', key: heavy ? 'K' : 'Space' };
    }
    return null;
  }

  finishCoach() {
    if (!this.coach || this.coach.done) return;
    this.coach.done = true;
    this.store.meta.tutorialDone = true;
    this.store.save();
  }

  // ───── 설명 카드 ─────
  showCard(card) {
    this.card = { ...card, t0: this.now(), more: this.cardQueue.length };
    this.audio.play('card');
  }

  nextCard() {
    if (this.card || !this.cardQueue.length) return;
    if (this.coach && !this.coach.done) return;
    if (this.mode !== 'battle' || !(this.ui.phase === 'spin' || this.ui.phase === 'aim')) return;
    this.showCard(this.cardQueue.shift());
  }

  closeCard() {
    this.card = null;
    this.audio.play('ui');
    this.nextCard();
  }

  conceptCard(key) {
    const id = 'card-' + key;
    if (this.coach && !this.coach.done) return;
    if (this.tipsSeen.has(id)) return;
    this.tipsSeen.add(id);
    this.store.meta.tips = [...this.tipsSeen];
    this.store.save();
    this.cardQueue.push(key === 'block' ? this.enemyCard('mask', null, '방패에 막혔다!') : CONCEPTS[key]);
  }

  enemyCard(type, e, kicker) {
    const sp = ENEMIES[type];
    const lines = [{ label: '특징', text: sp.act }, { label: '공략', text: sp.how, color: '#8fffe2' }];
    const aff = AFFINITY[type];
    if (aff && aff.weak) lines.push({ label: '약점', text: `${SYMBOLS[aff.weak].name} (피해 +${WEAK_BONUS})`, color: '#ffd84a' });
    if (aff && aff.resist) lines.push({ label: '저항', text: `${SYMBOLS[aff.resist].name} (직격 피해 -${RESIST_CUT})`, color: '#b8b0c8' });
    if (e && e.elite) lines.unshift({ label: '정예', text: '체력과 공격력이 높다. 처치하면 코인 +3.', color: '#ffd84a' });
    if (e && this.intents && this.intents[e.id]) {
      const it = this.intents[e.id];
      lines.push({ label: '다음', text: (INTENT_TEXT[it.kind] || (() => ''))(it), color: '#ffb0a0' });
    }
    return { kicker: kicker || (e ? '적 정보' : '새로운 적 등장'), title: sp.name, enemy: type, color: '#ffb0a0', lines };
  }

  relicCard(id) {
    const R = RELICS[id];
    const level = this.st ? this.st.relicLv[id] || 1 : 1;
    const lines = [{ label: '효과', text: R.desc }];
    if (R.fusion) lines.push({ label: '재료', text: `${RELICS[R.a].name} + ${RELICS[R.b].name} (효과 유지)`, color: '#ffe08a' });
    if (level === 2) {
      lines.push({ label: 'II', text: R.up, color: '#ffe08a' });
      lines.push({ label: '진화', text: `${this.st.relicProc[id] || 0}/${EVOLVE_AT}번 발동하면 III`, color: '#ff9ac0' });
    }
    if (level >= 3) lines.push({ label: 'III', text: '진화 완료 — 효과 3배', color: '#ff9ac0' });
    return { kicker: `유물 · ${R.tag}`, title: R.name + (level >= 3 ? ' III' : level === 2 ? ' II' : ''), relic: id, color: R.color, lines };
  }

  queueIntros() {
    if (this.coach && !this.coach.done) return;
    const seen = new Set(this.store.meta.seenEnemies || []);
    let changed = false;
    for (const e of this.st.enemies) {
      if (!e.alive || seen.has(e.type)) continue;
      seen.add(e.type);
      changed = true;
      this.cardQueue.push(this.enemyCard(e.type));
    }
    if (changed) {
      this.store.meta.seenEnemies = [...seen];
      this.store.save();
    }
  }

  enemyAtPoint(p) {
    let best = null;
    let bestD = Infinity;
    for (const v of this.views.values()) {
      if (v.dying > 0) continue;
      const q = this.renderer.viewPos(v);
      if (Math.abs(p.x - q.x) < 44 * q.s + 6 && p.y < q.y + 18 && p.y > q.y - 78 * q.k) {
        const d = Math.abs(p.y - (q.y - 26 * q.k)) + Math.abs(p.x - q.x) * 0.3;
        if (d < bestD) { bestD = d; best = v; }
      }
    }
    return best;
  }

  inspectEnemy(v) {
    const e = this.st && B.byId(this.st, v.id);
    if (!e || !e.alive) return;
    this.showCard(this.enemyCard(e.type, e));
  }

  openGuide() {
    const st = this.st;
    this.overlay.showGuide({ types: [...new Set(st.enemies.map((e) => e.type))], relics: st.relics });
  }

  // 연결·빙고·잭팟 기술 컷인
  async cutIn(sh) {
    const big = sh.tier === 3;
    const lvl = this.st.bingoLevel || 0;
    const kind = sh.bonus ? (lvl >= 3 ? '트리플 빙고 기술' : lvl === 2 ? '더블 빙고 기술' : '빙고 기술') : big ? '잭팟 기술' : '연결 기술';
    this.cutin = { sym: sh.symbol, title: SHOT_NAMES[sh.symbol][sh.tier] + (sh.gild ? ' ✦' : ''), sub: kind, color: sh.gild ? '#ffd84a' : SYMBOLS[sh.symbol].fx, t0: this.now(), dur: big ? 1050 : 620, big };
    this.audio.play('cutin', { big });
    if (big) {
      this.fx.flash(SYMBOLS[sh.symbol].fx, 0.3);
      this.buzz(80);
    }
    await this.waitReal(big ? 820 : 430);
  }

  // 화면 전체에 쏟아지는 금빛 종이(빙고·잭팟 축하)
  celebrate(level) {
    const n = 26 * Math.max(1, level);
    for (let i = 0; i < n; i++) {
      this.uiFx.particle({
        x: Math.random() * W, y: -20 - Math.random() * 160,
        vx: (Math.random() - 0.5) * 120, vy: 260 + Math.random() * 260, g: 160, drag: 0.995,
        life: 2.2, max: 2.2, size: 4 + Math.random() * 4,
        color: ['#ffe08a', '#ffb347', '#ffffff', '#e2453c', '#ffd84a'][i % 5],
        kind: 'paper', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, add: false, shrink: false,
      });
    }
  }

  pullLever() {
    if (this.lever.t >= 0 || this.card) return;
    const ok = this.mode === 'battle' && this.ui.phase === 'spin' && !this.busy;
    this.lever.t = 0;
    this.lever.ok = ok;
    this.audio.play(ok ? 'lever' : 'deny');
    if (ok) {
      this.buzz(25);
      this.slotJolt = 1;
      this.doSpin();
    }
  }

  async startBattle() {
    const def = this.run.def;
    this.checkpoint('battle');
    this.coach = this.run.tutorial && this.run.stage === 0 ? { fired: false, reacted: false, rerollSeen: false, done: false } : null;
    const { st, events } = B.createBattle(def, battleOptions(this.run));
    this.st = st;
    this.def = def;
    this.mode = 'battle';
    this.views.clear();
    this.projs = [];
    this.fx.clear();
    this.strips = st.strips;
    this.hud.hp = this.hud.hpLag = st.player.hp;
    this.banked = false;
    this.pile = this.coinShown = this.run.coins;
    this.flies = [];
    this.player.x = this.player.tx = W / 2;
    this.ui = { phase: 'busy', sel: null, hoverLane: -1, armedLane: -1, preview: null, react: null, counter: null };
    this.busy = true;
    this.refresh();
    this.showBanner(`${this.run.tier ? `${this.run.tier + 1}단계 · ` : ''}${def.night} · ${def.name}`, def.intro + (def.mods && def.mods.length ? '  ·  조건: ' + def.mods.map((m) => MODS_NAME(m)).join(', ') : ''), 2.4);
    this.audio.play('turn');
    await this.wait(500);
    await this.playEvents(events);
    await this.wait(400);
    this.beginPlayerTurn();
  }

  beginPlayerTurn() {
    this.busy = false;
    this.ui.phase = 'spin';
    this.ui.sel = null;
    this.ui.preview = null;
    this.audio.setIntensity(0);
    this.refresh();
    // 연출이 생략된 코인이 있으면 쟁반에 맞춰 둔다
    if (this.coinShown < this.trayTarget()) {
      this.pile += this.trayTarget() - this.coinShown;
      this.coinShown = this.trayTarget();
    }
    this.queueIntros();
    this.nextCard();
    this.tip('spin', '오른쪽 레버를 당겨 이번 턴의 공격을 뽑으세요.');
  }

  // ─────────────── 갱신(예고·위험·정보) ───────────────
  refresh() {
    const st = this.st;
    if (!st) return;
    this.intents = B.computeIntents(st);
    this.upcoming = B.upcomingSpawns(st);
    this.objective = B.objectiveProgress(st);
    this.dangers = [];
    for (const e of st.enemies) {
      if (!e.alive) continue;
      const it = st.def.mods.includes('fog') && e.row < 3 ? null : this.intents[e.id];
      if (it && it.kind === 'attack') this.dangers.push({ lane: e.lane, row: e.row, style: it.style });
      if (it && it.kind === 'brace') this.dangers.push({ lane: e.lane, row: e.row, style: 'heavy' });
    }
    this.omenMark = null;
    if (this.ui.phase === 'aim' && B.canReroll(st) && !(B.has(st, 'windfall') && st.rerollCount === 0)) {
      const d = B.describeOmen(st, st.omens[st.rerollCount]);
      if (d) this.omenMark = d;
    }
    this.updateInfo();
    this.buttons = this.makeButtons();
  }

  updateInfo() {
    const st = this.st;
    const ui = this.ui;
    if (ui.tipText) {
      this.info = { text: ui.tipText, color: '#ffe08a' };
      return;
    }
    if (ui.phase === 'aim' && ui.sel != null && st.shots[ui.sel]) {
      const sh = st.shots[ui.sel];
      const symLv = (st.symLv && st.symLv[sh.symbol]) || 0;
      let text = (sh.gild ? '✦금빛 ' : '') + shotDesc(sh.symbol, sh.tier, sh.gild, symLv);
      if (sh.symbol === 'lantern') {
        const cap = B.guardCap(st);
        const gain = Math.min(cap - st.player.guard, shotStats(sh.symbol, sh.tier, sh.gild, symLv).guard);
        text = gain > 0 ? `방어막 +${gain} (지금 ${st.player.guard}/${cap})  ▶ 한 번 더 눌러 사용` : `방어막이 이미 가득 (${cap}/${cap}) — 써도 늘지 않는다`;
      }
      let color = SYMBOLS[sh.symbol].fx;
      if (ui.preview && sh.symbol !== 'lantern') {
        const per = Object.values(ui.preview.summary.per);
        const dmg = per.reduce((a, p) => a + p.dmg, 0);
        const kills = per.filter((p) => p.killed).length;
        if (per.some((p) => p.blocked) && dmg === 0) {
          const left = Math.min(...per.filter((p) => p.blocked).map((p) => p.shieldLeft ?? 0));
          text = left === 0 ? '방패를 깨뜨린다! 다음 공격부터 피해가 들어간다' : `방패에 금이 간다 (남은 방패 ${left}) — 한 번 더 치면 깨진다`;
          color = '#50f0be';
        } else {
          const bane = per.some((p) => p.tags.includes('bane'));
          const resist = per.some((p) => p.tags.includes('resist'));
          const pushed = per.some((p) => p.pushed);
          const combo = [['shatter', '파쇄'], ['detonate', '감전 폭발'], ['surge', '감전'], ['conduct', '초전도'], ['deepFreeze', '꽁꽁'], ['fester', '독 깊어짐']].filter(([t]) => per.some((p) => p.tags.includes(t))).map(([, n]) => n);
          text = `${ui.preview.snipe ? '저격 · ' : ''}예상 피해 ${dmg}${kills ? ` · 처치 ${kills}` : ''}${bane ? ' · 약점' : ''}${resist ? ' · 저항' : ''}${pushed ? ' · 밀어냄' : ''}${combo.length ? ' · 조합: ' + combo.join('·') : ''}${per.some((p) => p.blocked) ? ' · 일부 막힘' : ''}`;
        }
      } else if (!ui.preview && sh.symbol !== 'lantern') {
        text += '  ▶ 레인을 누르세요';
      }
      this.info = { title: (sh.bonus ? '빙고 기술 ' : '') + SHOT_NAMES[sh.symbol][sh.tier] + (sh.gild ? ' ✦' : ''), text, color: sh.gild ? '#ffd84a' : color };
      return;
    }
    if (ui.phase === 'spin') this.info = { text: '오른쪽 레버를 당겨 공격을 뽑으세요  (적을 우클릭하면 정보)' };
    else if (ui.phase === 'spinning') this.info = { text: '…' };
    else if (ui.phase === 'react' && ui.react) {
      const st2 = ui.react.attack.style;
      this.info = st2 === 'heavy'
        ? { title: '붉은 고리!', text: '원에 닿는 순간 [회피] (막기로는 버티기 어렵다)', color: '#ff6a6a' }
        : { title: '금빛 고리!', text: '원에 닿는 순간 [막기] → 정확하면 되치기', color: '#ffcc33' };
    } else if (ui.phase === 'enemy') this.info = { text: '금빛 고리 = 막기로 되치기  ·  붉은 고리 = 회피', color: '#ffd27a' };
    else this.info = null;
  }

  makeButtons() {
    const L = this.L;
    const st = this.st;
    const ui = this.ui;
    const y = L.btn.y + 10;
    const h = 78;
    const btns = [];
    if (this.mode !== 'battle' || !st) return btns;
    const enemyMode = ui.phase === 'enemy' || ui.phase === 'react' || ui.phase === 'counter';
    if (enemyMode) {
      const live = ui.phase === 'react' && !ui.react?.input;
      const heavy = ui.react?.attack.style === 'heavy';
      const sta = st.player.stamina ?? STAMINA.max;
      btns.push({ id: 'guard', x: 14, y, w: 252, h, label: '막기', sub: sta >= STAMINA.guard ? `기력 ${STAMINA.guard} · 퍼펙트=되치기` : '기력 없음 — 막을 수 없다', style: 'guard', icon: 'shield', enabled: live, hot: live && !heavy, key: 'J / Space', big: true });
      btns.push({ id: 'dodge', x: 274, y, w: 252, h, label: '회피', sub: sta >= STAMINA.dodge ? `기력 ${STAMINA.dodge} · 성공=적에게 빈틈` : sta >= STAMINA.perfectDodge ? '기력 부족 — 퍼펙트만 통한다' : '기력 없음 — 피할 수 없다', style: 'dodge', icon: 'move', enabled: live, hot: live && heavy, key: 'K / Shift', big: true });
      return btns;
    }
    const aim = ui.phase === 'aim';
    const canRe = aim && B.canReroll(st) && !this.busy;
    const maxRe = 2 + (st.relics.includes('gamblerCoin') ? 1 : 0);
    let sub;
    let sub2 = null;
    let subColors = null;
    const myTurn = aim || ui.phase === 'busy';
    if (!myTurn) sub = '레버를 당긴 뒤, 결과가 아쉬우면 사용';
    else if (st.shotsFired > 0) sub = '이미 공격을 시작해서 이번 턴은 불가';
    else if (st.rerollsLeft <= 0) sub = '이번 턴 횟수를 다 썼다';
    else {
      const d = B.describeOmen(st, st.omens[st.rerollCount]);
      sub = B.has(st, 'windfall') && st.rerollCount === 0 ? '대가 없음 (대박)' : `대가: ${d ? d.text : '?'}`;
      sub2 = st.holds && st.holds.some(Boolean) ? '고정한 릴은 그대로 · 금빛 릴 +1' : '보상: 금빛 릴 +1';
      subColors = ['#ffb8c8', '#ffe08a'];
    }
    btns.push({ id: 'reroll', x: 14, y, w: 322, h, label: '다시 돌리기', pips: myTurn ? st.rerollsLeft : maxRe, pipMax: maxRe, sub, sub2, subColors, style: 'gamble', enabled: canRe, key: 'R' });
    const left = B.shotsLeft(st);
    const confirm = ui.confirmEnd;
    btns.push({
      id: 'end', x: 346, y, w: 180, h,
      label: confirm ? '정말 종료?' : '턴 종료',
      sub: !myTurn ? '공격한 뒤 사용' : left ? (confirm ? `공격 ${left}개를 버림` : `남은 공격 ${left}개`) : '공격 완료',
      style: confirm ? 'primary' : 'secondary', enabled: aim && !this.busy, key: 'Enter',
    });
    return btns;
  }

  tip(id, text) {
    if (this.coach && !this.coach.done) return;
    if (this.tipsSeen.has(id) || this.run?.stage > 0) return;
    this.tipsSeen.add(id);
    this.store.meta.tips = [...this.tipsSeen];
    this.store.save();
    this.ui.tipText = text;
    this.ui.tipUntil = this.now() + 4200;
    this.updateInfo();
  }

  showBanner(title, sub, dur = 1.4, color, size) {
    this.banner = { title, sub, dur, t0: this.now(), color, size };
  }

  // ─────────────── 입력 ───────────────
  onPointerDown(e) {
    this.audio.unlock();
    const p = this.toLogical(e.clientX, e.clientY);
    const touch = e.pointerType !== 'mouse';
    if (this.mode !== 'battle') return;
    if (this.card) {
      if (this.now() - this.card.t0 > 250) this.closeCard();
      return;
    }
    const inR = (r, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
    const reacting = this.ui.react || this.ui.counter; // 반응 도중에는 다른 창을 열지 않는다(판정 손실 방지)
    if (inR(this.gearRect)) {
      if (!reacting) this.overlay.openSettings();
      return;
    }
    if (inR(this.helpRect)) {
      if (!reacting) this.openGuide();
      return;
    }
    if (!reacting && this.st) {
      if (inR(trayRect(this.L), 2)) {
        this.showCard(CONCEPTS.coin);
        return;
      }
      if (this.st.def.mods.length && p.y >= this.L.hudH && p.y <= this.L.hudH + 30 && p.x < 300) {
        this.showCard({ kicker: '험한 길', title: '이번 밤의 조건', color: '#ff9a8a', lines: this.st.def.mods.map((m) => ({ label: MODS[m].name, text: MODS[m].desc, color: '#ff9a8a' })) });
        return;
      }
      const shown = this.shownRelics;
      for (let i = 0; i < shown.length; i++) {
        if (inR(this.relicRect(i), 3)) {
          this.showCard(this.relicCard(shown[i]));
          return;
        }
      }
    }
    for (const b of this.buttons) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h + 8) {
        if (!b.enabled) {
          this.audio.play('deny');
          return;
        }
        this.pressedBtn = { id: b.id, until: this.now() + 120 };
        this.press(b.id);
        return;
      }
    }
    if (inR(leverRect(this.L))) {
      this.pullLever();
      return;
    }
    // 릴 고정 자물쇠
    if (this.st && this.ui.phase === 'aim' && !this.busy && B.canReroll(this.st)) {
      for (let i = 0; i < 3; i++) {
        if (inR(this.holdRect(i), 4)) {
          this.toggleHold(i);
          return;
        }
      }
    }
    // 슬롯 칸 선택: 가운데 줄 = 그 릴의 공격, 빙고가 걸린 위·아래 칸 = 그 빙고 기술
    for (let i = 0; i < 3; i++) {
      const r = reelRect(this.L, i);
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h + 34) {
        const row = clamp(Math.floor((p.y - r.y - REEL_PEEK) / REEL_CELL), 0, 2);
        const st = this.st;
        if (st && p.y <= r.y + r.h && this.ui.phase === 'aim' && !this.busy) {
          const hits = (st.bingos || []).filter((b) => b.cells.some(([c, rr]) => c === i && rr === row))
            .map((b) => st.shots.findIndex((s) => s.bonus === b.id)).filter((si) => si >= 0 && !st.shots[si].used);
          // 가운데 칸은 그 릴의 공격이 우선. 위·아래 칸(또는 가운데 공격을 이미 쓴 경우)은 빙고 기술.
          const midIdx = shotForReel(st.shots, i);
          const midFree = midIdx >= 0 && !st.shots[midIdx].used;
          if (hits.length && (row !== 1 || !midFree)) {
            const cur = hits.indexOf(this.ui.sel);
            this.selectShot(hits[(cur + 1) % hits.length], touch); // 겹치는 칸을 다시 누르면 다른 빙고로
            return;
          }
        }
        this.selectReel(i, touch);
        return;
      }
    }
    // 레인 (적을 길게 누르면 정보 카드)
    const lane = laneAt(this.L, p.x, p.y);
    if (lane >= 0) {
      const v = this.enemyAtPoint(p);
      if (v && !reacting) this.hold = { id: v.id, at: this.now() };
      if (this.ui.phase === 'aim' && !this.ui.counter) {
        // 뒤에 있는 적을 직접 누르면 그 적을 노린다(터치는 노리는 적이 바뀌면 다시 조준부터)
        const depth = this.depthOfView(v, lane);
        if (touch && this.ui.armedLane === lane && depth !== (this.ui.aimDepth || 0)) this.ui.armedLane = -1;
        this.ui.aimDepth = depth;
      }
      this.tapLane(lane, touch);
    }
  }

  onPointerUp() {
    this.hold = null;
  }

  // 마우스 오른쪽 클릭 = 적 정보
  onContext(e) {
    if (this.mode !== 'battle' || this.card || this.ui.react || this.ui.counter) return;
    const pt = this.toLogical(e.clientX, e.clientY);
    // 릴을 우클릭하면 고정
    for (let i = 0; i < 3; i++) {
      const r = reelRect(this.L, i);
      if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y - 14 && pt.y <= r.y + r.h) {
        this.toggleHold(i);
        return;
      }
    }
    const v = this.enemyAtPoint(pt);
    if (v) this.inspectEnemy(v);
  }

  onPointerMove(e) {
    if (e.pointerType !== 'mouse' || this.mode !== 'battle') return;
    const p = this.toLogical(e.clientX, e.clientY);
    const lane = laneAt(this.L, p.x, p.y);
    const hb = this.buttons.find((b) => b.enabled && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h + 8);
    this.hoverBtn = hb ? hb.id : null;
    this.canvas.style.cursor = hb ? 'pointer' : '';
    if (this.ui.counter) {
      if (lane >= 0) this.setCounterHover(lane);
      return;
    }
    if (this.ui.phase === 'aim' && !this.busy) {
      const depth = lane >= 0 ? this.depthOfView(this.enemyAtPoint(p), lane) : 0;
      if (lane !== this.ui.hoverLane || depth !== (this.ui.aimDepth || 0)) {
        this.ui.hoverLane = lane;
        this.ui.aimDepth = depth;
        this.updatePreview();
      }
    }
  }

  onKey(e) {
    if (this.mode !== 'battle') return;
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    const ui = this.ui;
    if (k === 'escape') {
      if (!ui.react && !ui.counter) this.overlay.openSettings();
      return;
    }
    if (ui.phase === 'react') {
      if (k === ' ' || k === 'j' || k === 'z') { e.preventDefault(); this.press('guard'); }
      if (k === 'shift' || k === 'k' || k === 'x') { e.preventDefault(); this.press('dodge'); }
      return;
    }
    if (ui.counter) {
      if (['1', '2', '3'].includes(k)) this.pickCounter(Number(k) - 1);
      return;
    }
    if (this.card) {
      this.closeCard();
      return;
    }
    if (k === ' ') { e.preventDefault(); if (ui.phase === 'spin') this.pullLever(); }
    if (k === 'h' || k === '?') this.openGuide();
    if (k === 'r') this.press('reroll');
    if (k === 'f') this.shiftAim(1, true);
    if (['a', 's', 'd'].includes(k)) this.toggleHold('asd'.indexOf(k));
    if (k === 'b' && this.st) {
      const bi = this.st.shots.findIndex((s) => s.bonus && !s.used);
      if (bi >= 0) this.selectShot(bi, true);
    }
    if (k === 'enter') this.press('end');
    if (['q', 'w', 'e'].includes(k)) this.selectReel('qwe'.indexOf(k), true);
    if (['1', '2', '3'].includes(k)) this.tapLane(Number(k) - 1, true);
  }

  // 게임패드 입력(버튼 이름: a b x y lb rb up down left right start select)
  onPad(btn) {
    if (this.mode !== 'battle') return;
    const ui = this.ui;
    const st = this.st;
    if (btn === 'start') {
      if (!ui.react && !ui.counter) this.overlay.openSettings();
      return;
    }
    if (ui.phase === 'react') {
      if (btn === 'a') this.press('guard');
      if (btn === 'b' || btn === 'x') this.press('dodge');
      return;
    }
    if (ui.counter) {
      const c = ui.counter;
      if (btn === 'left' || btn === 'right') this.setCounterHover(clamp((c.hover ?? c.def ?? 1) + (btn === 'left' ? -1 : 1), 0, 2));
      if (btn === 'a') this.pickCounter(c.hover ?? c.def ?? 1);
      return;
    }
    if (this.card) {
      if (btn === 'a' || btn === 'b') this.closeCard();
      return;
    }
    if (btn === 'select') return this.openGuide();
    if (btn === 'x') return this.press('reroll');
    if (btn === 'y') return this.press('end');
    if (ui.phase === 'spin') {
      if (btn === 'a') this.pullLever();
      return;
    }
    if (ui.phase !== 'aim' || this.busy || !st) return;
    if (btn === 'up' || btn === 'down') {
      // 위 = 더 뒤의 적, 아래 = 앞의 적
      if (ui.hoverLane < 0) ui.hoverLane = 1;
      return this.shiftAim(btn === 'up' ? 1 : -1);
    }
    if (btn === 'lb' || btn === 'rb') {
      // 아직 안 쓴 공격 패 사이를 오간다
      const open = st.shots.map((s, i) => (s.used ? -1 : i)).filter((i) => i >= 0);
      if (!open.length) return;
      const at = open.indexOf(ui.sel);
      const dir = btn === 'lb' ? -1 : 1;
      this.selectShot(open[at < 0 ? 0 : (at + dir + open.length) % open.length], false);
      return;
    }
    if (btn === 'left' || btn === 'right') {
      const lane = ui.hoverLane < 0 ? 1 : clamp(ui.hoverLane + (btn === 'left' ? -1 : 1), 0, 2);
      if (lane !== ui.hoverLane) {
        ui.hoverLane = lane;
        ui.armedLane = -1;
        this.audio.play('aim');
        this.updatePreview();
      }
      return;
    }
    if (btn === 'a' && ui.sel != null) {
      if (st.shots[ui.sel] && st.shots[ui.sel].symbol === 'lantern') return this.fire(1);
      if (ui.hoverLane < 0) {
        // 처음에는 가운데 레인을 가리키기만 한다(무엇을 맞힐지 먼저 보이게)
        ui.hoverLane = 1;
        this.audio.play('aim');
        this.updatePreview();
        return;
      }
      this.fire(ui.hoverLane);
    }
  }

  press(id) {
    const ui = this.ui;
    if (id === 'spin') return this.pullLever();
    if (id === 'reroll') return this.doReroll();
    if (id === 'end') {
      if (ui.phase !== 'aim' || this.busy) return;
      if (B.shotsLeft(this.st) > 0 && !ui.confirmEnd) {
        ui.confirmEnd = true;
        this.audio.play('ui');
        this.refresh();
        return;
      }
      return this.enemyPhase();
    }
    if (id === 'guard' || id === 'dodge') return this.reactInput(id);
  }

  // HUD에 보일 유물: 융합한 재료는 융합 유물 하나로 묶어 보여준다
  get shownRelics() {
    const st = this.st;
    if (!st) return [];
    const hidden = new Set();
    for (const id of st.relics) if (FUSIONS[id]) { hidden.add(FUSIONS[id].a); hidden.add(FUSIONS[id].b); }
    return st.relics.filter((id) => !hidden.has(id));
  }

  get guardCap() {
    return this.st ? B.guardCap(this.st) : 6;
  }

  // 공격 패 선택(가운데 줄 릴 또는 빙고 보너스)
  selectShot(idx, touch) {
    const st = this.st;
    if (this.ui.phase !== 'aim' || this.busy || !st) return;
    const sh = st.shots[idx];
    if (!sh || sh.used) {
      this.audio.play('deny');
      return;
    }
    if (this.ui.sel === idx && sh.symbol === 'lantern') return this.fire(1);
    this.ui.sel = idx;
    this.ui.aimDepth = 0;
    this.ui.armedLane = -1;
    this.ui.confirmEnd = false;
    this.audio.play('select');
    if (touch) this.ui.hoverLane = -1;
    this.updatePreview();
  }

  // 조합이 터진 자리에 원인을 띄운다: [문양 a] + [문양 b]
  comboBadge(x, y, a, b) {
    if (this.comboBadges.some((c) => Math.abs(c.x - x) < 30 && Math.abs(c.y0 - y) < 30 && c.a === a && c.b === b && c.life > c.max - 0.2)) return;
    this.comboBadges.push({ x, y, y0: y, a, b, life: 1.5, max: 1.5 });
  }

  // 릴 위 자물쇠의 위치(다시 돌리기가 가능할 때만 누를 수 있다)
  holdRect(i) {
    const r = reelRect(this.L, i);
    return { x: r.x + r.w / 2 - 30, y: r.y - 13, w: 60, h: 24 };
  }

  toggleHold(i) {
    const st = this.st;
    if (!st || this.ui.phase !== 'aim' || this.busy) return;
    if (!B.toggleHold(st, i)) {
      this.audio.play('deny');
      this.ui.tipText = !B.canReroll(st) ? (st.shotsFired > 0 ? '공격을 시작한 뒤에는 고정할 수 없다' : '다시 돌리기가 남아 있을 때만 고정할 수 있다') : '릴은 두 개까지만 고정할 수 있다';
      this.ui.tipUntil = this.now() + 1800;
      this.updateInfo();
      return;
    }
    this.audio.play(st.holds[i] ? 'select' : 'ui');
    this.refresh();
  }

  selectReel(i, touch) {
    const st = this.st;
    if (this.ui.phase !== 'aim' || this.busy || !st) return;
    const idx = shotForReel(st.shots, i);
    if (idx < 0 || st.shots[idx].used) {
      this.audio.play('deny');
      return;
    }
    // 이미 선택된 등불 패를 다시 누르면 사용
    if (this.ui.sel === idx && st.shots[idx].symbol === 'lantern') return this.fire(1);
    this.ui.sel = idx;
    this.ui.aimDepth = 0;
    this.ui.armedLane = -1;
    this.ui.confirmEnd = false;
    this.audio.play('select');
    if (touch) this.ui.hoverLane = -1;
    this.updatePreview();
    if (st.shots[idx].symbol === 'lantern') this.tip('lantern', '등불은 방어막! 레인 아무 곳이나 누르거나 한 번 더 눌러 사용.');
  }

  tapLane(lane, touch) {
    if (this.ui.counter) return this.pickCounter(lane);
    if (this.ui.phase !== 'aim' || this.busy || this.ui.sel == null) return;
    if (!touch || this.ui.armedLane === lane) return this.fire(lane);
    this.ui.armedLane = lane;
    this.ui.hoverLane = lane;
    this.audio.play('aim');
    this.updatePreview();
    this.tip('arm', '같은 레인을 한 번 더 누르면 발사!');
  }

  // 이 레인에 지금 쏘면 몇 번째 적을 노리게 되는가(0 = 맨 앞). 저격을 못 쓰는 상황이면 0.
  aimDepthFor(lane) {
    const ui = this.ui;
    const st = this.st;
    if (!st || ui.sel == null || !(ui.aimDepth > 0) || !B.canSnipe(st, ui.sel)) return 0;
    return Math.max(0, Math.min(ui.aimDepth, B.laneTargets(st, lane).length - 1));
  }

  // 화면에서 가리킨 적이 그 레인에서 몇 번째인가
  depthOfView(v, lane) {
    if (!v || !this.st || v.lane !== lane) return 0;
    const i = B.laneTargets(this.st, lane).findIndex((e) => e.id === v.id);
    return i > 0 ? i : 0;
  }

  // 키보드·패드: 노리는 깊이를 바꾼다
  shiftAim(d, wrap = false) {
    const ui = this.ui;
    const st = this.st;
    if (ui.phase !== 'aim' || this.busy || !st || ui.sel == null) return;
    if (!B.canSnipe(st, ui.sel)) {
      this.audio.play('deny');
      this.ui.tipText = (st.snipes || 0) <= 0 ? '저격은 턴마다 1번' : '이 공격은 저격할 수 없다(이미 여러 적을 맞힌다)';
      this.ui.tipUntil = this.now() + 1800;
      this.updateInfo();
      return;
    }
    const lane = ui.armedLane >= 0 ? ui.armedLane : ui.hoverLane;
    const max = Math.max(0, (lane >= 0 ? B.laneTargets(st, lane).length : Math.max(...[0, 1, 2].map((l) => B.laneTargets(st, l).length))) - 1);
    let next = (ui.aimDepth || 0) + d;
    if (wrap) next = next > max ? 0 : next;
    next = clamp(next, 0, max);
    if (next === (ui.aimDepth || 0)) return;
    ui.aimDepth = next;
    this.audio.play('aim');
    this.updatePreview();
  }

  updatePreview() {
    const ui = this.ui;
    const st = this.st;
    const lane = ui.armedLane >= 0 ? ui.armedLane : ui.hoverLane;
    if (ui.phase !== 'aim' || ui.sel == null || lane < 0 || !st.shots[ui.sel] || st.shots[ui.sel].used) {
      ui.preview = null;
    } else {
      const sh = st.shots[ui.sel];
      const depth = this.aimDepthFor(lane);
      const pv = B.previewShot(st, ui.sel, lane, depth);
      ui.preview = {
        snipe: depth > 0 ? B.laneTargets(st, lane)[depth].id : null,
        lane, symbol: sh.symbol, gild: sh.gild > 0, summary: pv.summary, cells: pv.summary.cells,
        global: sh.tier === 3 && sh.symbol !== 'blade' && sh.symbol !== 'lantern',
        lanes: sh.symbol === 'lantern' ? [] : sh.tier === 3 && sh.symbol === 'blade' ? [lane - 1, lane, lane + 1].filter((l) => l >= 0 && l < 3) : [lane],
      };
    }
    this.refresh();
  }

  // ─────────────── 슬롯 ───────────────
  async doSpin() {
    if (this.ui.phase !== 'spin' || this.busy) return;
    this.busy = true;
    this.ui.phase = 'spinning';
    this.ui.tipText = null;
    this.refresh();
    const evs = B.spin(this.st);
    const si = evs.findIndex((e) => e.type === 'spin');
    await this.animateSpin(evs[si]);
    await this.playEvents(evs.slice(si + 1));
    this.afterSpin();
  }

  async doReroll() {
    if (!B.canReroll(this.st) || this.busy || this.ui.phase !== 'aim') return;
    this.busy = true;
    this.ui.phase = 'spinning';
    this.ui.preview = null;
    this.refresh();
    const evs = B.reroll(this.st);
    const si = evs.findIndex((e) => e.type === 'spin');
    await this.playEvents(evs.slice(0, si));
    await this.animateSpin(evs[si], true);
    await this.playEvents(evs.slice(si + 1));
    this.afterSpin();
  }

  afterSpin() {
    this.busy = false;
    this.ui.phase = 'aim';
    this.ui.confirmEnd = false;
    const bonusFirst = this.st.shots.findIndex((s) => s.bonus && !s.used);
    this.ui.sel = bonusFirst >= 0 ? bonusFirst : this.st.shots.findIndex((s) => !s.used);
    this.ui.armedLane = -1;
    this.updatePreview();
    if (this.st.reels.some((r) => r.gilded)) this.conceptCard('gild');
    if (this.st.turn >= 2 || this.run.stage > 0) this.conceptCard('reroll');
    if ((this.st.turn >= 3 || this.run.stage > 0) && B.canReroll(this.st)) this.conceptCard('hold');
    if ([0, 1, 2].some((l) => B.laneTargets(this.st, l).length >= 2)) this.conceptCard('snipe');
    this.nextCard();
    this.tip('aim', '릴을 골라 공격을 정하고, 레인을 눌러 조준하세요.');
  }

  animateSpin(ev, isReroll = false) {
    return new Promise((resolve) => {
      this.audio.play('spinStart');
      const now = this.rt;
      this.reels.forEach((r, i) => {
        if (ev.holds && ev.holds[i]) {
          r.gilded = ev.reels[i].gilded;
          r.flashT = 0.5;
          return;
        }
        r.spinning = true;
        r.tween = null;
        r.vel = 30 + i * 2;
        r.stopAt = now + 0.55 + i * 0.3 + (isReroll ? -0.12 : 0);
        r.target = ev.reels[i].stop;
        r.gilded = ev.reels[i].gilded;
        r.landed = false;
      });
      this.spinDone = () => {
        const top = Math.max(...ev.shots.filter((s) => !s.bonus).map((s) => s.tier));
        const rects = [0, 1, 2].map((i) => reelRect(this.L, i));
        if (top === 3) {
          const sh = ev.shots[0];
          this.audio.play('jackpot');
          this.fx.flash('#ffe08a', 0.5);
          this.fx.shake(3);
          this.slotJolt = 1.6;
          this.buzz(120);
          this.showBanner(`잭팟! ${SHOT_NAMES[sh.symbol][3]}`, null, 1.6, '#ffe08a', 40);
          this.reels.forEach((r) => (r.flashT = 1));
          for (const rc of rects) {
            this.uiFx.burst(rc.x + rc.w / 2, rc.y + rc.h / 2, { n: 26, speed: 340, color: ['#ffe08a', '#ffffff', '#ffb347', SYMBOLS[sh.symbol].fx], kind: 'streak', size: 4.5, life: 0.7, g: 300 });
            this.uiFx.ring(rc.x + rc.w / 2, rc.y + rc.h / 2, { r0: 20, r1: 130, color: '#ffe08a', w: 7, life: 0.5 });
          }
        } else if (top === 2) {
          const sh = ev.shots.find((s) => s.tier === 2 && !s.bonus);
          this.audio.play('link', { tier: 2 });
          this.slotJolt = 1.1;
          this.buzz(45);
          sh.reels.forEach((i) => (this.reels[i].flashT = 0.9));
          const a = rects[sh.reels[0]];
          const b = rects[sh.reels[1]];
          const mx = (a.x + a.w + b.x) / 2;
          const my = a.y + a.h / 2;
          this.uiFx.burst(mx, my, { n: 22, speed: 260, color: ['#ff8a5a', '#ffe08a', '#ffffff'], kind: 'streak', size: 4, life: 0.5 });
          this.uiFx.ring(mx, my, { r0: 10, r1: 90, color: '#ff8a5a', w: 6, life: 0.4 });
          this.uiFx.text(mx, a.y - 16, `연결! ${SHOT_NAMES[sh.symbol][2]}`, { color: '#ffd27a', size: 24, font: 'num', life: 1.1, vy: -24 });
        }
        // 빙고 단계별 축하: 1줄 < 더블 < 트리플
        const bingos = ev.bingos || [];
        const level = ev.level || 0;
        if (top === 3) this.celebrate(2);
        if (bingos.length) {
          this.audio.play('bingo', { level });
          this.fx.flash('#ffe08a', Math.min(0.75, 0.3 + level * 0.14));
          this.fx.shake(Math.min(4, 1 + level));
          this.fx.punchIn(0.014 * level);
          this.slotJolt = 1.4 + level * 0.5;
          this.buzz(100 + level * 70);
          for (const b of bingos) {
            b.cells.forEach(([c, r], k) => {
              const q = slotCell(this.L, c, r);
              this.uiFx.burst(q.x, q.y, { n: 14 + level * 6, speed: 280 + level * 60, color: ['#ffe08a', '#ffffff', '#ffb347', SYMBOLS[b.symbol].fx], kind: 'streak', size: 4.5, life: 0.6 + k * 0.08, g: 260 });
              this.uiFx.ring(q.x, q.y, { r0: 14, r1: 60 + level * 16, color: '#ffe08a', w: 6, life: 0.4 + k * 0.08 });
              this.uiFx.impact(q.x, q.y, 40 + level * 10, '#ffe08a');
            });
          }
          const title = level >= 3 ? '트리플 빙고!!!' : level === 2 ? '더블 빙고!!' : '빙고!';
          const sub = level >= 3 ? '빙고 기술이 전부 금빛 잭팟으로!' : level === 2 ? '빙고 기술이 잭팟급으로 강화!' : `보너스 기술 +${SHOT_NAMES[bingos[0].symbol][2]}`;
          this.showBanner(title, sub, 1.4 + level * 0.3, '#ffe08a', 36 + level * 7);
          this.celebrate(level);
          this.conceptCard('bingo');
        }
        this.waitReal(bingos.length ? 750 + level * 280 : top >= 2 ? 460 : 120).then(resolve);
      };
    });
  }

  updateReels(dt) {
    let allLanded = true;
    let anySpinning = false;
    this.reels.forEach((r, i) => {
      r.flashT = Math.max(0, r.flashT - dt * 2.5);
      r.bump = Math.max(0, r.bump - dt * 8);
      if (!r.spinning) return;
      anySpinning = true;
      const len = this.strips[i].length;
      if (r.tween) {
        const tw = r.tween;
        tw.t += dt / tw.dur;
        const k = Math.min(1, tw.t);
        const c1 = 1.4;
        const e = 1 + (c1 + 1) * (k - 1) ** 3 + c1 * (k - 1) ** 2;
        const prev = r.pos;
        r.pos = tw.from + (tw.to - tw.from) * e;
        r.vel = (r.pos - prev) / Math.max(dt, 1e-4);
        if (k >= 1) {
          r.pos = tw.to;
          r.vel = 0;
          r.spinning = false;
          r.tween = null;
          r.bump = 1;
          this.audio.play('reelStop', { i });
          {
            const rc = reelRect(this.L, i);
            this.slotJolt = 1;
            this.buzz(18);
            this.uiFx.burst(rc.x + rc.w / 2, rc.y + rc.h + 2, { n: 12, speed: 200, color: ['#ffe08a', '#ffffff', '#d8a548'], kind: 'streak', size: 3.5, life: 0.32, angle: Math.PI / 2, spread: 2.8 });
            this.uiFx.burst(rc.x + rc.w / 2, rc.y - 2, { n: 6, speed: 120, color: ['#ffe08a', '#d8a548'], kind: 'streak', size: 3, life: 0.25, angle: -Math.PI / 2, spread: 2.4 });
            r.flashT = Math.max(r.flashT, 0.35);
          }
          if (r.gilded) {
            this.audio.play('gild');
            r.flashT = 0.6;
          }
        } else allLanded = false;
        return;
      }
      allLanded = false;
      const prev = r.pos;
      r.pos += r.vel * dt;
      if (Math.floor(r.pos) !== Math.floor(prev)) this.audio.play('tick', { pitch: 1 + i * 0.1 });
      if (this.rt >= r.stopAt) {
        let to = Math.ceil(r.pos + 2.5);
        while ((((to % len) + len) % len) !== r.target) to++;
        r.tween = { from: r.pos, to, t: 0, dur: 0.42 };
      }
    });
    if (anySpinning && allLanded && this.spinDone) {
      const f = this.spinDone;
      this.spinDone = null;
      f();
    } else if (!anySpinning && this.spinDone) {
      const f = this.spinDone;
      this.spinDone = null;
      f();
    }
  }

  // ─────────────── 공격 ───────────────
  async fire(lane) {
    const ui = this.ui;
    const st = this.st;
    if (this.busy || ui.phase !== 'aim' || ui.sel == null) return;
    const i = ui.sel;
    if (!st.shots[i] || st.shots[i].used) return;
    this.busy = true;
    ui.phase = 'busy';
    ui.preview = null;
    ui.armedLane = -1;
    ui.tipText = null;
    this.refresh();
    const depth = this.aimDepthFor(lane);
    ui.aimDepth = 0;
    if (st.shots[i].tier >= 2 && st.shots[i].symbol !== 'lantern') await this.cutIn(st.shots[i]);
    const evs = B.fireShot(st, i, lane, depth);
    if (this.coach) this.coach.fired = true;
    await this.playEvents(evs);
    this.player.tx = W / 2;
    if (st.result) return this.endBattle();
    this.busy = false;
    ui.phase = 'aim';
    ui.sel = st.shots.findIndex((s) => !s.used);
    if (ui.sel < 0) ui.sel = null;
    this.updatePreview();
    this.nextCard();
    if (ui.sel == null) {
      await this.wait(250);
      while (this.card) await this.wait(100);
      this.enemyPhase();
    }
  }

  // ─────────────── 적의 차례 ───────────────
  async enemyPhase() {
    const st = this.st;
    if (st.phase !== 'aim') return;
    this.busy = true;
    if (this.coach && st.turn >= 2) this.coach.rerollSeen = true;
    if (this.coach && st.turn >= 3 && this.coach.reacted) this.finishCoach();
    this.ui.phase = 'enemy';
    this.ui.preview = null;
    this.ui.sel = null;
    this.ui.confirmEnd = false;
    if (B.alive(st).length) this.conceptCard('stamina');
    this.nextCard();
    while (this.card) await this.wait(100);
    this.audio.setIntensity(1);
    this.refresh();
    await this.playEvents(B.endPlayerTurn(st));
    if (st.result) return this.endBattle();
    for (let guard = 0; guard < 80; guard++) {
      const step = B.nextEnemyStep(st);
      const pre = step.done ? [] : step.events;
      await this.playEvents(pre);
      let atk = step.attack;
      while (atk) {
        this.tip('react', atk.style === 'heavy' ? '붉은 고리! 닿는 순간 회피하세요.' : '고리가 원에 닿는 순간 막기! 정확하면 퍼펙트.');
        const input = await this.runReaction(atk);
        if (this.coach && !this.coach.done) {
          this.coach.reacted = true;
          if (st.turn >= 3) this.finishCoach();
        }
        const res = B.resolveReaction(st, input);
        await this.playEvents(res.events);
        atk = null;
        if (res.counter && !st.result) {
          await this.wait(140);
          await this.playEvents(B.resolveCounter(st, res.counter.defaultLane));
        }
        if (res.attack && !st.result) {
          await this.wait(160);
          atk = res.attack;
        }
      }
      if (st.result) break;
      if (step.done) {
        this.ui.phase = 'busy';
        this.refresh();
        await this.wait(200);
        await this.playEvents(step.events);
        break;
      }
      this.refresh();
    }
    this.ui.phase = 'busy';
    if (st.result) return this.endBattle();
    this.audio.play('turn');
    this.beginPlayerTurn();
  }

  runReaction(attack) {
    const assist = this.settings.assist ? 1.4 : 1;
    // 따라 하기의 첫 공격은 천천히 들어온다
    const learn = this.coach && !this.coach.done && !this.coach.reacted ? 1.6 : 1;
    const dur = attack.windup * (this.settings.assist ? 1.2 : 1) * learn;
    const now = this.now();
    const v = this.views.get(attack.attackerId);
    const r = { attack, start: now, impact: now + dur, input: null, done: false, assist, launched: false, landed: false, v };
    if (attack.style === 'ranged' || attack.style === 'volley') r.launchAt = r.impact - 420;
    this.ui.react = r;
    this.ui.phase = 'react';
    this.refresh();
    this.audio.play('windup', { style: attack.style, dur: dur / 1000 });
    return new Promise((res) => (r.resolve = res));
  }

  reactInput(action) {
    const r = this.ui.react;
    if (!r || r.input || r.done) return; // 첫 입력만 인정
    const t = this.now();
    const offset = t - r.impact;
    const shoes = action === 'dodge' && this.st.relics.includes('shadowShoes') ? 1.3 : 1;
    const grade = judge(action, offset, r.assist * shoes);
    r.input = { action, grade, offset };
    const P = this.player;
    if (action === 'guard') {
      P.pose = 'guard';
      P.poseT = 0;
      P.holdGuard = true;
    } else {
      P.pose = 'dodge';
      P.poseT = 0;
      P.dodgeDir = Math.random() < 0.5 ? -1 : 1;
      P.ox = 0;
    }
    this.refresh();
    if (t >= r.impact) this.finishReaction();
  }

  updateReaction() {
    const r = this.ui.react;
    if (!r || r.done) return;
    const now = this.now();
    const v = r.v;
    const total = r.impact - r.start;
    const k = clamp((now - r.start) / total, 0, 1);
    // 적의 준비 동작
    if (v) {
      if (r.attack.style === 'melee') {
        v.close = ease(k);
        v.lean = -0.2 * k;
      } else if (r.attack.style === 'heavy') {
        v.raise = ease(k);
      } else {
        v.chargeA = Math.max(v.chargeA, k);
        v.puff = k;
      }
    }
    if (r.launchAt && !r.launched && now >= r.launchAt && v) {
      r.launched = true;
      const p = this.renderer.viewPos(v);
      this.audio.play('fireball');
      this.projs.push({
        sym: 'fire', x: p.x, y: p.y - 46 * p.k, sx: p.x, sy: p.y - 46 * p.k,
        ex: this.player.x, ey: this.L.playerY - 50, t0: now, t1: r.impact, timed: true,
        trail: [], size: 12, alpha: 1, ang: Math.PI / 2,
      });
      if (v) v.puff = 0;
    }
    if (!r.landed && now >= r.impact) {
      r.landed = true;
      if (v && (r.attack.style === 'melee' || r.attack.style === 'heavy')) {
        v.lunge = 1;
        if (r.attack.style === 'heavy') v.slam = 1;
      }
      this.projs = this.projs.filter((p) => !p.timed);
    }
    if (r.input && now >= r.impact) this.finishReaction();
    else if (!r.input && now >= r.impact + lateLimit(r.assist)) this.finishReaction();
  }

  finishReaction() {
    const r = this.ui.react;
    if (!r || r.done) return;
    r.done = true;
    this.ui.react = null;
    const v = r.v;
    if (v) {
      v.close = 0;
      v.lean = 0;
      v.raise = 0;
      v.chargeA = 0;
      v.puff = 0;
      this.waitReal(160).then(() => { v.lunge = 0; v.slam = 0; });
    }
    this.projs = this.projs.filter((p) => !p.timed);
    const input = r.input ? { action: r.input.action, grade: r.input.grade } : { action: null, grade: 'miss' };
    // 기력이 모자라면 타이밍이 맞아도 실패
    const tired = B.reactCost(input.action, input.grade) > (this.st.player.stamina ?? 99);
    this.reactionFeedback(r, input, tired);
    this.ui.phase = 'enemy';
    this.player.holdGuard = false;
    this.refresh();
    r.resolve(input);
  }

  reactionFeedback(r, input, tired = false) {
    const P = this.player;
    const x = P.x;
    const y = this.L.playerY - 50;
    const heavy = r.attack.style === 'heavy';
    const fx = this.fx;
    this.audio.play('enemyStrike', { style: r.attack.style });
    if (tired) {
      this.audio.play('deny');
      fx.text(x, y - 74, '기력 부족!', { color: '#7fe8ff', size: 28, font: 'num', life: 1.1 });
      this.staminaWarn = 1;
    } else if (input.action === 'guard' && input.grade === 'perfect' && !heavy) {
      this.audio.play('perfect');
      fx.flash('#ffe08a', 0.35);
      fx.ring(x, y, { r0: 20, r1: 120, color: '#ffe08a', w: 8, life: 0.45 });
      fx.burst(x, y - 20, { n: 26, speed: 380, color: ['#fff', '#ffe08a', '#ffb347'], kind: 'streak', size: 5, life: 0.45 });
      fx.text(x, y - 70, '퍼펙트!', { color: '#ffe08a', size: 40, font: 'num', life: 1.1 });
      this.hitstop = Math.max(this.hitstop, 0.16);
      fx.shake(2);
      if (r.v) { r.v.knock = 18; r.v.flash = 1; }
    } else if (input.action === 'guard' && (input.grade === 'good' || input.grade === 'perfect')) {
      this.audio.play('guard');
      fx.burst(x, y - 20, { n: 14, speed: 260, color: ['#fff', '#ffd27a'], kind: 'streak', size: 4, life: 0.3 });
      fx.ring(x, y, { r0: 20, r1: 70, color: '#ffd27a', w: 5, life: 0.3 });
      const txt = heavy ? (input.grade === 'perfect' ? '버팀!' : '막기 실패!') : '막기';
      fx.text(x, y - 70, txt, { color: heavy && input.grade !== 'perfect' ? '#ff8a7a' : '#ffd27a', size: 30, font: 'num' });
      fx.shake(heavy ? 3 : 1);
    } else if (input.action === 'dodge' && input.grade !== 'miss') {
      this.audio.play('dodge');
      if (input.grade === 'perfect') this.audio.play('perfect');
      fx.text(x, y - 70, input.grade === 'perfect' ? '퍼펙트 회피!' : '회피!', { color: '#8fe8ff', size: input.grade === 'perfect' ? 36 : 30, font: 'num' });
      this.afterimages.push({ x: P.x, a: 1 }, { x: P.x - (P.dodgeDir || 1) * 20, a: 0.6 });
      if (input.grade === 'perfect') this.hitstop = Math.max(this.hitstop, 0.12);
    } else {
      const early = r.input && r.input.offset < 0;
      if (r.input) fx.text(x, y - 74, early ? '너무 빠름' : '늦음', { color: '#ff8a7a', size: 22, font: 'ui' });
      else fx.text(x, y - 74, '무방비', { color: '#ff8a7a', size: 22, font: 'ui' });
    }
  }

  chooseCounter(defaultLane) {
    this.timeScale = 0.25;
    this.audio.play('slowmo');
    const now = this.now();
    const limit = this.settings.assist ? 3200 : 2400;
    this.ui.counter = { start: now, deadline: now + limit, hover: defaultLane, def: defaultLane };
    this.ui.phase = 'counter';
    this.setCounterHover(defaultLane);
    this.tip('counter', '퍼펙트! 원하는 레인을 눌러 되치기. 처음 공격한 레인이 아니어도 된다.');
    return new Promise((res) => (this.ui.counter.resolve = res));
  }

  setCounterHover(lane) {
    const c = this.ui.counter;
    if (!c) return;
    c.hover = lane;
    this.ui.counterPreview = B.previewCounter(this.st, lane);
    this.refresh();
  }

  pickCounter(lane) {
    const c = this.ui.counter;
    if (!c || c.picked) return;
    c.picked = true;
    this.ui.counter = null;
    this.ui.counterPreview = null;
    this.timeScale = 1;
    this.ui.phase = 'enemy';
    this.refresh();
    c.resolve(lane);
  }

  // ─────────────── 전투 종료 ───────────────
  async endBattle() {
    const st = this.st;
    this.busy = true;
    this.ui.phase = 'over';
    this.card = null;
    this.cardQueue = [];
    this.refresh();
    await this.wait(500);
    const meta = this.store.meta;
    if (this.coach) this.finishCoach();
    if (st.result === 'win') {
      this.audio.play('win');
      this.showBanner('밤을 넘겼다', `${this.def.night} 클리어`, 1.8, '#ffe08a', 44);
      recordBattle(this.run, st);
      // 날아오는 코인이 전부 쟁반에 떨어질 때까지 기다린다
      const settle = async () => {
        for (let i = 0; i < 80 && this.flies.length; i++) await this.waitReal(50);
      };
      await settle();
      const earned = st.coins;
      const bank = bankBattle(this.run, st);
      // 험한 길 배율로 더 받은 몫도 눈앞에서 들어온다
      if (bank.gained > earned) {
        this.run.coins -= bank.gained; // 연출 중에는 쟁반 목표가 겹치지 않게 잠시 빼 둔다
        await this.playEvent({ type: 'coin', n: bank.gained - earned, why: 'risky' });
        this.run.coins += bank.gained;
        this.coinShown = this.run.coins;
        this.banked = true; // 여기서부터는 지갑 금액만 표시(이번 밤 코인을 다시 더하지 않는다)
        await settle();
      }
      this.banked = true;
      const last = this.run.stage >= RUN_LENGTH - 1;
      if (last) meta.bestScore = Math.max(meta.bestScore || 0, this.run.totals.score);
      await this.waitReal(1300);
      meta.best = Math.max(meta.best || 0, this.run.stage + 1);
      if (last) {
        meta.wins = (meta.wins || 0) + 1;
        // 지금 단계를 넘겼으면 다음 단계가 열린다
        const tier = this.run.tier || 0;
        this.run.unlocked = tier >= (meta.tier || 0) && tier < MAX_TIER;
        if (this.run.unlocked) meta.tier = tier + 1;
        this.store.run = null;
        this.store.save();
        this.mode = 'result';
        this.overlay.showResult(true, this.run, meta);
        return;
      }
      this.store.save();
      this.mode = 'reward';
      // 밤을 넘기면 바로 상점으로(무료 보상은 없다: 유물은 코인으로 산다)
      this.openShop(rollShop(this.run), bank);
    } else {
      const timeUp = st.loseReason === 'time';
      this.audio.play('lose');
      this.showBanner(timeUp ? '시간 초과' : '등불이 꺼졌다', timeUp ? '기한 안에 처치하지 못했다' : '날이 밝기 전에 쓰러졌다', 2, '#ff8a7a', 40);
      recordBattle(this.run, st);
      meta.bestScore = Math.max(meta.bestScore || 0, this.run.totals.score);
      this.store.run = null;
      this.store.save();
      await this.waitReal(2000);
      this.mode = 'result';
      this.overlay.showResult(false, this.run, meta);
    }
  }

  // 다음 밤의 길 고르기(순한 길 / 험한 길)
  choosePath() {
    this.checkpoint('path');
    this.overlay.showPaths(this.run, rollPaths(this.run), (def) => {
      advance(this.run, def);
      this.startBattle();
    });
  }

  // 유물 수집 기록(상점 구매 포함)
  noteRelic(id) {
    const rid = id.startsWith('up:') || id.startsWith('fuse:') || id.startsWith('trim:') ? null : id;
    if (!rid || !RELICS[rid] || RELICS[rid].fusion) return;
    const u = new Set(this.store.meta.relicsUsed || []);
    u.add(rid);
    this.store.meta.relicsUsed = [...u];
    this.store.save();
  }

  // ─────────────── 연출 재생 ───────────────
  wait(ms) {
    return new Promise((res) => this.timers.push({ t: this.time + ms / 1000, res }));
  }

  waitReal(ms) {
    return new Promise((res) => this.realTimers.push({ at: this.now() + ms, res }));
  }

  tween(obj, props, dur, easing = ease) {
    return new Promise((res) => {
      const from = {};
      for (const k in props) from[k] = obj[k];
      this.tweens.push({ obj, from, to: props, t: 0, dur: dur / 1000, easing, res });
    });
  }

  impactPoint(v) {
    const p = this.renderer.viewPos(v);
    const h = { kasa: 42, mask: 46, archer: 48, elder: 48, bomber: 40, healer: 40, boar: 34 }[v.type] || 40;
    return { x: p.x, y: p.y - h * p.k * 0.72, k: p.k };
  }

  playerMuzzle() {
    return { x: this.player.x + 18, y: this.L.playerY - 92 };
  }

  flyTo(pr, x, y) {
    return new Promise((res) => {
      pr.tx = x;
      pr.ty = y;
      pr.arrive = res;
    });
  }

  async playEvents(evs) {
    for (let i = 0; i < evs.length; i++) {
      this.evAhead = evs;
      this.evAt = i;
      await this.playEvent(evs[i]);
    }
    this.evAhead = null;
    this.syncViews();
  }

  // 지금 재생 중인 처치가 이 밤의 마지막 처치인가(뒤에 다른 처치 없이 승리가 이어지는가)
  isFinisher() {
    const evs = this.evAhead;
    if (!evs) return false;
    for (let i = this.evAt + 1; i < evs.length; i++) {
      if (evs[i].type === 'kill') return false;
      if (evs[i].type === 'win') return true;
    }
    return false;
  }

  async playEvent(ev) {
    const fx = this.fx;
    const L = this.L;
    const v = ev.id != null ? this.views.get(ev.id) : null;
    switch (ev.type) {
      case 'spawn': {
        const nv = this.makeView(ev.enemy);
        this.views.set(nv.id, nv);
        const p = cellPos(L, nv.lane, nv.row);
        this.audio.play('spawn');
        fx.burst(p.x, p.y - 20, { n: 10, speed: 70, color: ev.src === 'omen' ? ['#a050ff', '#e0b0ff'] : ['#9a8fd0', '#c9b8ff'], kind: 'glow', size: 6, life: 0.6, vy: -40 });
        if (ev.src === 'omen') fx.text(p.x, p.y - 70, '대가로 등장', { color: '#e0b0ff', size: 20, font: 'num' });
        this.tween(nv, { spawnT: 1 }, 380);
        if (ENEMIES[nv.type].boss) {
          this.audio.play('bossPhase');
          this.showBanner(ENEMIES.elder.name, '충전 중엔 받는 피해 +2', 2.2, '#ffb347');
          await this.wait(800);
        }
        await this.wait(110);
        break;
      }
      case 'turn':
        break;
      case 'coin': {
        // 코인 획득: 왜 벌었는지 그 자리에 적고, 금화가 튀어 올랐다가 쟁반으로 빨려 들어간다
        this.coinPulse = 1;
        const label = { combo: '연속 처치', perfect: '퍼펙트', bingo: '빙고', thrift: '절약(한 번도 안 돌림)', clear: '클리어', elite: '정예 처치', risky: '험한 길 보너스' }[ev.why] || '';
        const tr = trayRect(L);
        let sx = this.player.x;
        let sy = L.playerY - 60;
        if (v) {
          const ip = this.impactPoint(v);
          sx = ip.x;
          sy = ip.y;
        } else if (ev.why === 'bingo') {
          const q = slotCell(L, 1, 1);
          sx = q.x;
          sy = q.y;
        } else if (ev.why === 'clear') {
          sx = W / 2;
          sy = L.fieldTop + L.fieldH * 0.45;
        }
        for (let i = 0; i < ev.n; i++) {
          const idx = this.coinShown + i;
          const spot = this.coinSpot(idx);
          const side = Math.random() < 0.5 ? -1 : 1;
          const a = toScreen(L, sx, sy);
          const b = toScreen(L, spot.x, spot.y);
          this.flies.push({
            idx, sx: a.x, sy: a.y,
            bx: a.x + side * (30 + Math.random() * 50), by: a.y - 60 - Math.random() * 50, // 튀어 오르는 꼭짓점
            cx: b.x + (Math.random() - 0.5) * 60, cy: b.y - 110 - Math.random() * 40, // 쟁반 위에서 떨어지는 지점
            tx: b.x, ty: b.y, lx: spot.x, ly: spot.y, rot: spot.rot, t: -i * 0.09, dur: 0.78 + Math.random() * 0.12,
          });
        }
        this.coinShown += ev.n;
        if (label) {
          const txt = `${label} +${ev.n} 코인`;
          if (v) fx.text(sx, sy - 74, txt, { color: '#ffd84a', size: 19, font: 'num', life: 1.3, vy: -26, delay: 0.15 });
          else if (sy < L.info.y) fx.text(Math.min(W - 110, Math.max(110, sx)), sy - 30, txt, { color: '#ffd84a', size: 19, font: 'num', life: 1.4, vy: -16 });
          else this.uiFx.text(Math.min(W - 110, Math.max(110, sx)), Math.min(sy - 30, tr.y - 14), txt, { color: '#ffd84a', size: 19, font: 'num', life: 1.4, vy: -16 });
        }
        this.conceptCard('coin');
        break;
      }
      case 'evolve': {
        const R = RELICS[ev.relic];
        this.relicPulse[ev.relic] = 2;
        this.audio.play('bingo', { level: 2 });
        fx.flash(R.color, 0.4);
        fx.shake(2);
        this.buzz(120);
        this.celebrate(1);
        this.showBanner(`진화! ${R.name} III`, '효과 3배', 1.8, R.color, 40);
        await this.wait(700);
        break;
      }
      case 'reaction': {
        // 원소 반응: 이름을 크게 띄워 "왜 터졌는지" 알려준다
        const p = cellPos(L, ev.lane, ev.row);
        const cy2 = p.y - 40 * p.k;
        if (ev.name === 'detonate') {
          this.audio.play('burst');
          this.audio.play('spark');
          fx.text(p.x, cy2 - 60, '감전 폭발!', { color: '#d6ff5a', size: 34, font: 'num', life: 1.2 });
          this.comboBadge(p.x, cy2 - 96, 'venom', 'spark');
          fx.ring(p.x, cy2, { r0: 10, r1: 150, color: '#a6f04a', w: 9, life: 0.5 });
          fx.ring(p.x, cy2, { r0: 6, r1: 100, color: '#ffe45c', w: 5, life: 0.4 });
          fx.impact(p.x, cy2, 110, '#d6ff5a');
          for (const [l, r] of ev.cells) {
            const q = cellPos(L, l, r);
            fx.bolt(p.x, cy2, q.x, q.y - 40 * q.k, { color: '#d6ff5a', color2: '#6a2fb0', w: 4, life: 0.35 });
          }
          fx.shake(3);
          fx.punchIn(0.03);
          this.hitstop = Math.max(this.hitstop, 0.12);
        } else if (ev.name === 'deepFreeze') {
          this.audio.play('freeze');
          fx.text(p.x, cy2 - 60, '꽁꽁! 동결 +1턴', { color: '#bfe6ff', size: 26, font: 'num', life: 1.1 });
          this.comboBadge(p.x, cy2 - 94, 'wave', 'frost');
          fx.ring(p.x, cy2, { r0: 10, r1: 110, color: '#bfe6ff', w: 7, life: 0.5 });
          const dv = this.views.get(ev.id);
          if (dv) dv.wet = 0;
        } else if (ev.name === 'fester') {
          this.audio.play('venom');
          fx.text(p.x, cy2 - 60, '독이 깊어진다! 중독 +2', { color: '#b8ff5a', size: 24, font: 'num', life: 1.1 });
          this.comboBadge(p.x, cy2 - 94, 'venom', 'blade');
          fx.ring(p.x, cy2, { r0: 10, r1: 90, color: '#a6f04a', w: 6, life: 0.45 });
        } else if (ev.name === 'spread') {
          this.audio.play('venom');
          fx.text(p.x, cy2 - 60, '독 확산!', { color: '#b8ff5a', size: 28, font: 'num', life: 1.1 });
          this.comboBadge(p.x, cy2 - 94, 'venom', 'wave');
          fx.ring(p.x, cy2, { r0: 10, r1: 130, color: '#a6f04a', w: 7, life: 0.6, sy: 0.6 });
        }
        await this.wait(160);
        break;
      }
      case 'combo': {
        const names = ['', '', '2연속 처치!', '3연속 처치!!', '4연속 처치!!!'];
        const label = names[ev.n] || `${ev.n}연속 처치!!!`;
        this.audio.play('combo', { n: ev.n });
        fx.text(W / 2, L.fieldTop + L.fieldH * 0.3, label, { color: ev.n >= 3 ? '#ffe08a' : '#ffffff', size: 26 + Math.min(5, ev.n) * 6, font: 'num', life: 1.2, vy: -30 });
        fx.punchIn(0.012 * Math.min(4, ev.n));
        if (ev.ember) this.uiFx.text(210, L.slot.y + 60, '✦ 연속 처치 보상: 다음 턴 금빛 릴 +1', { color: '#ffd27a', size: 17, font: 'num', delay: 0.3, vy: -8, life: 1.6 });
        break;
      }
      case 'poison': {
        if (!v) break;
        v.poison = ev.stacks;
        const ip = this.impactPoint(v);
        this.audio.play('venom');
        fx.burst(ip.x, ip.y, { n: 14, speed: 150, color: ['#a6f04a', '#e6ff9a', '#6a2fb0'], kind: 'dot', size: 4.5, life: 0.7, g: -120, add: false });
        fx.text(ip.x + 34, ip.y - 26, `중독 ${ev.stacks}`, { color: '#b8ff5a', size: 20, font: 'num' });
        await this.wait(70);
        break;
      }
      case 'poisonTick': {
        if (!v) break;
        const ip = this.impactPoint(v);
        this.audio.play('venom');
        this.stamps.push({ sym: 'venom', x: ip.x, y: ip.y, size: 22 * ip.k, life: 0.45, max: 0.45, rot: 0.4 });
        fx.text(ip.x, ip.y - 72, '중독 피해', { color: '#b8ff5a', size: 18, font: 'num' });
        await this.wait(120);
        break;
      }
      case 'relic': {
        // 어떤 유물이 왜 발동했는지 보여준다: HUD 배지 반짝 + 이름 표시
        const R = RELICS[ev.relic];
        if (!R) break;
        this.relicPulse[ev.relic] = 1;
        if (ev.quiet) break; // 늘 켜져 있는 효과는 배지만 반짝
        this.relicPulse[ev.relic] = 1.6;
        this.audio.play('relic');
        let x = this.player.x;
        let y = L.playerY - 168;
        if (ev.to) {
          const a = cellPos(L, ev.from.lane, ev.from.row);
          const b = cellPos(L, ev.to.lane, ev.to.row);
          fx.bolt(a.x, a.y - 40 * a.k, b.x, b.y - 40 * b.k, { color: '#ffe45c', color2: '#ffffff', w: 4, life: 0.3 });
          x = (a.x + b.x) / 2;
          y = (a.y + b.y) / 2 - 70;
        } else if (v) {
          const ip = this.impactPoint(v);
          x = ip.x;
          y = ip.y - 92;
        }
        fx.text(x, y, `◆ ${R.name}${R.proc ? ' : ' + R.proc : ''}`, { color: R.color, size: 18, font: 'num', life: 1.5, vy: -22 });
        {
          // 유물 배지에서 효과가 난 곳까지 빛줄기
          const shown = this.shownRelics;
          let ri = shown.indexOf(ev.relic);
          if (ri < 0) ri = shown.findIndex((id) => FUSIONS[id] && (FUSIONS[id].a === ev.relic || FUSIONS[id].b === ev.relic));
          if (ri >= 0) {
            const rr = this.relicRect(ri);
            const a = toScreen(L, rr.x + rr.w / 2, rr.y + rr.h / 2);
            const b = toScreen(L, x, y + 30);
            this.relicLinks.push({ sx: a.x, sy: a.y, tx: b.x, ty: b.y, color: R.color, life: 0.55, max: 0.55 });
            this.relicPulse[shown[ri]] = 1.6;
          }
        }
        await this.wait(90);
        break;
      }
      case 'omen': {
        this.audio.play('omen');
        fx.flash('#6a20c0', 0.18);
        this.showBanner('다시 돌린 대가', ev.desc?.text || '', 1.2, '#e0b0ff', 28);
        await this.wait(420);
        break;
      }
      case 'move':
      case 'push': {
        if (!v) break;
        const steps = Math.abs(ev.to - ev.from);
        this.audio.play('move', { hop: ev.hop });
        if (ev.gust) {
          const gp = this.impactPoint(v);
          fx.text(gp.x, gp.y - 60, '빠른 걸음', { color: '#c9e8ff', size: 18, font: 'num' });
        }
        if (ev.fromLane != null && ev.fromLane !== ev.lane) {
          const start2 = this.time;
          const tw2 = this.tween(v, { row: ev.to, lane: ev.lane }, 400, (t) => t);
          const tick2 = () => { v.hop = Math.sin(clamp((this.time - start2) / 0.4, 0, 1) * Math.PI) * 30; };
          this.tickers.push(tick2);
          await tw2;
          this.tickers = this.tickers.filter((f) => f !== tick2);
          v.hop = 0;
          v.squash = 0.7;
        } else if (v.type === 'kasa') {
          const dur = 180 + steps * 110;
          const h = { t: 0 };
          const tw = this.tween(v, { row: ev.to }, dur, (t) => t);
          const start = this.time;
          const hopTick = () => {
            const k = clamp((this.time - start) / (dur / 1000), 0, 1);
            v.hop = Math.sin(k * Math.PI * steps) ** 2 * 22 * (steps > 1 ? 1.2 : 1);
            v.squash = k < 0.1 ? -0.3 : 0;
          };
          this.tickers.push(hopTick);
          await tw;
          this.tickers = this.tickers.filter((f) => f !== hopTick);
          v.hop = 0;
          v.squash = 0.6;
        } else if (v.type === 'mask') {
          await this.tween(v, { row: ev.to }, 380, (t) => t * t * (3 - 2 * t));
          v.squash = 0.35;
          this.fx.shake(1);
        } else if (ev.dash) {
          // 멧돼지 돌진: 흙먼지를 일으키며 단숨에 맨 앞까지
          const gp = this.impactPoint(v);
          fx.text(gp.x, gp.y - 70, '돌진!', { color: '#ff8a5a', size: 24, font: 'num' });
          const start3 = this.time;
          const dustTick = () => {
            const q = this.renderer.viewPos(v);
            if (Math.random() < 0.6) fx.burst(q.x, q.y, { n: 2, speed: 70, color: ['#b8a090', '#8a7060'], size: 4, life: 0.45, add: false, vy: -30 });
          };
          this.tickers.push(dustTick);
          await this.tween(v, { row: ev.to }, 150 + steps * 60, (t) => t * t);
          this.tickers = this.tickers.filter((f) => f !== dustTick);
          v.squash = 0.6;
          v.charge = false;
          fx.shake(3);
          this.buzz(40);
        } else {
          await this.tween(v, { row: ev.to }, 300);
        }
        const p = cellPos(L, v.lane, v.row);
        fx.burst(p.x, p.y, { n: 6, speed: 60, color: '#8a7060', size: 3, life: 0.4, add: false, vy: -20 });
        this.audio.play('land');
        break;
      }
      case 'shift': {
        if (!v) break;
        this.audio.play('move', { hop: true });
        await this.tween(v, { lane: ev.to }, 520);
        break;
      }
      case 'fury': {
        if (!v) break;
        v.fury += ev.amount;
        const p = this.impactPoint(v);
        fx.text(p.x, p.y - 40, `공격력 +${ev.amount}`, { color: '#ff6a6a', size: 22, font: 'num' });
        fx.burst(p.x, p.y, { n: 10, speed: 90, color: ['#ff3b3b', '#ff8a5a'], kind: 'glow', size: 5, vy: -60 });
        await this.wait(280);
        break;
      }
      case 'wet': {
        if (v) v.wet = 2;
        break;
      }
      case 'stamina': {
        const P = this.player;
        fx.text(P.x - 44, L.playerY - 120, `기력 +${ev.amount}`, { color: '#7fe8ff', size: 20, font: 'num' });
        break;
      }
      case 'snipe': {
        const tv = this.views.get(ev.id);
        if (tv) {
          const ip = this.impactPoint(tv);
          this.audio.play('aim');
          fx.ring(ip.x, ip.y, { r0: 54, r1: 12, color: '#ffd84a', w: 4, life: 0.3 });
          fx.text(ip.x, ip.y - 70, '저격!', { color: '#ffd84a', size: 24, font: 'num', life: 0.9, vy: -30 });
        }
        break;
      }
      case 'fire':
        await this.onFire(ev);
        break;
      case 'hit':
        await this.onHit(ev, v);
        break;
      case 'block': {
        if (!v) break;
        const ip = this.impactPoint(v);
        if (this.cur && this.cur.proj) await this.flyTo(this.cur.proj, ip.x, ip.y + 6);
        this.killProj();
        v.blockT = 1;
        this.audio.play('block');
        fx.burst(ip.x, ip.y, { n: 14, speed: 240, color: ['#ffffff', '#50f0be'], kind: 'streak', size: 4, life: 0.3, angle: Math.PI / 2, spread: 2.4 });
        v.shieldHp = ev.left;
        v.kick = 0.14;
        v.knock = 12;
        if (ev.broke) {
          v.shieldBroken = true;
          this.audio.play('shieldBreak');
          fx.text(ip.x, ip.y - 54, '방패 파괴!', { color: '#ffffff', size: 32, font: 'num' });
          fx.burst(ip.x, ip.y, { n: 26, speed: 340, color: ['#f5ecd9', '#ffffff', '#50f0be'], kind: 'paper', size: 6, life: 0.9, g: 420, add: false, vr: 16 });
          fx.impact(ip.x, ip.y, 90, '#ffffff');
          fx.shake(3);
          fx.punchIn(0.03);
          this.hitstop = Math.max(this.hitstop, 0.14);
          this.buzz(60);
        } else {
          fx.text(ip.x, ip.y - 54, `방패에 금! (남은 ${ev.left})`, { color: '#50f0be', size: 22, font: 'num' });
          fx.impact(ip.x, ip.y, 54, '#50f0be');
        }
        this.conceptCard('block');
        fx.shake(1);
        this.hitstop = Math.max(this.hitstop, 0.05);
        await this.wait(160);
        break;
      }
      case 'kill': {
        if (!v) break;
        const ip = this.impactPoint(v);
        const big = ev.etype === 'elder';
        const fin = !big && this.isFinisher();
        v.dyingStart = true;
        v.hpLag = 0;
        if (!big) {
          // 맞은 방향(위쪽)으로 날아가며 빙글 돈다
          const side = v.lane === 0 ? -1 : v.lane === 2 ? 1 : Math.random() < 0.5 ? -1 : 1;
          v.fly = { x: side * (26 + Math.random() * 34), y: (fin ? 120 : 78) + Math.random() * 30, rot: side * (1.5 + Math.random() * 1.3) };
        }
        this.tween(v, { dying: 1 }, big ? 1100 : fin ? 760 : 560, (t) => t);
        this.audio.play('kill', { big });
        if (fin) this.audio.play('finish');
        this.hitstop = Math.max(this.hitstop, big ? 0.3 : fin ? 0.24 : 0.13);
        fx.shake(big ? 4 : 3);
        fx.kick(0, big ? -14 : fin ? -12 : -7);
        fx.punchIn(big ? 0.06 : fin ? 0.055 : 0.03);
        fx.impact(ip.x, ip.y, big ? 150 : fin ? 120 : 80, '#ffe08a');
        this.buzz(big ? 200 : fin ? 90 : 40);
        this.slowT = big ? 0.5 : fin ? 0.6 : 0.16; // 처치 순간 짧은 슬로모션
        if (big) fx.flash('#fff4c0', 0.6);
        {
          const foot = this.renderer.viewPos(v);
          fx.decal(foot.x, foot.y, { kind: 'scorch', r: (big ? 80 : 40) * foot.s, color: 'rgba(10,5,16,0.9)', life: 6 });
          // 혼불이 빠져나간다
          for (let i = 0; i < (big ? 9 : 3); i++) {
            fx.particle({ x: ip.x + (Math.random() - 0.5) * 30, y: ip.y, vx: (Math.random() - 0.5) * 50, vy: -60 - Math.random() * 60, g: -120, drag: 0.97, life: 0.9 + Math.random() * 0.4, max: 1.2, size: 5 + Math.random() * 3, color: '#bfe6ff', kind: 'glow' });
          }
        }
        if (fin) {
          fx.dim(0.5);
          fx.flash('#fff4c0', 0.3);
          fx.ring(ip.x, ip.y, { r0: 14, r1: 240, color: '#ffe08a', w: 9, life: 0.6 });
          fx.burst(ip.x, ip.y, { n: 36, speed: 620, color: ['#ffffff', '#ffe08a', '#ffb347'], kind: 'streak', size: 5, life: 0.45 });
          fx.text(ip.x, ip.y - 96, '마무리!', { color: '#ffe08a', size: 44, font: 'num', life: 1.3, vy: -30 });
        }
        const cols = {
          kasa: ['#e2453c', '#b8302e', '#f3d38a', '#ffe0c0'], mask: ['#f5ecd9', '#ffffff', '#352a64', '#e2453c'], archer: ['#ffbf52', '#fff4c4', '#e0682a'], elder: ['#ffb04a', '#fff2c0', '#ff5a6e', '#ffffff'],
          drum: ['#9a3a2a', '#f6ead0', '#e8c070'], bomber: ['#e8663c', '#f0b83a', '#d8342c', '#fff2c8'], healer: ['#9ad88a', '#3f8f6a', '#7cf0a0'], boar: ['#6a4a3a', '#80584a', '#fff6e0'],
        }[ev.etype] || ['#e2453c', '#f3d38a', '#ffe0c0'];
        fx.burst(ip.x, ip.y, { n: big ? 70 : 26, speed: big ? 420 : 260, color: cols, kind: 'paper', size: big ? 7 : 5, life: big ? 1.4 : 0.9, g: 420, drag: 0.94, add: false, vr: 14 });
        fx.burst(ip.x, ip.y, { n: big ? 40 : 14, speed: 200, color: ['#ffe08a', '#ffb347'], kind: 'glow', size: 5, life: 0.7, vy: -80 });
        fx.ring(ip.x, ip.y, { r0: 10, r1: big ? 200 : 80, color: '#ffffff', w: 5, life: 0.4 });
        await this.wait(big ? 900 : 120);
        break;
      }
      case 'freeze': {
        if (!v) break;
        v.frozen = ev.turns;
        const ip = this.impactPoint(v);
        this.audio.play('freeze');
        fx.burst(ip.x, ip.y, { n: 14, speed: 160, color: ['#ffffff', '#bfe6ff', '#7cc8ff'], kind: 'shard', size: 5, life: 0.6, add: false });
        fx.text(ip.x + 30, ip.y - 30, `동결 ${ev.turns}`, { color: '#bfe6ff', size: 20, font: 'ui' });
        await this.wait(60);
        break;
      }
      case 'interrupt': {
        if (!v) break;
        v.charge = false;
        v.braced = false;
        v.vulnerable = false;
        v.chargeA = 0;
        const ip = this.impactPoint(v);
        fx.text(ip.x, ip.y - 60, '준비 끊김!', { color: '#9fdcff', size: 22, font: 'num' });
        await this.wait(160);
        break;
      }
      case 'shards': {
        const p = cellPos(L, ev.lane, ev.row);
        for (const [l, r] of ev.cells) {
          const q = cellPos(L, l, r);
          const ang = Math.atan2(q.y - p.y, q.x - p.x);
          fx.burst(p.x, p.y - 30, { n: 6, speed: 380, color: ['#ffffff', '#bfe6ff'], kind: 'shard', size: 5, life: 0.35, angle: ang, spread: 0.5, add: false });
        }
        await this.wait(40);
        break;
      }
      case 'burst': {
        const p = cellPos(L, ev.lane, ev.row);
        const y = p.y - 34 * p.k;
        if (this.cur && this.cur.proj) await this.flyTo(this.cur.proj, p.x, y);
        this.killProj();
        if (ev.bomb) {
          // 폭탄: 불기둥과 파편, 바닥에 그을음
          this.audio.play('bomb');
          fx.dim(0.35);
          fx.flash('#ffb347', 0.2);
          fx.impact(p.x, y, ev.tier === 2 ? 130 : 96, '#ffd84a');
          fx.ring(p.x, y, { r0: 10, r1: ev.tier === 2 ? 170 : 120, color: '#ff8a3d', w: 10, life: 0.45, sy: 0.6 });
          fx.ring(p.x, y, { r0: 6, r1: 70, color: '#ffffff', w: 5, life: 0.25 });
          fx.burst(p.x, y, { n: 34, speed: 420, color: ['#ffd84a', '#ff8a3d', '#ffffff', '#d8342c'], kind: 'streak', size: 5, life: 0.5, g: 500 });
          fx.burst(p.x, y, { n: 12, speed: 90, color: ['#4a3a4a', '#2a2030'], kind: 'dot', size: 9, life: 0.9, vy: -70, add: false });
          fx.decal(p.x, p.y, { kind: 'scorch', r: 46 * p.s, color: 'rgba(12,6,16,0.9)', life: 5 });
          for (const [l, r] of ev.cells) {
            const q = cellPos(L, l, r);
            fx.burst(q.x, q.y - 26 * q.k, { n: 6, speed: 160, color: ['#ffd84a', '#ff8a3d'], kind: 'glow', size: 5, life: 0.35 });
          }
          fx.shake(3);
          fx.punchIn(0.03);
          this.hitstop = Math.max(this.hitstop, 0.1);
          await this.wait(70);
          break;
        }
        this.audio.play('burst');
        fx.ring(p.x, y, { r0: 10, r1: ev.tier === 2 ? 190 : 130, color: '#4ff0c4', w: 9, life: 0.5, sy: 0.55 });
        fx.ring(p.x, y, { r0: 6, r1: 80, color: '#ffffff', w: 4, life: 0.3 });
        fx.burst(p.x, y, { n: 30, speed: 330, color: ['#8fffe2', '#4ff0c4', '#ffffff'], kind: 'dot', size: 4, life: 0.6, g: 300 });
        for (const [l, r] of ev.cells) {
          const q = cellPos(L, l, r);
          fx.ring(q.x, q.y - 26 * q.k, { r0: 6, r1: 46, color: '#4ff0c4', w: 4, life: 0.4, sy: 0.6 });
        }
        fx.shake(2);
        await this.wait(70);
        break;
      }
      case 'chain': {
        const a = cellPos(L, ev.from.lane, ev.from.row);
        const b = cellPos(L, ev.to.lane, ev.to.row);
        this.audio.play('chain');
        fx.bolt(a.x, a.y - 40 * a.k, b.x, b.y - 40 * b.k, { color: '#ffe45c', color2: '#b77cff', w: 3, life: 0.28 });
        await this.wait(70);
        break;
      }
      case 'fireEnd': {
        if (this.cur && this.cur.proj) {
          const pr = this.cur.proj;
          if (ev.row === -1) await this.flyTo(pr, pr.x, L.fieldTop - 30);
          this.killProj();
        }
        this.cur = null;
        this.player.pose = 'idle';
        await this.wait(90);
        break;
      }
      case 'ward': {
        const P = this.player;
        this.audio.play('ward');
        fx.ring(P.x, L.playerY - 46, { r0: 70, r1: 40, color: '#ffd27a', w: 6, life: 0.5 });
        fx.burst(P.x, L.playerY - 46, { n: 18, speed: 120, color: ['#ffd27a', '#fff3c0'], kind: 'glow', size: 5, life: 0.7, vy: -40 });
        fx.text(P.x, L.playerY - 120, ev.amount > 0 ? `방어막 +${ev.amount}` : '방어막 가득', { color: '#ffd27a', size: 24, font: 'num' });
        await this.wait(260);
        break;
      }
      case 'heal': {
        if (!ev.amount) break;
        const P = this.player;
        this.audio.play('heal');
        fx.text(P.x + 40, L.playerY - 100, `+${ev.amount}`, { color: '#7dffa0', size: 26, font: 'num' });
        fx.burst(P.x, L.playerY - 40, { n: 14, speed: 80, color: ['#7dffa0', '#e0ffe8'], kind: 'glow', size: 4, life: 0.8, vy: -90 });
        await this.wait(200);
        break;
      }
      case 'expose': {
        if (!v) break;
        v.exposed = true;
        const ip = this.impactPoint(v);
        fx.text(ip.x, ip.y - 50, '빈틈! 다음 피해 2배', { color: '#d9a0ff', size: 20, font: 'num' });
        fx.burst(ip.x, ip.y, { n: 12, speed: 120, color: ['#a050ff', '#e0b0ff'], kind: 'glow', size: 5, life: 0.5 });
        await this.wait(180);
        break;
      }
      case 'enemyPhase':
        this.audio.play('enemyTurn');
        this.showBanner('적의 차례', null, 0.9, '#ff9a8a', 30);
        await this.wait(520);
        break;
      case 'frozenSkip': {
        if (!v) break;
        const ip = this.impactPoint(v);
        fx.text(ip.x, ip.y - 50, '얼어붙음', { color: '#bfe6ff', size: 20, font: 'ui' });
        v.ox = 3;
        await this.wait(80);
        v.ox = -3;
        await this.wait(80);
        v.ox = 0;
        if (ev.left === 0) {
          v.frozen = 0;
          this.audio.play('frost');
          fx.burst(ip.x, ip.y, { n: 10, speed: 120, color: ['#ffffff', '#bfe6ff'], kind: 'shard', size: 4, life: 0.4, add: false });
        }
        await this.wait(160);
        break;
      }
      case 'wait':
        await this.wait(70);
        break;
      case 'brace': {
        if (!v) break;
        v.braced = true;
        this.tween(v, { raise: 0.45 }, 300);
        this.audio.play('brace');
        const ip = this.impactPoint(v);
        fx.text(ip.x, ip.y - 66, '내려치기 준비!', { color: '#ff6a6a', size: 22, font: 'num' });
        await this.wait(420);
        v.raise = 0;
        break;
      }
      case 'rev': {
        if (!v) break;
        v.charge = true;
        this.audio.play('brace');
        const ip = this.impactPoint(v);
        fx.text(ip.x, ip.y - 66, '돌진 준비!', { color: '#ff8a5a', size: 22, font: 'num' });
        fx.burst(ip.x, ip.y + 24 * ip.k, { n: 10, speed: 80, color: ['#ffffff', '#d8d0c8'], kind: 'glow', size: 5, life: 0.5, vy: 20 });
        await this.wait(420);
        break;
      }
      case 'mend': {
        if (!v) break;
        const tv = this.views.get(ev.target);
        this.audio.play('heal');
        v.squash = 0.4;
        const from = this.impactPoint(v);
        if (tv) {
          const to = this.impactPoint(tv);
          for (let i = 0; i < 8; i++) {
            const u = i / 7;
            fx.burst(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u - Math.sin(u * Math.PI) * 30, { n: 2, speed: 30, color: ['#7dffa0', '#e0ffe8'], kind: 'glow', size: 5, life: 0.5 + u * 0.3 });
          }
          if (ev.amount > 0) {
            tv.hpShown = ev.hp;
            fx.text(to.x, to.y - 56, `회복 +${ev.amount}`, { color: '#7dffa0', size: 22, font: 'num' });
            fx.ring(to.x, to.y, { r0: 8, r1: 54, color: '#7dffa0', w: 4, life: 0.4 });
          }
        }
        await this.wait(380);
        break;
      }
      case 'boom': {
        const p = cellPos(L, ev.lane, ev.row);
        const y = p.y - 34 * p.k;
        this.audio.play('burst');
        this.audio.play('kill', { big: false });
        fx.flash('#ffb347', 0.22);
        fx.shake(4);
        this.buzz(70);
        fx.text(p.x, y - 60, '펑!', { color: '#ffb347', size: 34, font: 'num' });
        fx.ring(p.x, y, { r0: 10, r1: 150, color: '#ffb347', w: 10, life: 0.45, sy: 0.6 });
        fx.ring(p.x, y, { r0: 6, r1: 90, color: '#ffffff', w: 5, life: 0.3 });
        fx.burst(p.x, y, { n: 34, speed: 380, color: ['#ffe45c', '#ff7a3d', '#ffffff', '#d8342c'], kind: 'streak', size: 5, life: 0.55 });
        fx.burst(p.x, y, { n: 14, speed: 240, color: ['#d8342c', '#f0b83a', '#fff2c8'], kind: 'paper', size: 5, life: 0.9, g: 420, drag: 0.94, add: false, vr: 14 });
        for (const [l, r] of ev.cells) {
          const q = cellPos(L, l, r);
          fx.ring(q.x, q.y - 26 * q.k, { r0: 6, r1: 50, color: '#ff9a3d', w: 4, life: 0.4, sy: 0.6 });
        }
        await this.wait(160);
        break;
      }
      case 'aim': {
        if (!v) break;
        v.charge = true;
        this.audio.play('aimEnemy');
        const ip = this.impactPoint(v);
        fx.text(ip.x, ip.y - 56, '조준', { color: '#ffb347', size: 22, font: 'num' });
        await this.wait(320);
        break;
      }
      case 'charge': {
        if (!v) break;
        v.charge = true;
        v.vulnerable = true;
        this.audio.play('charge');
        const ip = this.impactPoint(v);
        fx.text(ip.x, ip.y - 90, '충전 중 — 받는 피해 +2', { color: '#ffe08a', size: 20, font: 'num', life: 1.4 });
        fx.burst(ip.x, ip.y + 20, { n: 24, speed: 60, color: ['#fff4a0', '#ffb347'], kind: 'glow', size: 6, life: 0.9, vy: -30 });
        await this.wait(650);
        break;
      }
      case 'summon': {
        if (!v) break;
        v.flash = 0.6;
        this.audio.play('spawn');
        await this.wait(260);
        break;
      }
      case 'bossPhase': {
        if (!v) break;
        v.phase2 = true;
        this.audio.play('bossPhase');
        fx.flash('#ff3b4e', 0.3);
        fx.shake(3);
        this.showBanner('왕초롱이 달아오른다', '공격이 빨라진다', 1.6, '#ff8a8a');
        await this.wait(700);
        break;
      }
      case 'react':
        if (ev.ember) {
          const P = this.player;
          this.audio.play('ember');
          this.uiFx.text(210, L.slot.y + 60, '✦ 다음 턴 금빛 릴 +1', { color: '#ffd27a', size: 18, font: 'num', delay: 0.25, vy: -8, life: 1.5 });
        }
        break;
      case 'playerHit': {
        const P = this.player;
        if (ev.absorbed) fx.text(P.x - 40, L.playerY - 110, `방어막 -${ev.absorbed}`, { color: '#ffd27a', size: 20, font: 'num' });
        if (ev.dmg > 0) {
          P.pose = 'hurt';
          P.poseT = 0;
          P.flash = 1;
          this.audio.play('playerHurt');
          fx.hurt(0.55 + ev.dmg * 0.08);
          fx.shake(ev.dmg >= 4 ? 3 : 2);
          fx.kick((Math.random() - 0.5) * 4, 7 + Math.min(10, ev.dmg * 2));
          this.hitstop = Math.max(this.hitstop, ev.dmg >= 4 ? 0.14 : 0.09);
          P.rec = 12 + Math.min(12, ev.dmg * 2);
          this.hud.shake = 1;
          if (ev.dmg >= 4) fx.dim(0.3);
          fx.impact(P.x, L.playerY - 54, 50 + ev.dmg * 8, '#ff5a5a');
          fx.ring(P.x, L.playerY - 10, { r0: 14, r1: 80 + ev.dmg * 8, color: '#ff5a5a', w: 6, life: 0.35, sy: 0.4 });
          fx.text(P.x + 30, L.playerY - 90, `-${ev.dmg}`, { color: '#ff5a5a', size: 34 + Math.min(14, ev.dmg * 2), font: 'num', vy: -220, vx: 50, g: 480, life: 0.9 });
          fx.burst(P.x, L.playerY - 50, { n: 14 + ev.dmg * 2, speed: 260, color: ['#ff5a5a', '#ffffff'], kind: 'streak', size: 4, life: 0.35 });
        } else if (ev.absorbed) {
          this.audio.play('guard');
        }
        this.hud.hp = ev.hp;
        await this.wait(260);
        break;
      }
    }
  }

  killProj() {
    if (this.cur && this.cur.proj) {
      const pr = this.cur.proj;
      pr.dead = true;
      this.cur.proj = null;
    }
  }

  async onFire(ev) {
    const fx = this.fx;
    const P = this.player;
    const L = this.L;
    const sym = ev.symbol;
    if (sym === 'lantern') {
      P.pose = 'cast';
      P.poseT = 0;
      this.cur = null;
      return;
    }
    if (ev.global) {
      P.pose = 'cast';
      P.poseT = 0;
      P.tx = W / 2;
      this.audio.play(sym === 'spark' ? 'spark' : sym === 'frost' ? 'frost' : 'burst');
      fx.flash(SYMBOLS[sym].fx, 0.4);
      fx.ring(W / 2, L.fieldTop + L.fieldH / 2, { r0: 20, r1: 360, color: SYMBOLS[sym].fx, w: 12, life: 0.7, sy: 0.7 });
      fx.shake(3);
      this.cur = { global: true, sym };
      await this.wait(200);
      return;
    }
    if (sym === 'deflect') {
      const target = this.views.get(ev.targetId);
      const m = this.playerMuzzle();
      this.audio.play('counter');
      const pr = this.spawnProj('deflect', m.x, m.y, 1900, 12);
      this.cur = { proj: pr, sym: 'counter' };
      if (target) {
        const ip = this.impactPoint(target);
        await this.flyTo(pr, ip.x, ip.y);
      }
      return;
    }
    // 레인 공격: 등지기가 해당 레인 쪽으로 이동해 발사
    if (!ev.side) {
      P.tx = W / 2 + (ev.lane - 1) * LANE_SPACING * 0.55;
      P.dir = ev.lane - 1;
      P.pose = sym === 'counter' ? 'counter' : 'cast';
      P.poseT = 0;
      await this.wait(70);
      // 시전 동작: 등불에 기운이 모였다가 나간다(무슨 기술인지 보이게)
      {
        const m0 = this.playerMuzzle();
        const scol = SYMBOLS[sym]?.fx || '#ffe08a';
        fx.ring(m0.x, m0.y, { r0: 46, r1: 8, color: scol, w: 5, life: 0.22 });
        fx.burst(m0.x, m0.y, { n: 10, speed: 60, color: [scol, '#ffffff'], kind: 'glow', size: 5, life: 0.3 });
        if (SYMBOLS[sym] && sym !== 'counter') this.stamps.push({ sym, x: m0.x, y: m0.y - 34, size: 17, life: 0.45, max: 0.45, rot: 0 });
        await this.wait(sym === 'counter' ? 60 : 210);
      }
    }
    const m = this.playerMuzzle();
    const sx = ev.side ? W / 2 + (ev.lane - 1) * LANE_SPACING : m.x;
    const sy = ev.side ? L.fieldBottom : m.y;
    if (sym === 'spark') {
      // 번개 덩어리가 레인을 달려가 내리꽂힌다
      this.audio.play('spark');
      fx.impact(m.x, m.y, 40, '#ffe45c');
      P.rec = 9;
      fx.kick(0, 2.5);
      const sp = this.spawnProj('spark', m.x, m.y, 1250, 13 + (ev.gild ? 3 : 0));
      sp.tx = W / 2 + (ev.lane - 1) * LANE_SPACING * 0.8;
      sp.ty = m.y - 40;
      this.cur = { proj: sp, sym: 'spark', sx: m.x, sy: m.y, first: true };
      return;
    }
    const speed = { blade: 1500, frost: 1000, wave: 880, venom: 920, counter: 2300, bomb: 760 }[sym] || 1600;
    if (sym === 'bomb') this.audio.play('bombThrow');
    const size = { blade: 17, frost: 15, wave: 17, venom: 15, counter: ev.small ? 13 : 22 }[sym] || 13;
    if (sym === 'blade') this.audio.play('blade', { strong: ev.tier > 1 });
    else if (sym === 'wave') this.audio.play('wave');
    else if (sym === 'frost') this.audio.play('frost');
    else if (sym === 'counter') this.audio.play('counter');
    else if (sym === 'venom') this.audio.play('venom');
    fx.impact(sx, sy, 34, SYMBOLS[sym]?.fx || '#ffffff');
    if (!ev.side) {
      P.rec = sym === 'counter' ? 12 : 9;
      fx.kick(0, 2.5);
    }
    if (sym === 'blade' || sym === 'counter') {
      const lx = W / 2 + (ev.lane - 1) * LANE_SPACING * 0.85;
      fx.slash(lx, L.fieldTop + L.fieldH * 0.55, { ang: Math.PI / 2 + (ev.lane - 1) * 0.11, len: L.fieldH * 0.5, color: sym === 'counter' ? '#ffe08a' : '#cfd8ff', w: 9, life: 0.28 });
    }
    const pr = this.spawnProj(sym, sx, sy, speed, size + (ev.gild ? 3 : 0));
    // 발사 순간: 레인 방향으로 살짝 이동
    pr.tx = W / 2 + (ev.lane - 1) * LANE_SPACING * 0.8;
    pr.ty = sy - 40;
    this.cur = { proj: pr, sym, lane: ev.lane, tier: ev.tier };
    fx.burst(sx, sy, { n: 8, speed: 160, color: [SYMBOLS[sym]?.fx || '#fff', '#ffffff'], kind: 'glow', size: 5, life: 0.3, angle: -Math.PI / 2, spread: 1.2 });
  }

  spawnProj(sym, x, y, speed, size) {
    const pr = { sym, x, y, tx: x, ty: y, speed, size, trail: [], alpha: 1, ang: -Math.PI / 2 };
    this.projs.push(pr);
    return pr;
  }

  async onHit(ev, v) {
    if (!v) return;
    const fx = this.fx;
    const L = this.L;
    const ip = this.impactPoint(v);
    const cur = this.cur;
    if (cur && cur.proj && ev.src !== 'shard' && ev.src !== 'splash' && ev.src !== 'chain' && ev.src !== 'relic') {
      await this.flyTo(cur.proj, ip.x, ip.y);
      if (cur.sym === 'spark' && cur.first) {
        cur.first = false;
        fx.bolt(cur.sx, cur.sy, ip.x, ip.y, { color: '#ffe45c', color2: '#b77cff', w: 5, life: 0.4, segs: 14 });
        this.killProj();
      }
    } else if (cur && cur.spark && ev.src !== 'chain' && ev.src !== 'relic') {
      fx.bolt(cur.x, cur.y, ip.x, ip.y, { color: '#ffe45c', color2: '#b77cff', w: 5, life: 0.32, segs: 12 });
      cur.spark = false;
    } else if (cur && cur.global) {
      await this.wait(55);
    }
    const el = ev.el;
    const cols = EL_COLORS[el] || EL_COLORS.blade;
    const minor = ev.src === 'shard' || ev.src === 'splash' || ev.src === 'chain' || ev.src === 'relic';
    const strong = ev.dmg >= 5 || ev.tags.includes('shatter');
    // 몸이 밀려나고(넉백) 찌그러지고(스쿼시) 떨린다
    const hpBefore = v.hpShown;
    v.hpLag = Math.max(v.hpLag || 0, hpBefore);
    v.lagHold = 0.3;
    v.flash = 1.5;
    v.knock = 16 + Math.min(24, ev.dmg * 3.5);
    v.squash = 0.85;
    v.jit = minor ? 0.08 : 0.2;
    // 맞는 쪽이 휘청이고 순간 부풀었다 돌아온다
    v.kick = (Math.random() < 0.5 ? -1 : 1) * Math.min(0.32, 0.1 + ev.dmg * 0.03);
    v.pop = minor ? 0.4 : 1;
    // 어떤 기술이 맞았는지 큰 문양으로
    const stampSym = el === 'counter' ? 'blade' : el === 'ice' ? 'frost' : el;
    if (SYMBOLS[stampSym] && stampSym !== 'counter' && ev.src !== 'poison') {
      this.stamps.push({ sym: stampSym, x: ip.x, y: ip.y - 4, size: (minor ? 15 : 24) * ip.k, life: 0.4, max: 0.4, rot: (Math.random() - 0.5) * 1.2 });
    }
    if (el === 'venom') fx.burst(ip.x, ip.y, { n: 14, speed: 240, color: ['#a6f04a', '#e6ff9a', '#6a2fb0'], kind: 'dot', size: 4.5, life: 0.55, g: 380, add: false });
    if (el === 'frost') fx.burst(ip.x, ip.y, { n: 10, speed: 120, color: ['#ffffff', '#d6f3ff'], kind: 'glow', size: 6, life: 0.6, vy: -30 });
    // 기술마다 다른 "맞는 맛"
    if (!minor) {
      if (el === 'blade' || el === 'counter') {
        // 십자 베기: 한 박자 뒤 반대 방향으로 한 번 더 긋고, 베인 자국이 남는다
        this.wait(70).then(() => {
          fx.slash(ip.x, ip.y, { ang: 0.7, len: 78, color: '#ffffff', w: 9, life: 0.2 });
          fx.impact(ip.x, ip.y, 46, cols[1]);
        });
        fx.slash(ip.x, ip.y, { ang: -0.5, len: 60, color: cols[2], w: 3, life: 0.55 });
        fx.burst(ip.x, ip.y, { n: 14, speed: 480, color: ['#ffffff', '#ffe08a'], kind: 'streak', size: 3.5, life: 0.25 });
      } else if (el === 'wave') {
        // 물기둥이 솟는다
        fx.burst(ip.x, ip.y + 20, { n: 26, speed: 520, color: ['#eafff8', '#8fffe2', '#2fd0a8'], kind: 'streak', size: 5, life: 0.55, angle: -Math.PI / 2, spread: 0.7, g: 900 });
        this.wait(90).then(() => fx.ring(ip.x, ip.y + 16, { r0: 12, r1: 96, color: '#8fffe2', w: 6, life: 0.45, sy: 0.45 }));
        this.wait(180).then(() => fx.ring(ip.x, ip.y + 16, { r0: 12, r1: 130, color: '#2fd0a8', w: 4, life: 0.5, sy: 0.45 }));
      } else if (el === 'spark') {
        // 하늘에서 한 번 더 내리꽂히고, 몸에 전류가 남는다
        fx.bolt(ip.x + (Math.random() - 0.5) * 60, L.fieldTop - 40, ip.x, ip.y, { color: '#ffffff', color2: '#ffe45c', w: 5, life: 0.3, segs: 10 });
        v.jit = 0.45;
        for (let i = 0; i < 3; i++) {
          this.wait(80 + i * 90).then(() => fx.bolt(ip.x - 26 + Math.random() * 52, ip.y - 30 + Math.random() * 60, ip.x - 26 + Math.random() * 52, ip.y - 30 + Math.random() * 60, { color: '#ffe45c', color2: '#b77cff', w: 2.5, life: 0.16, segs: 5 }));
        }
      } else if (el === 'venom') {
        // 철퍽 — 독이 튀고 흘러내린다
        fx.ring(ip.x, ip.y, { r0: 8, r1: 70, color: '#a6f04a', w: 8, life: 0.4 });
        const foot = this.renderer.viewPos(v);
        fx.ring(foot.x, foot.y, { r0: 10, r1: 58, color: '#8fd63a', w: 10, life: 1.3, sy: 0.32 });
        fx.ring(foot.x, foot.y, { r0: 6, r1: 40, color: '#6a2fb0', w: 5, life: 1.1, sy: 0.32 });
        fx.burst(ip.x, ip.y, { n: 12, speed: 90, color: ['#a6f04a', '#6a2fb0'], kind: 'dot', size: 5, life: 0.9, g: 500, add: false });
      } else if (el === 'frost') {
        // 서리가 퍼지며 얼어붙는다
        fx.ring(ip.x, ip.y, { r0: 8, r1: 80, color: '#e8f8ff', w: 7, life: 0.45 });
        this.wait(100).then(() => fx.burst(ip.x, ip.y, { n: 14, speed: 180, color: ['#ffffff', '#bfe6ff', '#7cc8ff'], kind: 'shard', size: 6, life: 0.6, add: false }));
      }
    }
    if (ev.tags.includes('detonate')) fx.text(ip.x - 50, ip.y - 30, `폭발 +`, { color: '#d6ff5a', size: 20, font: 'num' });
    if (ev.tags.includes('conduct')) {
      fx.text(ip.x, ip.y - 96, '초전도! 연쇄 +1', { color: '#bfe6ff', size: 22, font: 'num' });
      this.comboBadge(ip.x, ip.y - 128, 'frost', 'spark');
    }
    if (ev.tags.includes('surge')) {
      fx.text(ip.x, ip.y - 96, '감전! +2', { color: '#ffe45c', size: 28, font: 'num', life: 1.1 });
      this.comboBadge(ip.x, ip.y - 130, 'wave', 'spark');
      fx.ring(ip.x, ip.y, { r0: 10, r1: 110, color: '#ffe45c', w: 7, life: 0.4 });
      fx.bolt(ip.x - 40, ip.y - 60, ip.x + 30, ip.y + 30, { color: '#ffffff', color2: '#4ff0c4', w: 4, life: 0.3 });
      this.hitstop = Math.max(this.hitstop, 0.12);
      v.wet = 0;
    }
    v.hpShown = ev.hp;
    fx.impact(ip.x, ip.y, (minor ? 26 : 38) + ev.dmg * 7, cols[1]);
    if (el === 'blade' || el === 'counter') {
      fx.slash(ip.x, ip.y, { ang: -0.5 + Math.random() * 0.3, len: el === 'counter' ? 96 : 72, color: cols[1], w: el === 'counter' ? 14 : 10 });
      fx.slash(ip.x, ip.y, { ang: -0.45, len: 48, color: '#ffffff', w: 5, life: 0.16 });
      fx.burst(ip.x, ip.y, { n: 18, speed: 420, color: cols, kind: 'streak', size: 4.5, life: 0.32, angle: -Math.PI / 2, spread: 2.2 });
    } else if (el === 'wave') {
      fx.burst(ip.x, ip.y, { n: 16, speed: 260, color: cols, kind: 'dot', size: 4, life: 0.5, g: 420 });
    } else if (el === 'frost' || el === 'ice') {
      fx.burst(ip.x, ip.y, { n: 12, speed: 230, color: cols, kind: 'shard', size: 4.5, life: 0.5, add: false });
    } else if (el === 'spark') {
      fx.burst(ip.x, ip.y, { n: 16, speed: 340, color: cols, kind: 'streak', size: 3.5, life: 0.28 });
      this.audio.play('chain');
    }
    // 종이 조각이 튄다(맞았다는 물리적 느낌)
    fx.burst(ip.x, ip.y, { n: minor ? 3 : 6 + ev.dmg, speed: 200, color: ['#f3e6c8', '#e2453c', '#ffffff'], kind: 'paper', size: 3.5, life: 0.6, g: 520, drag: 0.95, add: false, vr: 16, vy: -120 });
    fx.ring(ip.x, ip.y, { r0: 8, r1: 36 + ev.dmg * 8, color: cols[1], w: 5, life: 0.28 });
    if (ev.tags.includes('shatter')) {
      this.audio.play('shatter');
      fx.burst(ip.x, ip.y, { n: 34, speed: 460, color: ['#ffffff', '#d6f3ff', '#7cc8ff'], kind: 'shard', size: 7, life: 0.75, g: 300, add: false });
      fx.ring(ip.x, ip.y, { r0: 10, r1: 130, color: '#bfe6ff', w: 8, life: 0.5 });
      fx.text(ip.x, ip.y - 84, '파쇄!', { color: '#bfe6ff', size: 38, font: 'num' });
      this.comboBadge(ip.x, ip.y - 124, 'frost', SYMBOLS[el] && el !== 'counter' ? el : 'blade');
      fx.flash('#bfe6ff', 0.18);
      v.frozen = 0;
    }
    if (ev.tags.includes('shieldBreak')) {
      fx.text(ip.x, ip.y - 116, '탈 파괴!', { color: '#ffffff', size: 28, font: 'num', delay: 0.1 });
      fx.burst(ip.x, ip.y, { n: 18, speed: 300, color: ['#f5ecd9', '#ffffff'], kind: 'paper', size: 6, life: 0.9, g: 400, add: false });
      v.shieldBroken = true;
    }
    if (ev.tags.includes('exposed')) {
      fx.text(ip.x - 46, ip.y - 30, '빈틈 2배', { color: '#d9a0ff', size: 24, font: 'num' });
      v.exposed = false;
    }
    if (ev.tags.includes('weak')) fx.text(ip.x - 46, ip.y - 30, '심장 +2', { color: '#ffe08a', size: 22, font: 'num' });
    if (ev.tags.includes('bane')) {
      fx.text(ip.x + 44, ip.y - 34, '약점!', { color: '#ffb347', size: minor ? 20 : 28, font: 'num', life: 1 });
      if (!minor) {
        fx.ring(ip.x, ip.y, { r0: 10, r1: 90, color: '#ffb347', w: 6, life: 0.35 });
        this.hitstop = Math.max(this.hitstop, 0.12);
        this.conceptCard('bane');
      }
    }
    if (ev.tags.includes('resist')) fx.text(ip.x + 44, ip.y - 34, '저항', { color: '#b8b0c8', size: 20, font: 'num', life: 0.9 });
    // 숫자가 옆으로 튀어 올랐다가 떨어진다
    fx.text(ip.x + (Math.random() - 0.5) * 22, ip.y - 44, `${ev.dmg}`, {
      color: ev.dmg >= 5 ? '#ffe08a' : '#ffffff', size: 32 + Math.min(26, ev.dmg * 3), font: 'num',
      vy: -250 - Math.min(120, ev.dmg * 14), vx: (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 70), g: 520, life: 0.85,
    });
    // 가득 찬 체력을 한 방에
    if (!minor && ev.hp <= 0 && hpBefore >= v.maxHp && v.maxHp >= 4) {
      fx.text(ip.x, ip.y - 104, '일격!', { color: '#ffd84a', size: 32, font: 'num', life: 1.1, vy: -40, delay: 0.05 });
    }
    // 바닥에 남는 자국
    {
      const foot = this.renderer.viewPos(v);
      if (el === 'venom') fx.decal(foot.x, foot.y, { kind: 'puddle', r: 34 * foot.s, color: 'rgba(120,200,50,0.9)', life: 5 });
      else if (el === 'wave') fx.decal(foot.x, foot.y, { kind: 'puddle', r: 38 * foot.s, color: 'rgba(60,200,170,0.8)', life: 3.5 });
      else if (el === 'frost' || el === 'ice') fx.decal(foot.x, foot.y, { kind: 'frost', r: 36 * foot.s, life: 5 });
      else if (el === 'spark') fx.decal(foot.x, foot.y, { kind: 'scorch', r: 30 * foot.s, color: 'rgba(12,6,20,0.9)', life: 4.5 });
      else if (!minor && strong) fx.decal(foot.x, foot.y, { kind: 'crack', r: 44 * foot.s, life: 6 });
    }
    if (strong && !minor) fx.dim(0.32);
    fx.kick((Math.random() - 0.5) * 3, minor ? -2 : -(4 + Math.min(9, ev.dmg * 1.3)));
    this.audio.play('hit', { dmg: ev.dmg, el: ev.el });
    this.hitstop = Math.max(this.hitstop, minor ? 0.045 : Math.min(0.22, 0.09 + ev.dmg * 0.02));
    fx.shake(strong ? 3 : minor ? 1 : 2);
    if (!minor) fx.punchIn(Math.min(0.035, 0.01 + ev.dmg * 0.004));
    this.buzz(minor ? 8 : 14 + ev.dmg * 5);
    await this.wait(minor ? 60 : 180);
  }

  syncViews() {
    const st = this.st;
    if (!st || this.mode !== 'battle') return;
    for (const e of st.enemies) {
      const v = this.views.get(e.id);
      if (!v) continue;
      if (!e.alive) {
        if (!v.dyingStart) {
          v.dyingStart = true;
          this.tween(v, { dying: 1 }, 400);
        }
        continue;
      }
      if (!this.tweens.some((t) => t.obj === v && ('row' in t.to || 'lane' in t.to))) {
        v.row = e.row;
        v.lane = e.lane;
      }
      v.hpShown = e.hp;
      v.maxHp = e.maxHp;
      v.frozen = e.frozen;
      v.exposed = e.exposed;
      v.fury = e.fury;
      v.braced = e.braced;
      v.charge = e.charge;
      v.vulnerable = e.vulnerable;
      v.phase2 = e.phase2;
      v.shieldBroken = e.shieldBroken;
      v.shieldHp = e.shieldHp;
      v.poison = e.poison;
      v.wet = e.wet || 0;
    }
    this.hud.hp = st.player.hp;
    this.refresh();
  }

  // ─────────────── 매 프레임 ───────────────
  tickers = [];
  slowT = 0;
  realTimers = [];
  virtualClock = null;

  // 실시간 기준 시계. 자동 테스트 중에는 프레임 단위로만 흐르는 가상 시계를 쓴다.
  now() {
    return this.virtualClock ?? performance.now();
  }

  update(realDt) {
    this.rt += realDt;
    let dt = realDt * this.timeScale * (this.slowT > 0 ? 0.3 : 1);
    if (this.slowT > 0) this.slowT -= realDt;
    for (const s of this.stamps) s.life -= realDt;
    if (this.comboBadges.length) {
      for (const c of this.comboBadges) { c.life -= realDt; c.y -= realDt * 14; }
      this.comboBadges = this.comboBadges.filter((c) => c.life > 0);
    }
    if (this.relicLinks.length) {
      for (const l of this.relicLinks) l.life -= realDt;
      this.relicLinks = this.relicLinks.filter((l) => l.life > 0);
    }
    if (this.stamps.length) this.stamps = this.stamps.filter((s) => s.life > 0);
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      dt = 0;
    }
    this.time += dt;
    // 타이머
    if (this.timers.length) {
      const due = this.timers.filter((t) => this.time >= t.t);
      if (due.length) {
        this.timers = this.timers.filter((t) => this.time < t.t);
        due.forEach((t) => t.res());
      }
    }
    if (this.realTimers.length) {
      const nowR = this.now();
      const dueR = this.realTimers.filter((t) => nowR >= t.at);
      if (dueR.length) {
        this.realTimers = this.realTimers.filter((t) => nowR < t.at);
        dueR.forEach((t) => t.res());
      }
    }
    // 트윈
    for (const tw of this.tweens) {
      tw.t += dt / tw.dur;
      const k = tw.easing(Math.min(1, tw.t));
      for (const key in tw.to) tw.obj[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * k;
    }
    const doneT = this.tweens.filter((t) => t.t >= 1);
    if (doneT.length) {
      this.tweens = this.tweens.filter((t) => t.t < 1);
      doneT.forEach((t) => t.res());
    }
    for (const f of this.tickers) f();
    // 적 표시 상태 감쇠
    for (const v of this.views.values()) {
      v.t += dt;
      v.flash = Math.max(0, v.flash - dt * 7);
      v.knock *= 0.8 ** (dt * 60);
      v.squash *= 0.85 ** (dt * 60);
      v.blockT = Math.max(0, v.blockT - dt * 3);
      v.kick = (v.kick || 0) * 0.82 ** (realDt * 60);
      v.pop = Math.max(0, (v.pop || 0) - realDt * 7);
      if (v.hpLag == null || v.hpLag < v.hpShown) v.hpLag = v.hpShown;
      else if (v.lagHold > 0) v.lagHold -= realDt;
      else if (v.hpLag > v.hpShown) v.hpLag = Math.max(v.hpShown, v.hpLag - realDt * Math.max(5, (v.hpLag - v.hpShown) * 6));
      if (v.poison > 0 && !v.dying && Math.random() < dt * 3.5) {
        const q = this.renderer.viewPos(v);
        this.fx.particle({ x: q.x + (Math.random() - 0.5) * 34 * q.s, y: q.y - 30 * q.k - Math.random() * 30, vx: 0, vy: -38, g: -20, life: 0.8, max: 0.8, size: 3 + Math.random() * 2.5, color: '#a6f04a', kind: 'dot', add: false });
      }
      if (v.jit > 0) {
        v.jit -= realDt;
        v.jx = v.jit > 0 ? (Math.random() - 0.5) * 9 : 0;
      }
      if (v.charge && v.type === 'archer' && !this.ui.react) v.chargeA = 0.35 + Math.sin(v.t * 6) * 0.1;
      else if (!v.charge && !this.ui.react) v.chargeA *= 0.9;
    }
    for (const [id, v] of this.views) if (v.dying >= 1) this.views.delete(id);
    // 등지기
    const P = this.player;
    P.t += dt;
    P.x += (P.tx - P.x) * Math.min(1, dt * 14);
    P.poseT = Math.min(1, P.poseT + dt * (P.pose === 'dodge' ? 3.2 : 2.5));
    P.flash = Math.max(0, P.flash - dt * 4);
    this.staminaWarn = Math.max(0, (this.staminaWarn || 0) - realDt * 1.6);
    P.rec = (P.rec || 0) * 0.8 ** (realDt * 60);
    P.oy = P.rec < 0.3 ? 0 : P.rec;
    this.hud.shake = Math.max(0, (this.hud.shake || 0) - realDt * 3.5);
    if (P.pose === 'dodge') P.ox = (P.dodgeDir || 1) * 46 * Math.sin(P.poseT * Math.PI);
    else P.ox = 0;
    if (P.poseT >= 1 && !P.holdGuard && P.pose !== 'idle' && P.pose !== 'cast') P.pose = 'idle';
    if (P.pose === 'cast' && P.poseT >= 1 && !this.cur) P.pose = 'idle';
    for (const ai of this.afterimages) ai.a -= dt * 3;
    this.afterimages = this.afterimages.filter((a) => a.a > 0);
    // 발사체
    for (const p of this.projs) {
      if (p.timed) {
        const now = this.now();
        const k = clamp((now - p.t0) / (p.t1 - p.t0), 0, 1);
        p.x = p.sx + (p.ex - p.sx) * k;
        p.y = p.sy + (p.ey - p.sy) * k;
      } else if (!p.dead) {
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        const step = p.speed * dt;
        if (d > 0.5) p.ang = Math.atan2(dy, dx);
        if (d <= step) {
          p.x = p.tx;
          p.y = p.ty;
          if (p.arrive) {
            const a = p.arrive;
            p.arrive = null;
            a();
          }
        } else if (d > 0) {
          p.x += (dx / d) * step;
          p.y += (dy / d) * step;
        }
      } else {
        p.alpha -= dt * 8;
      }
      if (!p.dead && !p.timed && Math.random() < dt * 60) {
        if (p.sym === 'blade') this.fx.particle({ x: p.x + (Math.random() - 0.5) * 30, y: p.y + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 220, vy: 120 + Math.random() * 160, life: 0.3, max: 0.3, size: 3.5, color: Math.random() < 0.5 ? '#ffffff' : '#cfd8ff', kind: 'streak' });
        else if (p.sym === 'spark') this.fx.bolt(p.x, p.y, p.x + (Math.random() - 0.5) * 90, p.y + 20 + Math.random() * 70, { color: '#ffe45c', color2: '#b77cff', w: 2, life: 0.12, segs: 4 });
        else if (p.sym === 'venom') this.fx.particle({ x: p.x + (Math.random() - 0.5) * 16, y: p.y + 8, vx: (Math.random() - 0.5) * 30, vy: 90 + Math.random() * 80, g: 500, life: 0.6, max: 0.6, size: 4 + Math.random() * 3, color: Math.random() < 0.7 ? '#a6f04a' : '#6a2fb0', kind: 'dot', add: false });
        else if (p.sym === 'frost') this.fx.particle({ x: p.x + (Math.random() - 0.5) * 24, y: p.y + 10, vx: (Math.random() - 0.5) * 60, vy: 40, life: 0.5, max: 0.5, size: 4, color: '#e8f8ff', kind: 'shard', rot: Math.random() * 6, vr: 6, add: false });
      }
      p.trail.push([p.x, p.y]);
      if (p.trail.length > 10) p.trail.shift();
    }
    this.projs = this.projs.filter((p) => p.alpha > 0);
    // 레버 움직임(당김 → 스프링 복귀)
    const lv = this.lever;
    if (lv.t >= 0) {
      lv.t += realDt;
      if (!lv.ok) {
        lv.pull = Math.max(0, Math.sin(lv.t * 40) * 0.07);
        if (lv.t > 0.22) { lv.t = -1; lv.pull = 0; }
      } else if (lv.t < 0.1) {
        lv.pull = lv.t / 0.1;
      } else {
        const k = (lv.t - 0.1) / 0.5;
        lv.pull = Math.max(-0.06, (1 - k) * Math.cos(k * Math.PI * 1.6));
        if (k >= 1) { lv.t = -1; lv.pull = 0; }
      }
    }
    this.slotJolt = Math.max(0, this.slotJolt - realDt * 7 - this.slotJolt * realDt * 6);
    for (const k in this.relicPulse) this.relicPulse[k] = Math.max(0, this.relicPulse[k] - realDt * 1.5);
    this.coinPulse = Math.max(0, this.coinPulse - realDt * 4);
    // 날아가는 코인 → 쟁반에 떨어지면 짤랑
    if (this.flies.length) {
      for (const f of this.flies) f.t += realDt;
      const landed = this.flies.filter((f) => f.t >= f.dur);
      const landedN = landed.length;
      if (landedN) {
        this.flies = this.flies.filter((f) => f.t < f.dur);
        for (const f of landed) {
          this.landAt[f.idx] = this.now();
          this.uiFx.burst(f.lx, f.ly, { n: 5, speed: 90, color: ['#ffe08a', '#ffffff'], kind: 'streak', size: 2.5, life: 0.25 });
        }
        this.pile += landedN;
        this.audio.play('coin', { n: 1 + (this.pile % 4) });
        this.slotJolt = Math.max(this.slotJolt, 0.22);
      }
    }
    const coinTarget = this.trayTarget();
    if (this.mode !== 'battle' || this.coinShown > coinTarget || (this.banked && this.coinShown < coinTarget)) {
      this.flies = [];
      this.pile = this.coinShown = coinTarget;
    }
    this.uiFx.update(realDt, realDt);
    const gp = this.ui.preview;
    if (gp && gp.gild && Math.random() < realDt * 26) {
      const ly = this.L.fieldTop + Math.random() * this.L.fieldH;
      const lx = W / 2 + (gp.lane - 1) * LANE_SPACING * (0.8 + 0.2 * ((ly - this.L.fieldTop) / this.L.fieldH)) + (Math.random() - 0.5) * 120;
      this.fx.particle({ x: lx, y: ly, vx: 0, vy: -50, life: 0.7, max: 0.7, size: 3 + Math.random() * 3, color: '#ffe08a', kind: 'glow' });
    }
    if (this.cutin && this.now() - this.cutin.t0 > this.cutin.dur) this.cutin = null;
    // 적을 길게 누르면 정보 카드
    if (this.hold && this.now() - this.hold.at > 430) {
      const hv = this.views.get(this.hold.id);
      this.hold = null;
      if (hv && !this.card && !this.ui.react && !this.ui.counter && this.mode === 'battle') {
        this.ui.armedLane = -1;
        this.inspectEnemy(hv);
      }
    }
    this.updateReels(realDt);
    this.updateReaction();
    if (this.ui.counter && this.now() >= this.ui.counter.deadline) this.pickCounter(this.ui.counter.hover ?? this.ui.counter.def);
    if (this.ui.tipText && this.now() > this.ui.tipUntil) {
      this.ui.tipText = null;
      this.updateInfo();
    }
    if (this.banner && (this.now() - this.banner.t0) / 1000 > this.banner.dur) this.banner = null;
    // HUD 체력 지연 막대
    this.hud.hpLag += (this.hud.hp - this.hud.hpLag) * Math.min(1, realDt * (this.hud.hpLag > this.hud.hp ? 2.5 : 20));
    this.fx.update(dt, realDt);
    if (this.mode === 'battle') {
      const pb = this.pressedBtn;
      this.buttons = this.makeButtons().map((b) => (pb && pb.id === b.id && this.now() < pb.until ? { ...b, pressed: true } : b));
    }
  }

  draw() {
    this.renderer.draw(this);
  }
}
