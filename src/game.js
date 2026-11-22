// 게임 흐름·입력·연출 재생 담당. 규칙 판정은 전부 core/battle.js가 한다.
import * as B from './core/battle.js';
import { BATTLES, ENEMIES, SYMBOLS, SHOT_NAMES, shotDesc, OBJECTIVES } from './core/data.js';
import { createRun, battleOptions, recordBattle, rollRewards, applyReward, advance } from './core/run.js';
import { judge, lateLimit } from './core/timing.js';
import { shotForReel } from './core/slot.js';
import { hashSeed } from './core/rng.js';
import { FX } from './render/fx.js';
import { W, computeLayout, cellPos, laneAt, reelRect, LANE_SPACING } from './render/layout.js';
import { Renderer, REEL_CELL } from './render/scene.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => 1 - (1 - t) ** 3;

const EL_COLORS = {
  blade: ['#ffffff', '#cfd8ff', '#8fa8ff'],
  wave: ['#8fffe2', '#4ff0c4', '#0fae8a'],
  frost: ['#ffffff', '#d6f3ff', '#7cc8ff'],
  spark: ['#ffffff', '#ffe45c', '#b77cff'],
  counter: ['#ffffff', '#ffe08a', '#ff9f1a'],
  ice: ['#ffffff', '#d6f3ff', '#9fdcff'],
};

export class Game {
  constructor(canvas, audio, store, overlay) {
    this.canvas = canvas;
    this.audio = audio;
    this.store = store;
    this.overlay = overlay;
    this.renderer = new Renderer(canvas);
    this.fx = new FX();
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
    this.fx.opts.shake = s.shake;
    this.fx.opts.flash = s.flash;
    this.audio.setVolume({ bgm: s.bgm, sfx: s.sfx, mute: s.mute });
  }

  // ─────────────── 화면 크기 ───────────────
  resize() {
    // 탭이 숨겨진 상태로 로드되면 크기가 0일 수 있다 → 기본값으로 대체
    const vw = window.innerWidth || document.documentElement.clientWidth || 540;
    const vh = window.innerHeight || document.documentElement.clientHeight || 960;
    const H = clamp(Math.round((W * vh) / vw), 900, 1200);
    const scale = Math.min(vw / W, vh / H);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssScale = scale;
    this.L = computeLayout(H);
    this.renderer.resize(this.L, scale * dpr);
    this.canvas.style.width = `${W * scale}px`;
    this.canvas.style.height = `${H * scale}px`;
    this.gearRect = { x: W - 54, y: 12, w: 42, h: 42 };
    this.overlay.fit(W * scale, H * scale, scale);
    if (!this.player.x) this.player.x = W / 2;
  }

