// 모든 효과음과 배경음악을 Web Audio로 직접 합성한다(외부 음원 없음 → 라이선스 문제 없음).

export class Audio {
  constructor() {
    this.ctx = null;
    this.vol = { bgm: 0.55, sfx: 0.8, mute: false };
    this.bgmOn = false;
    this.intensity = 0;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.comp.connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.comp);
      this.bgmBus = ctx.createGain();
      this.bgmBus.connect(this.comp);
      // 배경음악용 딜레이(공간감)
      this.delay = ctx.createDelay(1);
      this.delay.delayTime.value = 0.36;
      this.fb = ctx.createGain();
      this.fb.gain.value = 0.32;
      this.delayLP = ctx.createBiquadFilter();
      this.delayLP.type = 'lowpass';
      this.delayLP.frequency.value = 2400;
      this.delay.connect(this.delayLP);
      this.delayLP.connect(this.fb);
      this.fb.connect(this.delay);
      this.delayWet = ctx.createGain();
      this.delayWet.gain.value = 0.35;
      this.delayLP.connect(this.delayWet);
      this.delayWet.connect(this.bgmBus);
      this.noiseBuf = this.makeNoise();
      this.applyVolume();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    Object.assign(this.vol, v);
    this.applyVolume();
  }

  applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.mute ? 0 : 1, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.02);
    this.bgmBus.gain.setTargetAtTime(this.vol.bgm * 0.5, t, 0.05);
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 1.5;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ───── 기본 합성 블록 ─────
  tone({ type = 'sine', f = 440, f2 = null, t = 0, dur = 0.2, vol = 0.3, attack = 0.004, bus = null, detune = 0, curve = 'exp', q = null, filter = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const st = c.currentTime + t;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, st);
    o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), st + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, st);
    g.gain.linearRampToValueAtTime(vol, st + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
    else g.gain.linearRampToValueAtTime(0.0001, st + dur);
    let node = o;
    if (filter) {
      const fl = c.createBiquadFilter();
      fl.type = filter.type || 'lowpass';
      fl.frequency.value = filter.f;
      if (q) fl.Q.value = q;
      o.connect(fl);
      node = fl;
    }
    node.connect(g);
    g.connect(bus || this.sfxBus);
    o.start(st);
    o.stop(st + dur + 0.05);
    return g;
  }

  noise({ t = 0, dur = 0.2, vol = 0.3, type = 'bandpass', f = 1000, f2 = null, q = 1, attack = 0.003, bus = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const st = c.currentTime + t;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, st);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, st + dur);
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, st);
    g.gain.linearRampToValueAtTime(vol, st + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
    s.connect(fl);
    fl.connect(g);
    g.connect(bus || this.sfxBus);
    s.start(st, Math.random() * 0.5);
    s.stop(st + dur + 0.05);
  }

  // ───── 효과음 ─────
  play(name, opt = {}) {
    if (!this.ctx || this.vol.mute) return;
    const fn = this['s_' + name];
    if (fn) fn.call(this, opt);
  }

  s_ui() {
    this.tone({ type: 'triangle', f: 880, f2: 1320, dur: 0.07, vol: 0.12 });
  }
  s_deny() {
    this.tone({ type: 'square', f: 180, f2: 120, dur: 0.12, vol: 0.06 });
  }
  s_spinStart() {
    this.noise({ dur: 0.25, vol: 0.18, f: 600, f2: 2400, q: 2 });
    this.tone({ type: 'sawtooth', f: 90, f2: 160, dur: 0.3, vol: 0.06, filter: { f: 600 } });
  }
  s_tick({ pitch = 1 } = {}) {
    this.noise({ dur: 0.025, vol: 0.12, f: 3200 * pitch, q: 8 });
  }
  s_reelStop({ i = 0 } = {}) {
    // 묵직한 "쿵" + 금속 걸쇠 "철컥"
    this.tone({ type: 'sine', f: 170 - i * 14, f2: 42, dur: 0.3, vol: 0.75 });
    this.tone({ type: 'square', f: 90, f2: 50, dur: 0.07, vol: 0.12, filter: { f: 700 } });
    this.noise({ dur: 0.05, vol: 0.4, f: 2400, q: 1.2 });
    this.noise({ t: 0.03, dur: 0.09, vol: 0.2, type: 'highpass', f: 4500 });
    this.tone({ type: 'triangle', f: 660 + i * 110, dur: 0.18, vol: 0.09 });
  }
  s_lever() {
    this.noise({ dur: 0.07, vol: 0.45, f: 1500, q: 1 });
    this.tone({ type: 'sine', f: 220, f2: 70, dur: 0.16, vol: 0.5 });
    this.tone({ type: 'sawtooth', f: 60, f2: 240, t: 0.1, dur: 0.28, vol: 0.09, filter: { f: 900 } }); // 스프링
    this.noise({ t: 0.16, dur: 0.05, vol: 0.3, f: 2600, q: 2 });
  }
  s_cutin({ big = false } = {}) {
    this.noise({ dur: 0.35, vol: 0.3, type: 'bandpass', f: 400, f2: 3200, q: 1.2 });
    this.tone({ type: 'sawtooth', f: big ? 80 : 120, f2: big ? 320 : 360, dur: 0.4, vol: 0.12, filter: { f: 1400 } });
    if (big) this.gong(0.25, 0.4);
  }
  s_combo({ n = 2 } = {}) {
    const base = 660 * 2 ** ((Math.min(8, n) - 2) * 2 / 12);
    [0, 4, 7].forEach((s, k) => this.tone({ type: 'triangle', f: base * 2 ** (s / 12), t: k * 0.045, dur: 0.3, vol: 0.13 }));
    this.taiko(0, 0.35);
  }
  s_bingo({ level = 1 } = {}) {
    if (level >= 2) [0, 5, 9, 12, 17, 21, 24, 29].forEach((n, k) => this.tone({ type: 'square', f: 392 * 2 ** (n / 12), t: 0.3 + k * 0.06, dur: 0.25, vol: 0.05, filter: { f: 2600 } }));
    if (level >= 3) { this.gong(0.5, 0.5); this.taiko(0.2, 0.5); this.taiko(0.45, 0.5); this.taiko(0.7, 0.6); }
    [0, 4, 7, 12, 16, 19, 24].forEach((n, k) => this.tone({ type: 'triangle', f: 523 * 2 ** (n / 12), t: k * 0.05, dur: 0.5, vol: 0.14 }));
    [0, 7, 12].forEach((n, k) => this.tone({ type: 'square', f: 1046 * 2 ** (n / 12), t: 0.35 + k * 0.07, dur: 0.18, vol: 0.05, filter: { f: 3000 } }));
    this.gong(0, 0.3);
  }
  s_venom() {
    this.noise({ dur: 0.3, vol: 0.25, type: 'bandpass', f: 500, f2: 1600, q: 4 });
    this.tone({ type: 'sine', f: 300, f2: 140, dur: 0.25, vol: 0.18 });
    for (let i = 0; i < 4; i++) this.tone({ type: 'sine', f: 500 + Math.random() * 700, f2: 1500, t: 0.05 + i * 0.05, dur: 0.06, vol: 0.07 });
  }
  s_shieldBreak() {
    this.noise({ dur: 0.35, vol: 0.5, type: 'bandpass', f: 1800, f2: 500, q: 0.8 });
    this.tone({ type: 'square', f: 240, f2: 70, dur: 0.25, vol: 0.2, filter: { f: 1500 } });
    for (let i = 0; i < 5; i++) this.tone({ type: 'triangle', f: 900 + Math.random() * 1600, t: i * 0.03, dur: 0.12, vol: 0.07 });
  }
  s_relic() {
    [0, 7, 12].forEach((n, k) => this.tone({ type: 'sine', f: 880 * 2 ** (n / 12), t: k * 0.035, dur: 0.3, vol: 0.09 }));
    this.tone({ type: 'triangle', f: 440, dur: 0.12, vol: 0.08 });
  }
  s_card() {
    this.noise({ dur: 0.12, vol: 0.12, type: 'highpass', f: 3000 });
    this.tone({ type: 'triangle', f: 587, f2: 880, dur: 0.12, vol: 0.08 });
  }
  s_link({ tier = 2 } = {}) {
    const base = tier === 3 ? 523 : 440;
    [0, 4, 7, 12].forEach((n, k) => this.tone({ type: 'triangle', f: base * 2 ** (n / 12), t: k * 0.06, dur: 0.5, vol: 0.12 }));
  }
  s_jackpot() {
    [0, 3, 5, 7, 10, 12, 15, 19].forEach((n, k) => this.tone({ type: 'triangle', f: 392 * 2 ** (n / 12), t: k * 0.055, dur: 0.6, vol: 0.13 }));
    this.gong(0.05, 0.35);
  }
  gong(t = 0, vol = 0.3) {
    [1, 2.76, 5.4].forEach((m, k) => this.tone({ type: 'sine', f: 110 * m, t, dur: 2.2 - k * 0.5, vol: vol / (k + 1), attack: 0.01 }));
  }
  s_gild() {
    [0, 7, 12].forEach((n, k) => this.tone({ type: 'sine', f: 1046 * 2 ** (n / 12), t: k * 0.04, dur: 0.35, vol: 0.08 }));
  }
  s_omen() {
    this.tone({ type: 'sawtooth', f: 220, f2: 110, dur: 0.6, vol: 0.12, filter: { f: 700 } });
    this.tone({ type: 'sawtooth', f: 233, f2: 104, dur: 0.6, vol: 0.1, filter: { f: 700 } });
    this.noise({ dur: 0.5, vol: 0.12, f: 300, type: 'lowpass' });
  }
  s_select() {
    this.tone({ type: 'triangle', f: 660, f2: 990, dur: 0.06, vol: 0.1 });
  }
  s_aim() {
    this.tone({ type: 'sine', f: 1200, dur: 0.05, vol: 0.05 });
  }
  s_blade({ strong = false } = {}) {
    this.noise({ dur: 0.18, vol: 0.35, type: 'highpass', f: 1500, f2: 6000, q: 0.7 });
    this.tone({ type: 'sawtooth', f: 1800, f2: 600, dur: 0.12, vol: 0.05, filter: { f: 4000 } });
    if (strong) this.noise({ t: 0.03, dur: 0.3, vol: 0.25, type: 'bandpass', f: 900, f2: 4000, q: 1 });
  }
  s_wave() {
    this.tone({ type: 'sine', f: 180, f2: 60, dur: 0.4, vol: 0.4 });
    this.noise({ dur: 0.45, vol: 0.25, type: 'lowpass', f: 1400, f2: 200 });
  }
  s_burst() {
    this.tone({ type: 'sine', f: 120, f2: 40, dur: 0.5, vol: 0.55 });
    this.noise({ dur: 0.5, vol: 0.3, type: 'lowpass', f: 2600, f2: 120 });
  }
  s_frost() {
    [2093, 2637, 3136].forEach((f, k) => this.tone({ type: 'sine', f, t: k * 0.025, dur: 0.3, vol: 0.06 }));
    this.noise({ dur: 0.25, vol: 0.12, type: 'highpass', f: 5000 });
  }
  s_freeze() {
    this.noise({ dur: 0.35, vol: 0.2, type: 'bandpass', f: 4200, q: 3 });
    [1568, 2349].forEach((f, k) => this.tone({ type: 'triangle', f, t: 0.03 * k, dur: 0.4, vol: 0.06 }));
  }
  s_spark() {
    const c = this.ctx;
    const st = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const g = c.createGain();
    for (let i = 0; i < 10; i++) o.frequency.setValueAtTime(120 + Math.random() * 900, st + i * 0.018);
    g.gain.setValueAtTime(0.14, st);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 0.22);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(st);
    o.stop(st + 0.25);
    this.noise({ dur: 0.08, vol: 0.35, type: 'highpass', f: 3000 });
  }
  s_chain() {
    this.noise({ dur: 0.07, vol: 0.25, type: 'highpass', f: 2500 });
    this.tone({ type: 'square', f: 900 + Math.random() * 500, f2: 200, dur: 0.08, vol: 0.05 });
  }
  s_ward() {
    [0, 5, 9].forEach((n, k) => this.tone({ type: 'sine', f: 587 * 2 ** (n / 12), t: k * 0.05, dur: 0.5, vol: 0.1 }));
  }
  s_heal() {
    [0, 4, 7, 12].forEach((n, k) => this.tone({ type: 'triangle', f: 523 * 2 ** (n / 12), t: k * 0.07, dur: 0.4, vol: 0.08 }));
  }
  s_hit({ dmg = 2 } = {}) {
    // 저음 몸통 + 찢어지는 중음 + 짧은 "딱" → 피해가 클수록 낮고 크게
    const v = Math.min(0.85, 0.4 + dmg * 0.07);
    const f = Math.max(90, 190 - dmg * 12);
    this.tone({ type: 'sine', f, f2: 38, dur: 0.22 + dmg * 0.012, vol: v });
    this.tone({ type: 'square', f: f * 1.5, f2: 60, dur: 0.06, vol: v * 0.16, filter: { f: 1400 } });
    this.noise({ dur: 0.035, vol: v * 0.8, type: 'highpass', f: 2800 });
    this.noise({ t: 0.01, dur: 0.14, vol: v * 0.55, type: 'bandpass', f: 900, f2: 300, q: 0.7 });
    this.tone({ type: 'sawtooth', f: 70, f2: 30, dur: 0.16, vol: v * 0.35, filter: { f: 260 } }); // 배에 울리는 저음
    this.noise({ t: 0.05, dur: 0.22, vol: v * 0.18, type: 'lowpass', f: 500 }); // 잔향
  }
  s_block() {
    this.tone({ type: 'square', f: 300, f2: 280, dur: 0.12, vol: 0.08 });
    this.tone({ type: 'triangle', f: 1400, dur: 0.2, vol: 0.08 });
    this.noise({ dur: 0.1, vol: 0.2, type: 'bandpass', f: 2500, q: 3 });
  }
  s_shatter() {
    for (let i = 0; i < 6; i++) this.tone({ type: 'triangle', f: 2000 + Math.random() * 3000, t: i * 0.02, dur: 0.18, vol: 0.06 });
    this.noise({ dur: 0.3, vol: 0.35, type: 'highpass', f: 2000 });
    this.tone({ type: 'sine', f: 200, f2: 60, dur: 0.25, vol: 0.35 });
  }
  s_kill({ big = false } = {}) {
    this.tone({ type: 'sine', f: 110, f2: 34, dur: 0.4, vol: 0.6 });
    this.noise({ dur: 0.05, vol: 0.5, type: 'highpass', f: 3500 });
    this.noise({ dur: 0.3, vol: 0.3, type: 'bandpass', f: 2200, f2: 500, q: 0.7 }); // 종이 찢김
    this.tone({ type: 'sine', f: 300, f2: 60, dur: 0.3, vol: 0.35 });
    this.tone({ type: 'triangle', f: 880, f2: 1760, t: 0.05, dur: 0.15, vol: 0.06 });
    if (big) this.gong(0.05, 0.4);
  }
  s_spawn() {
    this.tone({ type: 'sine', f: 300, f2: 600, dur: 0.25, vol: 0.06 });
    this.noise({ dur: 0.3, vol: 0.06, type: 'lowpass', f: 800 });
  }
  s_move({ hop = false } = {}) {
    this.tone({ type: 'sine', f: hop ? 260 : 140, f2: hop ? 420 : 90, dur: 0.1, vol: 0.12 });
  }
  s_land() {
    this.tone({ type: 'sine', f: 110, f2: 50, dur: 0.12, vol: 0.2 });
  }
  s_windup({ style = 'melee', dur = 0.8 } = {}) {
    if (!this.ctx) return;
    // 예고음: 고리가 줄어드는 동안 상승, 적중 순간에 정확히 "틱"
    const heavy = style === 'heavy';
    this.tone({ type: heavy ? 'sawtooth' : 'triangle', f: heavy ? 90 : 300, f2: heavy ? 180 : 900, dur, vol: heavy ? 0.1 : 0.05, curve: 'lin', attack: dur * 0.8, filter: { f: heavy ? 900 : 3000 } });
    this.tone({ type: 'sine', f: heavy ? 660 : 1320, t: dur, dur: 0.06, vol: 0.12 });
  }
  s_enemyStrike({ style = 'melee' } = {}) {
    if (style === 'heavy') {
      this.tone({ type: 'sine', f: 90, f2: 30, dur: 0.5, vol: 0.6 });
      this.noise({ dur: 0.4, vol: 0.4, type: 'lowpass', f: 900, f2: 100 });
    } else if (style === 'ranged' || style === 'volley') {
      this.noise({ dur: 0.2, vol: 0.25, type: 'bandpass', f: 800, f2: 300, q: 1 });
    } else {
      this.noise({ dur: 0.12, vol: 0.25, type: 'bandpass', f: 1400, q: 1 });
    }
  }
  s_fireball() {
    this.noise({ dur: 0.5, vol: 0.18, type: 'bandpass', f: 500, f2: 1400, q: 1.2 });
  }
  s_playerHurt() {
    this.tone({ type: 'square', f: 220, f2: 80, dur: 0.25, vol: 0.12, filter: { f: 1200 } });
    this.tone({ type: 'sine', f: 140, f2: 50, dur: 0.3, vol: 0.45 });
  }
  s_guard() {
    this.tone({ type: 'square', f: 420, f2: 380, dur: 0.1, vol: 0.08, filter: { f: 3000 } });
    this.noise({ dur: 0.12, vol: 0.3, type: 'bandpass', f: 3000, q: 4 });
    this.tone({ type: 'triangle', f: 1600, dur: 0.25, vol: 0.06 });
  }
  s_perfect() {
    this.tone({ type: 'sine', f: 1760, dur: 0.8, vol: 0.18 });
    this.tone({ type: 'sine', f: 2637, dur: 0.6, vol: 0.1 });
    this.tone({ type: 'triangle', f: 880, f2: 1760, dur: 0.15, vol: 0.12 });
    this.noise({ dur: 0.15, vol: 0.35, type: 'highpass', f: 3000 });
  }
  s_dodge() {
    this.noise({ dur: 0.2, vol: 0.25, type: 'bandpass', f: 800, f2: 3000, q: 1.5 });
  }
  s_counter() {
    this.noise({ dur: 0.25, vol: 0.4, type: 'highpass', f: 1200, f2: 6000 });
    this.tone({ type: 'sawtooth', f: 220, f2: 880, dur: 0.18, vol: 0.08, filter: { f: 3000 } });
    this.tone({ type: 'sine', f: 110, f2: 40, dur: 0.4, vol: 0.4 });
  }
  s_slowmo() {
    this.tone({ type: 'sine', f: 660, f2: 330, dur: 0.6, vol: 0.08 });
  }
  s_ember() {
    [0, 7].forEach((n, k) => this.tone({ type: 'triangle', f: 1318 * 2 ** (n / 12), t: k * 0.06, dur: 0.3, vol: 0.08 }));
  }
  s_brace() {
    this.tone({ type: 'sawtooth', f: 70, f2: 110, dur: 0.6, vol: 0.12, filter: { f: 500 } });
  }
  s_aimEnemy() {
    this.tone({ type: 'sine', f: 400, f2: 1200, dur: 0.35, vol: 0.06 });
  }
  s_charge() {
    this.tone({ type: 'sawtooth', f: 110, f2: 440, dur: 0.9, vol: 0.08, filter: { f: 1500 }, curve: 'lin', attack: 0.6 });
    this.noise({ dur: 0.9, vol: 0.1, type: 'bandpass', f: 400, f2: 2400, q: 2 });
  }
  s_bossPhase() {
    this.gong(0, 0.45);
    this.tone({ type: 'sawtooth', f: 55, f2: 110, dur: 1.2, vol: 0.15, filter: { f: 600 } });
  }
  s_turn() {
    this.tone({ type: 'triangle', f: 784, dur: 0.12, vol: 0.06 });
    this.tone({ type: 'triangle', f: 1046, t: 0.08, dur: 0.15, vol: 0.06 });
  }
  s_enemyTurn() {
    this.tone({ type: 'sine', f: 196, f2: 147, dur: 0.4, vol: 0.12 });
    this.taiko(0, 0.3);
  }
  s_win() {
    const m = [0, 2, 4, 7, 9, 12, 16, 19];
    m.forEach((n, k) => this.tone({ type: 'triangle', f: 392 * 2 ** (n / 12), t: k * 0.09, dur: 0.7, vol: 0.12 }));
    this.gong(0.6, 0.35);
  }
  s_lose() {
    [0, -3, -5, -8, -12].forEach((n, k) => this.tone({ type: 'triangle', f: 330 * 2 ** (n / 12), t: k * 0.18, dur: 0.6, vol: 0.12 }));
  }
  s_buy() {
    [0, 4, 7].forEach((n, k) => this.tone({ type: 'triangle', f: 784 * 2 ** (n / 12), t: k * 0.05, dur: 0.3, vol: 0.1 }));
  }

  taiko(t, vol, bus) {
    this.tone({ type: 'sine', f: 120, f2: 48, t, dur: 0.35, vol, bus });
    this.noise({ t, dur: 0.05, vol: vol * 0.4, type: 'lowpass', f: 1200, bus });
  }

  // ───── 배경음악: 절차적 오음계 루프 ─────
  startBgm() {
    if (!this.ctx || this.bgmOn) return;
    this.bgmOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 30);
  }

  stopBgm() {
    this.bgmOn = false;
    clearInterval(this.timer);
  }

  setIntensity(v) {
    this.intensity = v;
  }

  schedule() {
    if (!this.ctx) return;
    const spb = 60 / 92 / 4; // 16분음표 길이
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime - this.ctx.currentTime);
      this.nextTime += spb;
      this.step++;
    }
  }

  playStep(i, t) {
    const bus = this.bgmBus;
    const s = i % 16;
    const bar = Math.floor(i / 16) % 8;
    // D 단조 오음계: D F G A C
    const scale = [0, 3, 5, 7, 10];
    const root = [62, 58, 60, 57, 62, 58, 65, 57][bar]; // 마디별 근음
    const midi = (n) => 440 * 2 ** ((n - 69) / 12);
    const pad = this.vol.bgm > 0;
    if (!pad) return;
    // 북(taiko)
    if (s === 0 || s === 10) this.taiko(t, 0.32, bus);
    if (this.intensity > 0 && (s === 6 || s === 14)) this.taiko(t, 0.18, bus);
    if (s % 4 === 2) this.noise({ t, dur: 0.04, vol: 0.03 + this.intensity * 0.03, type: 'highpass', f: 6000, bus });
    // 베이스
    if (s === 0 || s === 8) this.tone({ type: 'triangle', f: midi(root - 24), t, dur: 0.6, vol: 0.14, bus });
    // 패드(화음)
    if (s === 0) {
      [0, 7, 15].forEach((n) => this.tone({ type: 'sawtooth', f: midi(root - 12 + n), t, dur: 2.4, vol: 0.022, attack: 0.5, curve: 'lin', bus, filter: { f: 900 } }));
    }
    // 가야금풍 뜯기 멜로디 (결정적 패턴)
    const pattern = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
    if (pattern[s]) {
      const h = (i * 7 + bar * 3 + (i >> 4) * 5) % 11;
      const deg = scale[h % 5] + (h > 6 ? 12 : 0);
      const f = midi(root + deg);
      const g = this.tone({ type: 'triangle', f, t, dur: 0.5, vol: 0.075, bus });
      this.tone({ type: 'sine', f: f * 2, t, dur: 0.25, vol: 0.025, bus });
      if (g) g.connect(this.delay);
    }
  }
}