  toLogical(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * this.L.H };
  }

  // ─────────────── 타이틀 장면 ───────────────
  setupTitleScene() {
    this.views.clear();
    const demo = [['kasa', 0, 3], ['mask', 1, 2], ['archer', 2, 1], ['kasa', 2, 4]];
    demo.forEach(([type, lane, row], i) => {
      const v = this.makeView({ id: 1000 + i, type, lane, row, hp: ENEMIES[type].hp, maxHp: ENEMIES[type].hp });
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
      spawnT: 0, dying: 0, ox: 0, oy: 0,
    };
  }

  // ─────────────── 런/전투 시작 ───────────────
  startRun(seed) {
    this.audio.unlock();
    this.audio.startBgm();
    const s = seed ?? hashSeed(String(Date.now()));
    this.run = createRun(s);
    // 개발용: ?stage=2 로 특정 전투부터 시작
    const devStage = Number(new URLSearchParams(location.search).get('stage'));
    if (devStage > 0 && devStage < BATTLES.length) this.run.stage = devStage;
    this.store.meta.runs = (this.store.meta.runs || 0) + 1;
    this.store.save();
    this.startBattle();
  }

  async startBattle() {
    const def = BATTLES[this.run.stage];
    const { st, events } = B.createBattle(def, battleOptions(this.run));
    this.st = st;
    this.def = def;
    this.mode = 'battle';
    this.views.clear();
    this.projs = [];
    this.fx.clear();
    this.strips = st.strips;
    this.hud.hp = this.hud.hpLag = st.player.hp;
    this.player.x = this.player.tx = W / 2;
    this.ui = { phase: 'busy', sel: null, hoverLane: -1, armedLane: -1, preview: null, react: null, counter: null };
    this.busy = true;
    this.refresh();
    this.showBanner(`${def.night} — ${def.name}`, `${OBJECTIVES[def.objective.type]}${def.objective.turns ? ` (${def.objective.turns}턴)` : ''} · ${def.intro}`, 2.4);
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
    this.tip('spin', '점괘 북을 돌려 이번 턴의 공격을 얻으세요.');
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
      const it = this.intents[e.id];
      if (it && it.kind === 'attack') this.dangers.push({ lane: e.lane, row: e.row, style: it.style });
      if (it && it.kind === 'brace') this.dangers.push({ lane: e.lane, row: e.row, style: 'heavy' });
    }
    this.omenMark = null;
    if (this.ui.phase === 'aim' && B.canReroll(st)) {
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
      let text = shotDesc(sh.symbol, sh.tier, sh.gild);
      if (ui.preview) {
        const per = Object.values(ui.preview.summary.per);
        const dmg = per.reduce((a, p) => a + p.dmg, 0);
        const kills = per.filter((p) => p.killed).length;
        if (sh.symbol !== 'lantern') text = `예상 피해 ${dmg}${kills ? ` · 처치 ${kills}` : ''}${per.some((p) => p.blocked) ? ' · 막힘!' : ''}`;
      }
      this.info = { title: SHOT_NAMES[sh.symbol][sh.tier] + (sh.gild ? ' ✦' : ''), text, color: SYMBOLS[sh.symbol].fx };
      return;
    }
    if (ui.phase === 'spin') this.info = { text: '돌리기를 눌러 점괘를 읽으세요' };
    else if (ui.phase === 'spinning') this.info = { text: '…' };
    else if (ui.phase === 'react' && ui.react) {
      const st2 = ui.react.attack.style;
      this.info = st2 === 'heavy'
        ? { title: '붉은 고리!', text: '원에 닿는 순간 회피 (막기로는 버티기 어렵다)', color: '#ff6a6a' }
        : { title: '금빛 고리!', text: '원에 닿는 순간 막기 → 퍼펙트면 되치기', color: '#ffcc33' };
    } else if (ui.phase === 'enemy') this.info = { text: '금빛 고리 = 막기로 되치기  ·  붉은 고리 = 회피', color: '#ffd27a' };
    else if (ui.phase === 'counter') this.info = { text: '되치기는 방패를 무시하고 레인 전체를 꿰뚫는다', color: '#ffd84a' };
    else this.info = null;
  }

  makeButtons() {
    const L = this.L;
    const st = this.st;
    const ui = this.ui;
    const y = L.btn.y + 14;
    const h = 82;
    const btns = [];
    if (this.mode !== 'battle' || !st) return btns;
    const enemyMode = ui.phase === 'enemy' || ui.phase === 'react' || ui.phase === 'counter';
    if (enemyMode) {
      const live = ui.phase === 'react' && !ui.react?.input;
      const heavy = ui.react?.attack.style === 'heavy';
      btns.push({ id: 'guard', x: 20, y, w: 244, h, label: '막기', sub: '넓은 판정 · 퍼펙트=되치기', style: 'guard', icon: 'shield', enabled: live, hot: live && !heavy, key: 'J / Space', big: true });
      btns.push({ id: 'dodge', x: 276, y, w: 244, h, label: '회피', sub: '좁은 판정 · 성공=적 노출', style: 'dodge', icon: 'move', enabled: live, hot: live && heavy, key: 'K / Shift', big: true });
      return btns;
    }
    const canRe = B.canReroll(st) && ui.phase === 'aim' && !this.busy;
    let omenText = '돌린 뒤 사용 가능';
    if (ui.phase === 'aim') {
      if (st.shotsFired > 0) omenText = '공격 후에는 불가';
      else if (st.rerollsLeft <= 0) omenText = '이번 턴 소진';
      else {
        const d = B.describeOmen(st, st.omens[st.rerollCount]);
        omenText = `대가: ${d ? d.text : '?'}`;
      }
    }
    btns.push({ id: 'reroll', x: 20, y, w: 200, h, label: `도박 ${st.rerollsLeft}`, sub: canRe ? `${omenText} · 금빛+1` : omenText, style: 'gamble', enabled: canRe, key: 'R' });
    if (ui.phase === 'spin' || ui.phase === 'spinning') {
      btns.push({ id: 'spin', x: 232, y, w: 288, h, label: '돌리기', sub: st.player.embers ? `불씨 ${st.player.embers} → 금빛 릴` : null, style: 'primary', enabled: ui.phase === 'spin' && !this.busy, hot: ui.phase === 'spin' && !this.busy, key: 'Space', big: true });
    } else {
      const left = B.shotsLeft(st);
      const confirm = ui.confirmEnd;
      btns.push({
        id: 'end', x: 232, y, w: 288, h,
        label: confirm ? '정말 종료?' : '턴 종료',
        sub: left ? (confirm ? `남은 공격 ${left}개를 버립니다` : `남은 공격 ${left}개`) : '모든 공격 완료',
        style: confirm ? 'primary' : 'secondary', enabled: ui.phase === 'aim' && !this.busy, key: 'Enter',
      });
    }
    return btns;
  }

  tip(id, text) {
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
    const g = this.gearRect;
    if (p.x >= g.x && p.x <= g.x + g.w && p.y >= g.y && p.y <= g.y + g.h) {
      if (this.ui.react || this.ui.counter) return; // 반응 도중에는 열지 않는다(판정 손실 방지)
      this.overlay.openSettings();
      return;
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
    // 릴(공격 패) 선택
    for (let i = 0; i < 3; i++) {
      const r = reelRect(this.L, i);
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h + 34) {
        this.selectReel(i, touch);
        return;
      }
    }
    // 레인
    const lane = laneAt(this.L, p.x, p.y);
    if (lane >= 0) this.tapLane(lane, touch);
  }

  onPointerMove(e) {
    if (e.pointerType !== 'mouse' || this.mode !== 'battle') return;
    const p = this.toLogical(e.clientX, e.clientY);
    const lane = laneAt(this.L, p.x, p.y);
    if (this.ui.counter) {
      if (lane >= 0) this.setCounterHover(lane);
      return;
    }
    if (this.ui.phase === 'aim' && !this.busy && lane !== this.ui.hoverLane) {
      this.ui.hoverLane = lane;
      this.updatePreview();
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
    if (k === ' ') { e.preventDefault(); if (ui.phase === 'spin') this.press('spin'); }
    if (k === 'r') this.press('reroll');
    if (k === 'enter') this.press('end');
    if (['q', 'w', 'e'].includes(k)) this.selectReel('qwe'.indexOf(k), true);
    if (['1', '2', '3'].includes(k)) this.tapLane(Number(k) - 1, true);
  }

  press(id) {
    const ui = this.ui;
    if (id === 'spin') return this.doSpin();
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

  updatePreview() {
    const ui = this.ui;
    const st = this.st;
    const lane = ui.armedLane >= 0 ? ui.armedLane : ui.hoverLane;
    if (ui.phase !== 'aim' || ui.sel == null || lane < 0 || !st.shots[ui.sel] || st.shots[ui.sel].used) {
      ui.preview = null;
    } else {
      const sh = st.shots[ui.sel];
      const pv = B.previewShot(st, ui.sel, lane);
      ui.preview = {
        lane, symbol: sh.symbol, summary: pv.summary, cells: pv.summary.cells,
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
    await this.animateSpin(evs.find((e) => e.type === 'spin'));
    this.afterSpin();
  }

  async doReroll() {
    if (!B.canReroll(this.st) || this.busy || this.ui.phase !== 'aim') return;
    this.busy = true;
    this.ui.phase = 'spinning';
    this.ui.preview = null;
    this.refresh();
    const evs = B.reroll(this.st);
    await this.playEvents(evs.filter((e) => e.type !== 'spin'));
    await this.animateSpin(evs.find((e) => e.type === 'spin'), true);
    this.afterSpin();
  }

  afterSpin() {
    this.busy = false;
    this.ui.phase = 'aim';
    this.ui.confirmEnd = false;
    this.ui.sel = this.st.shots.findIndex((s) => !s.used);
    this.ui.armedLane = -1;
    this.updatePreview();
    this.tip('aim', '릴을 골라 공격을 정하고, 레인을 눌러 조준하세요.');
  }

  animateSpin(ev, isReroll = false) {
    return new Promise((resolve) => {
      this.audio.play('spinStart');
      const now = this.rt;
      this.reels.forEach((r, i) => {
        r.spinning = true;
        r.tween = null;
        r.vel = 28 + i * 2;
        r.stopAt = now + 0.5 + i * 0.28 + (isReroll ? -0.1 : 0);
        r.target = ev.reels[i].stop;
        r.gilded = ev.reels[i].gilded;
        r.landed = false;
      });
      this.spinDone = () => {
        const tiers = ev.shots.map((s) => s.tier);
        const top = Math.max(...tiers);
        if (top === 3) {
          const sh = ev.shots[0];
          this.audio.play('jackpot');
          this.fx.flash('#ffe08a', 0.45);
          this.showBanner(`잭팟! ${SHOT_NAMES[sh.symbol][3]}`, '세 문양이 하나로', 1.6, '#ffe08a', 40);
          this.reels.forEach((r) => (r.flashT = 1));
        } else if (top === 2) {
          this.audio.play('link', { tier: 2 });
          const sh = ev.shots.find((s) => s.tier === 2);
          sh.reels.forEach((i) => (this.reels[i].flashT = 0.8));
        }
        this.waitReal(top >= 2 ? 380 : 120).then(resolve);
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
    const evs = B.fireShot(st, i, lane);
    await this.playEvents(evs);
    this.player.tx = W / 2;
    if (st.result) return this.endBattle();
    this.busy = false;
    ui.phase = 'aim';
    ui.sel = st.shots.findIndex((s) => !s.used);
    if (ui.sel < 0) ui.sel = null;
    this.updatePreview();
    if (ui.sel == null) {
      await this.wait(250);
      this.enemyPhase();
    }
  }

  // ─────────────── 적의 차례 ───────────────
  async enemyPhase() {
    const st = this.st;
    if (st.phase !== 'aim') return;
    this.busy = true;
    this.ui.phase = 'enemy';
    this.ui.preview = null;
    this.ui.sel = null;
    this.ui.confirmEnd = false;
    this.audio.setIntensity(1);
    this.refresh();
    await this.playEvents(B.endPlayerTurn(st));
    for (let guard = 0; guard < 80; guard++) {
      const step = B.nextEnemyStep(st);
      const pre = step.done ? [] : step.events;
      await this.playEvents(pre);
      let atk = step.attack;
      while (atk) {
        this.tip('react', atk.style === 'heavy' ? '붉은 고리! 닿는 순간 회피하세요.' : '고리가 원에 닿는 순간 막기! 정확하면 퍼펙트.');
        const input = await this.runReaction(atk);
        const res = B.resolveReaction(st, input);
        await this.playEvents(res.events);
        atk = null;
        if (res.counter && !st.result) {
          const lane = await this.chooseCounter(res.counter.defaultLane);
          await this.playEvents(B.resolveCounter(st, lane));
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
    const dur = attack.windup * (this.settings.assist ? 1.2 : 1);
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
    const grade = judge(action, offset, r.assist);
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
    this.reactionFeedback(r, input);
    this.ui.phase = 'enemy';
    this.player.holdGuard = false;
    this.refresh();
    r.resolve(input);
  }

  reactionFeedback(r, input) {
    const P = this.player;
    const x = P.x;
    const y = this.L.playerY - 50;
    const heavy = r.attack.style === 'heavy';
    const fx = this.fx;
    this.audio.play('enemyStrike', { style: r.attack.style });
    if (input.action === 'guard' && input.grade === 'perfect' && !heavy) {
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
    this.refresh();
    await this.wait(500);
    if (st.result === 'win') {
      this.audio.play('win');
      this.showBanner('승리!', `${this.def.name} 돌파`, 1.8, '#ffe08a', 46);
      recordBattle(this.run, st);
      await this.waitReal(1700);
      const last = this.run.stage >= BATTLES.length - 1;
      if (last) {
        this.store.meta.wins = (this.store.meta.wins || 0) + 1;
        this.store.meta.best = Math.max(this.store.meta.best || 0, BATTLES.length);
        this.store.save();
        this.mode = 'result';
        this.overlay.showResult(true, this.run);
      } else {
        this.store.meta.best = Math.max(this.store.meta.best || 0, this.run.stage + 1);
        this.store.save();
        this.mode = 'reward';
        const opts = rollRewards(this.run);
        this.overlay.showReward(opts, this.run, (id) => {
          applyReward(this.run, id);
          this.audio.play('buy');
          advance(this.run);
          this.startBattle();
        });
      }
    } else {
      this.audio.play('lose');
      this.showBanner('등불이 꺼졌다…', '행렬이 다리를 건넜다', 2, '#ff8a7a', 40);
      recordBattle(this.run, st);
      await this.waitReal(2000);
      this.mode = 'result';
      this.overlay.showResult(false, this.run);
    }
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
    const h = { kasa: 42, mask: 46, archer: 48, elder: 58 }[v.type] || 40;
    return { x: p.x, y: p.y - h * p.k, k: p.k };
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
    for (const ev of evs) await this.playEvent(ev);
    this.syncViews();
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
        if (ev.src === 'omen') fx.text(p.x, p.y - 70, '흉조!', { color: '#e0b0ff', size: 22, font: 'num' });
        this.tween(nv, { spawnT: 1 }, 380);
        if (ENEMIES[nv.type].boss) {
          this.audio.play('bossPhase');
          this.showBanner('등롱 장로', '충전 중엔 등불 심장이 드러난다', 2.2, '#ffb347');
          await this.wait(800);
        }
        await this.wait(110);
        break;
      }
      case 'turn':
        break;
      case 'omen': {
        this.audio.play('omen');
        fx.flash('#6a20c0', 0.18);
        this.showBanner('흉조', ev.desc?.text || '', 1.1, '#e0b0ff', 30);
        await this.wait(420);
        break;
      }
      case 'move':
      case 'push': {
        if (!v) break;
        const steps = Math.abs(ev.to - ev.from);
        this.audio.play('move', { hop: ev.hop });
        if (v.type === 'kasa') {
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
        fx.text(p.x, p.y - 40, `분노 +${ev.amount}`, { color: '#ff6a6a', size: 22, font: 'num' });
        fx.burst(p.x, p.y, { n: 10, speed: 90, color: ['#ff3b3b', '#ff8a5a'], kind: 'glow', size: 5, vy: -60 });
        await this.wait(280);
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
        fx.text(ip.x, ip.y - 44, '막힘!', { color: '#50f0be', size: 26, font: 'num' });
        fx.shake(1);
        this.hitstop = Math.max(this.hitstop, 0.05);
        await this.wait(160);
        break;
      }
      case 'kill': {
        if (!v) break;
        const ip = this.impactPoint(v);
        const big = ev.etype === 'elder';
        v.dyingStart = true;
        this.tween(v, { dying: 1 }, big ? 1100 : 520, (t) => t);
        this.audio.play('kill', { big });
        this.hitstop = Math.max(this.hitstop, big ? 0.3 : 0.07);
        fx.shake(big ? 4 : 2);
        if (big) fx.flash('#fff4c0', 0.6);
        const cols = { kasa: ['#e2453c', '#b8302e', '#f3d38a', '#ffe0c0'], mask: ['#f5ecd9', '#ffffff', '#352a64', '#e2453c'], archer: ['#ffbf52', '#fff4c4', '#e0682a'], elder: ['#ffb04a', '#fff2c0', '#ff5a6e', '#ffffff'] }[ev.etype];
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
        fx.text(P.x, L.playerY - 120, `방어막 +${ev.amount}`, { color: '#ffd27a', size: 24, font: 'num' });
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
        fx.text(ip.x, ip.y - 50, '노출! 다음 피해 ×2', { color: '#d9a0ff', size: 20, font: 'num' });
        fx.burst(ip.x, ip.y, { n: 12, speed: 120, color: ['#a050ff', '#e0b0ff'], kind: 'glow', size: 5, life: 0.5 });
        await this.wait(180);
        break;
      }
      case 'enemyPhase':
        this.audio.play('enemyTurn');
        this.showBanner('행렬의 차례', null, 0.9, '#ff9a8a', 30);
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
        fx.text(ip.x, ip.y - 90, '일제 사격 준비 — 심장 노출!', { color: '#ffe08a', size: 20, font: 'num', life: 1.4 });
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
        this.showBanner('장로가 타오른다!', '공격 주기가 빨라진다', 1.6, '#ff8a8a');
        await this.wait(700);
        break;
      }
      case 'react':
        if (ev.ember) {
          const P = this.player;
          this.audio.play('ember');
          fx.text(150, L.hudH + 18, '+불씨 (다음 돌리기 금빛)', { color: '#ffb347', size: 17, font: 'num', delay: 0.25, vy: -10, life: 1.4 });
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
          this.hitstop = Math.max(this.hitstop, 0.06);
          fx.text(P.x + 30, L.playerY - 90, `-${ev.dmg}`, { color: '#ff5a5a', size: 34, font: 'num' });
          fx.burst(P.x, L.playerY - 50, { n: 14, speed: 200, color: ['#ff5a5a', '#ffffff'], kind: 'streak', size: 4, life: 0.35 });
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
    }
    const m = this.playerMuzzle();
    const sx = ev.side ? W / 2 + (ev.lane - 1) * LANE_SPACING : m.x;
    const sy = ev.side ? L.fieldBottom : m.y;
    if (sym === 'spark') {
      this.audio.play('spark');
      this.cur = { spark: true, x: m.x, y: m.y };
      return;
    }
    const speed = { blade: 2600, frost: 1800, wave: 1400, counter: 2700 }[sym] || 2000;
    const size = { blade: 14, frost: 11, wave: 14, counter: ev.small ? 12 : 20 }[sym] || 12;
    if (sym === 'blade') this.audio.play('blade', { strong: ev.tier > 1 });
    else if (sym === 'wave') this.audio.play('wave');
    else if (sym === 'frost') this.audio.play('frost');
    else if (sym === 'counter') this.audio.play('counter');
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
    const ip = this.impactPoint(v);
    const cur = this.cur;
    if (cur && cur.proj && ev.src !== 'shard' && ev.src !== 'splash' && ev.src !== 'chain') {
      await this.flyTo(cur.proj, ip.x, ip.y);
    } else if (cur && cur.spark && ev.src !== 'chain') {
      fx.bolt(cur.x, cur.y, ip.x, ip.y, { color: '#ffe45c', color2: '#b77cff', w: 4, life: 0.3, segs: 12 });
      cur.spark = false;
    } else if (cur && cur.global) {
      await this.wait(55);
    }
    const el = ev.el;
    const cols = EL_COLORS[el] || EL_COLORS.blade;
    v.flash = 1;
    v.knock = 10 + Math.min(14, ev.dmg * 2);
    v.squash = 0.5;
    v.hpShown = ev.hp;
    const strong = ev.dmg >= 5 || ev.tags.includes('shatter');
    // 원소별 타격 이펙트
    if (el === 'blade' || el === 'counter') {
      fx.slash(ip.x, ip.y, { ang: -0.5 + Math.random() * 0.3, len: el === 'counter' ? 80 : 60, color: cols[1], w: el === 'counter' ? 12 : 8 });
      fx.slash(ip.x, ip.y, { ang: -0.45, len: 40, color: '#ffffff', w: 4, life: 0.15 });
      fx.burst(ip.x, ip.y, { n: 14, speed: 360, color: cols, kind: 'streak', size: 4, life: 0.3, angle: -Math.PI / 2, spread: 2.2 });
    } else if (el === 'wave') {
      fx.burst(ip.x, ip.y, { n: 12, speed: 220, color: cols, kind: 'dot', size: 3.5, life: 0.45, g: 400 });
    } else if (el === 'frost' || el === 'ice') {
      fx.burst(ip.x, ip.y, { n: 10, speed: 200, color: cols, kind: 'shard', size: 4, life: 0.45, add: false });
    } else if (el === 'spark') {
      fx.burst(ip.x, ip.y, { n: 12, speed: 300, color: cols, kind: 'streak', size: 3, life: 0.25 });
      this.audio.play('chain');
    }
    fx.ring(ip.x, ip.y, { r0: 6, r1: 30 + ev.dmg * 6, color: cols[1], w: 4, life: 0.25 });
    if (ev.tags.includes('shatter')) {
      this.audio.play('shatter');
      fx.burst(ip.x, ip.y, { n: 30, speed: 420, color: ['#ffffff', '#d6f3ff', '#7cc8ff'], kind: 'shard', size: 7, life: 0.7, g: 300, add: false });
      fx.ring(ip.x, ip.y, { r0: 10, r1: 110, color: '#bfe6ff', w: 7, life: 0.45 });
      fx.text(ip.x, ip.y - 78, '파쇄!', { color: '#bfe6ff', size: 34, font: 'num' });
      v.frozen = 0;
    }
    if (ev.tags.includes('shieldBreak')) {
      fx.text(ip.x, ip.y - 110, '탈 파괴!', { color: '#ffffff', size: 28, font: 'num', delay: 0.1 });
      fx.burst(ip.x, ip.y, { n: 18, speed: 300, color: ['#f5ecd9', '#ffffff'], kind: 'paper', size: 6, life: 0.9, g: 400, add: false });
      v.shieldBroken = true;
    }
    if (ev.tags.includes('exposed')) fx.text(ip.x - 44, ip.y - 30, '×2', { color: '#d9a0ff', size: 26, font: 'num' });
    if (ev.tags.includes('weak')) fx.text(ip.x - 44, ip.y - 30, '심장 +2', { color: '#ffe08a', size: 22, font: 'num' });
    if (ev.tags.includes('exposed')) v.exposed = false;
    const big = ev.dmg >= 5;
    fx.text(ip.x + (Math.random() - 0.5) * 20, ip.y - 46, `${ev.dmg}`, {
      color: big ? '#ffe08a' : '#ffffff', size: 28 + Math.min(18, ev.dmg * 2.2), font: 'num', vy: -90,
    });
    this.audio.play('hit', { dmg: ev.dmg });
    const minor = ev.src === 'shard' || ev.src === 'splash' || ev.src === 'chain';
    this.hitstop = Math.max(this.hitstop, minor ? 0.03 : Math.min(0.12, 0.04 + ev.dmg * 0.012));
    fx.shake(strong ? 3 : minor ? 1 : 2);
    await this.wait(minor ? 45 : 85);
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
    }
    this.hud.hp = st.player.hp;
    this.refresh();
  }

  // ─────────────── 매 프레임 ───────────────
  tickers = [];
  realTimers = [];
  virtualClock = null;

  // 실시간 기준 시계. 자동 테스트 중에는 프레임 단위로만 흐르는 가상 시계를 쓴다.
  now() {
    return this.virtualClock ?? performance.now();
  }

  update(realDt) {
    this.rt += realDt;
    let dt = realDt * this.timeScale;
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
      p.trail.push([p.x, p.y]);
      if (p.trail.length > 10) p.trail.shift();
    }
    this.projs = this.projs.filter((p) => p.alpha > 0);
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
