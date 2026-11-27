// 전투 규칙 엔진 — 화면/소리와 무관한 순수 로직.
// 모든 행동 함수는 "이벤트 목록"을 반환하고, 연출 코드는 그 목록을 재생만 한다.
// 상태(st)는 순수 데이터(JSON 호환)이므로 structuredClone으로 복제해 미리보기를 계산한다.

import { rand, randInt, pickDistinct } from './rng.js';
import {
  LANES, FRONT, GUARD_CAP, EMBER_CAP, REROLLS_PER_TURN,
  ENEMIES, shotStats, EVOLVE_AT, FUSIONS, COIN, ELITE, AFFINITY, WEAK_BONUS, RESIST_CUT, SNIPES_PER_TURN, STAMINA } from './data.js';
import { evaluateReels, evaluateLines } from './slot.js';
import { WINDUP } from './timing.js';

const clone = (o) => structuredClone(o);
export const has = (st, id) => st.relics.includes(id);
// 유물 단계(없으면 0, 기본 1, 강화 2)
export const lv = (st, id) => (st.relics.includes(id) ? st.relicLv[id] || 1 : 0);
export const guardCap = (st) => GUARD_CAP + 2 * lv(st, 'oilFlask');
const NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const around = (st, e) => NEIGHBORS.map(([dl, dr]) => enemyAt(st, e.lane + dl, e.row + dr)).filter(Boolean);
let shotPower = 1; // 방패를 깎는 힘(연결·빙고·잭팟 기술은 2)
function addCoins(st, n, why, events, id = null) {
  if (n <= 0) return;
  st.coins += n;
  st.coinBy[why] = (st.coinBy[why] || 0) + n;
  events.push({ type: 'coin', n, why, id });
}

function relicEvent(st, events, relic, extra = {}) {
  events.push({ type: 'relic', relic, ...extra });
  // 진화: II 유물이 충분히 발동하면 III로
  if ((st.relicLv[relic] || 1) === 2 && !FUSIONS[relic]) {
    st.relicProc[relic] = (st.relicProc[relic] || 0) + 1;
    if (st.relicProc[relic] >= EVOLVE_AT) {
      st.relicLv[relic] = 3;
      events.push({ type: 'evolve', relic });
    }
  }
}

function addGuard(st, n, events, relic) {
  const p = st.player;
  const before = p.guard;
  p.guard = Math.min(guardCap(st), p.guard + n);
  if (p.guard > before) {
    if (relic) relicEvent(st, events, relic);
    events.push({ type: 'ward', amount: p.guard - before, guard: p.guard, relic: relic || null });
  }
}

function applyFreeze(st, e, turns, events) {
  const sp = ENEMIES[e.type];
  const f = sp.boss ? 1 : turns + lv(st, 'iceMirror');
  e.frozen = Math.max(e.frozen, f);
  events.push({ type: 'freeze', id: e.id, turns: e.frozen });
  if (e.charge || e.braced) {
    if (e.type === 'elder' && e.charge) e.step = Math.max(0, e.step - 1);
    e.charge = false;
    e.braced = false;
    e.vulnerable = false;
    events.push({ type: 'interrupt', id: e.id });
  }
}

// ───────────────────────── 생성 ─────────────────────────

export function createBattle(def, opt) {
  const st = {
    rng: (opt.seed >>> 0) || 1,
    def: {
      id: def.id, name: def.name, night: def.night || '', objective: { ...def.objective },
      mods: (def.mods || []).slice(), clearCoins: def.clearCoins || 0, coinMult: def.coinMult || 1, risky: !!def.risky,
      hpScale: def.hpScale || 1, // 밤이 깊어질수록 적이 단단해진다
      tier: def.tier || 0, atkUp: def.atkUp || 0, bossScale: def.bossScale || 1, // 단계가 오르면 더 강해진다
    },
    coins: 0, // 이번 전투에서 번 코인(전투가 끝나면 런에 합산)
    coinBy: {},
    laneKills: [0, 0, 0],
    loseReason: null,
    turn: 0,
    phase: 'spin', // spin | aim | enemy | over
    relics: (opt.relics || []).slice(),
    relicLv: { ...(opt.relicLv || {}) },
    relicProc: { ...(opt.relicProc || {}) },
    score: 0,
    turnKills: 0,
    bingoLevel: 0,
    player: {
      hp: opt.hp, maxHp: opt.maxHp,
      guard: Math.min(GUARD_CAP, opt.guard || 0),
      stamina: STAMINA.max,
      embers: Math.min(EMBER_CAP, (opt.embers || 0) + ((opt.relics || []).includes('emberWick') ? (opt.relicLv || {}).emberWick || 1 : 0)),
    },
    strips: opt.strips.map((s) => s.slice()),
    symLv: { ...(opt.symLv || {}) }, // 수련 단계
    reels: [],
    shots: [],
    shotsFired: 0,
    rerollMax: opt.rerolls ?? REROLLS_PER_TURN, // 턴마다 다시 돌릴 수 있는 횟수(입문 첫 밤은 0)
    snipeMax: opt.snipes ?? SNIPES_PER_TURN,
    rerollsLeft: 0,
    rerollCount: 0,
    turnGild: 0,
    omens: [],
    enemies: [],
    noAffinity: opt.affinity === false, // 상성 없이 기본 수치만 본다(테스트, 입문 첫 밤)
    noBingo: opt.bingo === false,
    nextId: 1,
    waves: def.waves.map((w) => ({ at: w.at, units: w.units.map((u) => u.slice()), done: false })),
    pullWaves: def.pullWaves !== false,
    queue: [],
    pending: null,
    pendingCounter: null,
    kills: 0,
    totalEnemies: def.waves.reduce((a, w) => a + w.units.length, 0),
    result: null,
    stats: {
      perfect: 0, good: 0, fail: 0, dodges: 0, counters: 0,
      jackpots: 0, pairs: 0, shatters: 0, rerolls: 0,
      dmgDealt: 0, dmgTaken: 0, turns: 0,
    },
  };
  const events = [];
  startTurn(st, events);
  return { st, events };
}

// ───────────────────────── 조회 도우미 ─────────────────────────

export const alive = (st) => st.enemies.filter((e) => e.alive);
export const byId = (st, id) => st.enemies.find((e) => e.id === id);
export const enemyAt = (st, lane, row) => st.enemies.find((e) => e.alive && e.lane === lane && e.row === row);

export function laneTargets(st, lane) {
  return st.enemies.filter((e) => e.alive && e.lane === lane).sort((a, b) => b.row - a.row);
}

// 저격 중이면 고른 적부터 뒤쪽만 대상이 된다
let aimFrom = 0;
function shotTargets(st, lane) {
  return laneTargets(st, lane).slice(aimFrom);
}

// 이 공격으로 맨 앞이 아닌 적을 골라 맞힐 수 있는가(레인 전체·전체 공격·방어막은 고를 필요가 없다)
export function canSnipe(st, shotIndex) {
  const shot = st.shots[shotIndex];
  if (!shot || shot.used || (st.snipes || 0) <= 0) return false;
  if (shot.symbol === 'lantern' || shot.tier >= 3) return false;
  if (shot.tier === 2 && shot.symbol !== 'wave' && shot.symbol !== 'spark') return false;
  return true;
}

function freeSteps(st, e, want) {
  let n = 0;
  for (let r = e.row + 1; r <= FRONT && n < want; r++) {
    if (enemyAt(st, e.lane, r)) break;
    n++;
  }
  return n;
}

// ───────────────────────── 턴 시작 / 웨이브 ─────────────────────────

function findSpawnCell(st, lane, row) {
  const order = [];
  for (let r = row; r >= 0; r--) order.push([lane, r]);
  for (let r = row + 1; r <= 2; r++) order.push([lane, r]);
  for (const l of [(lane + 1) % LANES, (lane + 2) % LANES]) for (let r = 0; r <= 2; r++) order.push([l, r]);
  for (const [l, r] of order) if (!enemyAt(st, l, r)) return { lane: l, row: r };
  return null;
}

function spawnEnemy(st, type, lane, row, events, src = 'wave', elite = false) {
  const cell = findSpawnCell(st, lane, row);
  if (!cell) return null;
  const sp = ENEMIES[type];
  const e = {
    id: st.nextId++, type, lane: cell.lane, row: cell.row,
    hp: sp.hp, maxHp: sp.hp, alive: true, atkUp: (st.def.mods.includes('rage') ? 1 : 0) + (st.def.atkUp || 0),
    frozen: 0, exposed: false, braced: false, charge: false,
    fury: 0, step: 0, vulnerable: false, shieldBroken: false, phase2: false,
    shieldHp: sp.shieldHp || 0, poison: 0, dir: 1,
  };
  const hpMul = (sp.boss ? st.def.bossScale || 1 : st.def.hpScale) * (st.def.mods.includes('fullMoon') ? 1.25 : 1) * (elite ? ELITE.hp : 1);
  if (elite) {
    e.elite = true;
    e.atkUp += ELITE.atk;
  }
  if (hpMul !== 1) e.hp = e.maxHp = Math.ceil(sp.hp * hpMul);
  e.dir = cell.lane === 0 ? 1 : cell.lane === LANES - 1 ? -1 : e.id % 2 ? 1 : -1;
  st.enemies.push(e);
  if (src !== 'wave') st.totalEnemies++;
  events.push({ type: 'spawn', id: e.id, enemy: clone(e), src });
  return e;
}

function spawnWave(st, w, events) {
  const left = [];
  for (const [type, lane, row, tag] of w.units) {
    if (!spawnEnemy(st, type, lane, row, events, 'wave', tag === 'elite')) left.push([type, lane, row, tag]);
  }
  w.units = left;
  w.done = left.length === 0;
}

export function upcomingSpawns(st) {
  const next = st.turn + 1;
  const out = [];
  for (const w of st.waves) if (!w.done && w.at <= next) for (const u of w.units) out.push(u);
  return out;
}

function startTurn(st, events) {
  st.turn++;
  st.stats.turns = st.turn;
  for (const w of st.waves) if (!w.done && w.at <= st.turn) spawnWave(st, w, events);
  if (st.pullWaves && alive(st).length === 0) {
    const nxt = st.waves.find((w) => !w.done);
    if (nxt) spawnWave(st, nxt, events);
  }
  if (st.def.mods.includes('gust') && st.turn > 1) {
    const movers = alive(st).filter((e) => !ENEMIES[e.type].boss && e.frozen === 0 && e.row < FRONT && !enemyAt(st, e.lane, e.row + 1));
    if (movers.length) {
      const e = movers[randInt(st, movers.length)];
      const from = e.row;
      e.row++;
      events.push({ type: 'move', id: e.id, lane: e.lane, from, to: e.row, gust: true });
    }
  }
  st.phase = 'spin';
  st.rerollsLeft = st.rerollMax > 0 ? st.rerollMax + lv(st, 'gamblerCoin') : 0;
  st.turnKills = 0;
  if (st.turn > 1) st.player.stamina = Math.min(STAMINA.max, (st.player.stamina ?? STAMINA.max) + STAMINA.regen);
  st.snipes = st.snipeMax;
  st.rerollCount = 0;
  st.turnGild = 0;
  st.shots = [];
  st.shotsFired = 0;
  st.omens = Array.from({ length: Math.max(3, st.rerollsLeft) }, () => rollOmen(st)); // 다시 돌리기 횟수만큼 대가를 미리 정한다
  if (has(st, 'torch')) addGuard(st, 1, events, 'torch');
  events.push({ type: 'turn', turn: st.turn });
  checkObjective(st, events);
}

// ───────────────────────── 흉조(재굴림의 대가) ─────────────────────────

function rollOmen(st) {
  const targets = alive(st).filter((e) => !ENEMIES[e.type].boss);
  const r = rand(st);
  if (targets.length && r < 0.45) return { kind: 'hasten', id: targets[randInt(st, targets.length)].id };
  if (targets.length && r < 0.72) return { kind: 'empower', id: targets[randInt(st, targets.length)].id };
  return { kind: 'summon', lane: randInt(st, LANES) };
}

export function describeOmen(st, omen) {
  if (!omen) return null;
  const e = omen.id ? byId(st, omen.id) : null;
  if (omen.kind === 'hasten' && e && e.alive) {
    const canMove = e.row < FRONT && !enemyAt(st, e.lane, e.row + 1);
    const short = canMove ? '1칸 전진' : '공격력 +1';
    return { text: `${ENEMIES[e.type].name} ${short}`, short, id: e.id };
  }
  if (omen.kind === 'empower' && e && e.alive) return { text: `${ENEMIES[e.type].name} 공격력 +2`, short: '공격력 +2', id: e.id };
  const lane = omen.lane ?? (e ? e.lane : 1);
  return { text: `${lane + 1}번 레인에 새 적 등장`, short: '새 적 등장', lane };
}

function applyOmen(st, omen, events) {
  events.push({ type: 'omen', omen: clone(omen), desc: describeOmen(st, omen) });
  const e = omen.id ? byId(st, omen.id) : null;
  if (omen.kind === 'hasten' && e && e.alive) {
    if (e.row < FRONT && !enemyAt(st, e.lane, e.row + 1)) {
      const from = e.row;
      e.row++;
      events.push({ type: 'move', id: e.id, lane: e.lane, from, to: e.row, omen: true });
    } else {
      e.fury += 1;
      events.push({ type: 'fury', id: e.id, amount: 1 });
    }
    return;
  }
  if (omen.kind === 'empower' && e && e.alive) {
    e.fury += 2;
    events.push({ type: 'fury', id: e.id, amount: 2 });
    return;
  }
  const lane = omen.lane ?? (e ? e.lane : 1);
  spawnEnemy(st, 'kasa', lane, 0, events, 'omen');
}

// ───────────────────────── 슬롯 ─────────────────────────

function rollReels(st, gildCount, events) {
  const idx = st.strips.map((s) => randInt(st, s.length));
  const gilded = pickDistinct(st, 3, Math.min(3, gildCount));
  st.reels = idx.map((i, k) => ({ symbol: st.strips[k][i], stop: i, gilded: gilded.includes(k) }));
  // 3×3 판: 각 릴의 위·가운데·아래 칸. 가운데 줄이 이번 턴의 공격, 나머지 줄의 빙고는 보너스 기술.
  st.grid = idx.map((i, k) => {
    const s = st.strips[k];
    const n = s.length;
    return [s[(i + 1) % n], s[i], s[(i - 1 + n) % n]];
  });
  st.shots = evaluateReels(st.reels);
  const top = Math.max(...st.shots.map((s) => s.tier));
  if (top === 3) st.stats.jackpots++;
  else if (top === 2) st.stats.pairs++;
  st.bingos = st.noBingo ? [] : evaluateLines(st.grid); // 입문 첫 밤에는 빙고 없이 가운데 줄만 본다
  // 1줄 = 빙고(연결급), 2줄 = 더블 빙고(잭팟급), 3줄 이상 = 트리플 빙고(금빛 잭팟)
  const level = st.bingos.length + (top === 3 ? 1 : 0);
  st.bingoLevel = level;
  for (const ln of st.bingos) {
    st.shots.push({ id: 'b' + ln.id, symbol: ln.symbol, tier: level >= 2 ? 3 : 2, reels: [], gild: level >= 3 ? 3 : 0, used: false, bonus: ln.id });
    st.stats.bingos = (st.stats.bingos || 0) + 1;
  }
  if (level >= 3) for (const s of st.shots) if (s.tier === 3) s.gild = 3;
  st.score += 150 * level * level;
  events.push({ type: 'spin', reels: clone(st.reels), shots: clone(st.shots), grid: clone(st.grid), bingos: clone(st.bingos), level, jackpot: top === 3 });
  if (level >= 1) addCoins(st, COIN.bingo * level, 'bingo', events);
  if (level >= 1 && has(st, 'bingoBell')) {
    st.player.embers = Math.min(EMBER_CAP, st.player.embers + 1);
    addGuard(st, 2 * lv(st, 'bingoBell'), events, 'bingoBell');
  }
}

export function spin(st) {
  if (st.phase !== 'spin' || st.result) throw new Error('spin: wrong phase ' + st.phase);
  const events = [];
  const g = Math.min(3, st.player.embers);
  st.player.embers -= g;
  st.turnGild = g;
  rollReels(st, g, events);
  st.phase = 'aim';
  return events;
}

export function canReroll(st) {
  return st.phase === 'aim' && !st.result && st.shotsFired === 0 && st.rerollsLeft > 0;
}

// 턴마다 첫 다시 돌리기는 대가가 없다. 두 번째부터는 대가(흉조)가 따르고, 그 대신 금빛 릴이 하나 늘어난다.
export const rerollFree = (st) => st.rerollCount === 0 || has(st, 'windfall');

export function reroll(st) {
  if (!canReroll(st)) throw new Error('reroll not allowed');
  const events = [];
  if (st.rerollCount === 0) events.push({ type: 'freeReroll' });
  else if (has(st, 'windfall')) relicEvent(st, events, 'windfall'); // 융합 [대박]: 대가 없음
  else applyOmen(st, st.omens[st.rerollCount], events);
  st.rerollCount++;
  st.rerollsLeft--;
  st.stats.rerolls++;
  if (has(st, 'gamblerCoin')) addGuard(st, lv(st, 'gamblerCoin'), events, 'gamblerCoin');
  rollReels(st, st.turnGild + Math.max(0, st.rerollCount - 1), events);
  return events;
}

// ───────────────────────── 피해 처리 ─────────────────────────

// o: { el, frontal, shatter, freeze, pierceShield, src }
function hit(st, e, dmg, o, events, depth = 0) {
  if (!e || !e.alive) return { skipped: true };
  const sp = ENEMIES[e.type];
  const tags = [];
  const shielded = sp.shield && e.shieldHp > 0 && !e.exposed && o.frontal && !o.pierceShield;
  let bonus = 0;
  let shards = false;
  if (e.frozen > 0 && o.shatter) {
    bonus += 3 + (has(st, 'glacier') ? 3 : 0);
    e.frozen = 0;
    shards = true;
    tags.push('shatter');
    st.stats.shatters++;
    if (sp.shield && !e.shieldBroken) {
      e.shieldBroken = true;
      e.shieldHp = 0;
      tags.push('shieldBreak');
    }
  } else if (shielded) {
    // 탈 방패: 피해는 막지만 맞을 때마다 금이 가고, 다 깎이면 깨진다
    e.shieldHp = Math.max(0, e.shieldHp - shotPower);
    if (e.shieldHp === 0) e.shieldBroken = true;
    events.push({ type: 'block', id: e.id, el: o.el, lane: e.lane, row: e.row, left: e.shieldHp, broke: e.shieldHp === 0 });
    return { blocked: true };
  }
  // 유물 [얼음 거울]: 얼어 있던 적은 더 아프다
  if ((e.frozen > 0 || shards) && has(st, 'iceMirror')) {
    bonus += lv(st, 'iceMirror');
    relicEvent(st, events, 'iceMirror', { quiet: true });
  }
  // 반응 [감전 폭발]: 중독된 적에게 전격 → 중독 수치만큼 추가 피해, 주변까지 터진다
  let detonate = 0;
  if (o.el === 'spark' && e.poison > 0) {
    detonate = e.poison;
    bonus += detonate + 2 * lv(st, 'stormRune');
    e.poison = 0;
    tags.push('detonate');
  }
  // 반응 [감전]: 젖은 적에게 전격 → 피해 +2
  if (o.el === 'spark' && e.wet > 0) {
    bonus += 2;
    e.wet = 0;
    tags.push('surge');
  }
  // 반응 [초전도]: 얼어붙은 적에게 전격
  if (o.el === 'spark' && e.frozen > 0) {
    bonus += 1;
    tags.push('conduct');
  }
  // 상성: 약점이면 더 아프고, 저항하면 덜 아프다
  const aff = AFFINITY[e.type];
  const el = o.el === 'ice' ? 'frost' : o.el;
  if (aff && dmg > 0 && !st.noAffinity) {
    if (aff.weak === el) {
      bonus += o.src ? Math.ceil(WEAK_BONUS / 2) : WEAK_BONUS;
      tags.push('bane');
    } else if (aff.resist === el && !o.src) {
      // 저항은 직격에만 적용(번지는 피해는 그대로)
      bonus -= RESIST_CUT;
      tags.push('resist');
    }
  }
  let total = dmg + bonus;
  if (e.exposed) {
    total *= 2;
    e.exposed = false;
    tags.push('exposed');
  }
  if (e.vulnerable) {
    total += 2;
    tags.push('weak');
  }
  total = Math.max(0, total);
  e.hp -= total;
  st.stats.dmgDealt += total;
  st.score += total * 10;
  events.push({ type: 'hit', id: e.id, dmg: total, el: o.el, tags, hp: Math.max(0, e.hp), lane: e.lane, row: e.row, src: o.src || null });

  if (e.hp <= 0) {
    e.hp = 0;
    e.alive = false;
    st.kills++;
    events.push({ type: 'kill', id: e.id, etype: e.type, lane: e.lane, row: e.row });
    // 연속 처치: 한 턴에 3번째 처치는 다음 턴 금빛 릴을 준다
    st.turnKills++;
    st.score += 50 * st.turnKills;
    st.laneKills[e.lane]++;
    addCoins(st, sp.boss ? COIN.boss : COIN.kill, 'kill', events, e.id);
    if (e.elite) addCoins(st, COIN.elite, 'elite', events, e.id);
    if (st.turnKills >= COIN.comboFrom) addCoins(st, st.turnKills >= COIN.comboFrom + 2 ? 2 : 1, 'combo', events, e.id); // 3·4연속 +1, 5연속부터 +2
    if (st.turnKills >= 2) {
      const ember = st.turnKills === 3;
      if (ember) st.player.embers = Math.min(EMBER_CAP, st.player.embers + 1);
      events.push({ type: 'combo', n: st.turnKills, ember });
      if (has(st, 'comboFlute')) {
        const p = st.player;
        const h0 = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + lv(st, 'comboFlute'));
        if (p.hp > h0) {
          relicEvent(st, events, 'comboFlute');
          events.push({ type: 'heal', amount: p.hp - h0, hp: p.hp });
        }
      }
    }
    // 유물 [독니]: 중독된 적이 죽으면 주변으로 전염
    if (e.poison > 0 && has(st, 'venomFang')) {
      const ns = around(st, e);
      if (ns.length) relicEvent(st, events, 'venomFang', { id: ns[0].id });
      for (const n of ns) {
        n.poison = Math.min(9, n.poison + 2 * lv(st, 'venomFang'));
        events.push({ type: 'poison', id: n.id, stacks: n.poison });
      }
    }
    // 유물 [천둥 북]: 처치 → 가장 가까운 적에게 번개 (연쇄 깊이 제한)
    if (has(st, 'thunderDrum') && depth < 3) {
      // 융합 [뇌우]가 있으면 가까운 적 2명에게
      const nears = alive(st)
        .map((n) => ({ n, d: Math.abs(n.lane - e.lane) + Math.abs(n.row - e.row) }))
        .sort((a, b) => a.d - b.d || b.n.row - a.n.row || a.n.lane - b.n.lane)
        .slice(0, has(st, 'tempest') ? 2 : 1);
      for (const near of nears) {
        if (!near.n.alive) continue;
        relicEvent(st, events, 'thunderDrum', { from: { lane: e.lane, row: e.row }, to: { lane: near.n.lane, row: near.n.row }, id: near.n.id });
        hit(st, near.n, 2 * lv(st, 'thunderDrum'), { el: 'spark', frontal: false, src: 'relic' }, events, depth + 1);
      }
    }
    // 폭죽 도깨비: 쓰러지면 터져서 옆의 적을 다치게 한다(연쇄 가능)
    if (sp.explode && depth < 5) {
      const ns = around(st, e);
      const cells = NEIGHBORS.map(([dl, dr]) => [e.lane + dl, e.row + dr]).filter(([l, r]) => l >= 0 && l < LANES && r >= 0 && r <= FRONT);
      events.push({ type: 'boom', lane: e.lane, row: e.row, cells });
      for (const n of ns) hit(st, n, sp.explode, { el: 'counter', frontal: false, src: 'boom' }, events, depth + 1);
    }
  } else {
    if (sp.boss && !e.phase2 && e.hp <= e.maxHp / 2) {
      e.phase2 = true;
      e.step = 0;
      events.push({ type: 'bossPhase', id: e.id });
    }
    // 반응 [꽁꽁]: 젖은 적을 얼리면 한 턴 더 언다
    if (o.freeze && e.wet > 0) {
      e.wet = 0;
      events.push({ type: 'reaction', name: 'deepFreeze', lane: e.lane, row: e.row, cells: [], id: e.id });
      applyFreeze(st, e, o.freeze + 1, events);
    } else if (o.freeze) applyFreeze(st, e, o.freeze, events);
    // 파동에 맞으면 젖는다(다음 내 턴까지)
    if (o.el === 'wave' && e.frozen === 0) {
      e.wet = 2;
      events.push({ type: 'wet', id: e.id });
    }
    // 반응 [독 깊어짐]: 중독된 적을 절단으로 베면 중독 +2
    if (o.el === 'blade' && !o.src && e.poison > 0) {
      e.poison = Math.min(9, e.poison + 2);
      events.push({ type: 'reaction', name: 'fester', lane: e.lane, row: e.row, cells: [], id: e.id });
      events.push({ type: 'poison', id: e.id, stacks: e.poison });
    }
    if (o.poison) {
      e.poison = Math.min(9, e.poison + o.poison + 2 * lv(st, 'venomFang'));
      events.push({ type: 'poison', id: e.id, stacks: e.poison });
    }
  }

  if (detonate && depth < 3) {
    const ns = around(st, e);
    events.push({ type: 'reaction', name: 'detonate', lane: e.lane, row: e.row, cells: ns.map((n) => [n.lane, n.row]) });
    for (const n of ns) hit(st, n, detonate, { el: 'venom', frontal: false, src: 'reaction' }, events, depth + 1);
  }
  if (shards && depth < 3) {
    const cells = [[e.lane - 1, e.row], [e.lane + 1, e.row], [e.lane, e.row - 1], [e.lane, e.row + 1]];
    events.push({ type: 'shards', lane: e.lane, row: e.row, cells: cells.filter(([l, r]) => l >= 0 && l < LANES && r >= 0 && r <= FRONT) });
    for (const [l, r] of cells) {
      const n = enemyAt(st, l, r);
      if (n) hit(st, n, 1, { el: 'ice', frontal: false, shatter: false, src: 'shard' }, events, depth + 1);
      // 유물 [서리 방울]: 파편에 맞은 적도 얼어붙는다
      if (n && n.alive && has(st, 'frostbite')) {
        relicEvent(st, events, 'frostbite', { id: n.id });
        applyFreeze(st, n, lv(st, 'frostbite'), events);
      }
    }
  }
  return { total, killed: !e.alive };
}

// ───────────────────────── 공격 기술 ─────────────────────────

function resolveShot(st, shot, lane, events) {
  const S = shotStats(shot.symbol, shot.tier, shot.gild, (st.symLv && st.symLv[shot.symbol]) || 0);
  if (shot.gild > 0 && has(st, 'emberWick')) for (const k of ['dmg', 'sideDmg']) if (S[k] != null) S[k] += lv(st, 'emberWick');
  if (shot.symbol === 'blade' && has(st, 'whetstone') && S.pierce < 99) S.pierce += lv(st, 'whetstone');
  if (shot.symbol === 'wave' && has(st, 'tideBell') && S.splash != null) S.splash += lv(st, 'tideBell');
  if (shot.symbol === 'spark' && S.jumps != null) S.jumps += lv(st, 'stormRune');
  if (shot.gild > 0 && has(st, 'emberWick')) relicEvent(st, events, 'emberWick', { quiet: true });
  if (shot.symbol === 'spark' && has(st, 'stormRune')) relicEvent(st, events, 'stormRune', { quiet: true });
  const base = { type: 'fire', symbol: shot.symbol, tier: shot.tier, gild: shot.gild, lane, shotId: shot.id };
  const sym = shot.symbol;

  if (sym === 'lantern') {
    events.push({ ...base });
    const p = st.player;
    const before = p.guard;
    p.guard = Math.min(guardCap(st), p.guard + S.guard);
    events.push({ type: 'ward', amount: p.guard - before, guard: p.guard });
    const s0 = p.stamina ?? STAMINA.max;
    p.stamina = Math.min(STAMINA.max, shot.tier >= 3 ? STAMINA.max : s0 + shot.tier);
    if (p.stamina > s0) events.push({ type: 'stamina', amount: p.stamina - s0, stamina: p.stamina });
    const healAmt = S.heal + lv(st, 'oilFlask');
    if (healAmt) {
      if (has(st, 'oilFlask')) relicEvent(st, events, 'oilFlask');
      const h0 = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + healAmt);
      events.push({ type: 'heal', amount: p.hp - h0, hp: p.hp });
    }
    if (S.exposeAll) {
      for (const e of alive(st)) {
        e.exposed = true;
        events.push({ type: 'expose', id: e.id });
      }
    }
    return;
  }

  if (shot.tier === 3 && sym !== 'blade') {
    events.push({ ...base, global: true });
    const all = alive(st).sort((a, b) => b.row - a.row || a.lane - b.lane);
    for (const e of all) {
      if (sym === 'wave') hit(st, e, S.dmg, { el: 'wave', frontal: false, shatter: true }, events);
      if (sym === 'frost') hit(st, e, S.dmg, { el: 'frost', frontal: false, freeze: S.freeze }, events);
      if (sym === 'spark') hit(st, e, S.dmg, { el: 'spark', frontal: false }, events);
      if (sym === 'venom') hit(st, e, S.dmg, { el: 'venom', frontal: false, poison: S.poison }, events);
      if (sym === 'bomb') hit(st, e, S.dmg, { el: 'bomb', frontal: false, shatter: true }, events);
    }
    if (sym === 'wave') {
      for (const e of alive(st).sort((a, b) => a.row - b.row)) {
        if (e.row > 0 && !enemyAt(st, e.lane, e.row - 1) && !ENEMIES[e.type].boss) {
          const from = e.row;
          e.row--;
          events.push({ type: 'push', id: e.id, lane: e.lane, from, to: e.row });
        }
      }
    }
    events.push({ type: 'fireEnd', lane, global: true });
    return;
  }

  if (sym === 'blade') {
    const lanes = shot.tier === 3 ? [lane, lane - 1, lane + 1].filter((l) => l >= 0 && l < LANES) : [lane];
    for (const l of lanes) {
      const side = l !== lane;
      events.push({ ...base, lane: l, side });
      let n = 0;
      let endRow = -1; // -1 = 레인 끝까지 날아감
      for (const t of shotTargets(st, l)) {
        if (n >= S.pierce) break;
        const r = hit(st, t, side ? S.sideDmg : S.dmg, {
          el: 'blade', frontal: true, shatter: true, pierceShield: shot.tier === 3,
        }, events);
        n++;
        if (r.killed && has(st, 'whetstone')) addGuard(st, lv(st, 'whetstone'), events, 'whetstone');
        // 융합 [칼바람]: 양옆 레인 같은 줄의 적에게도 1
        if (!r.blocked && has(st, 'gale')) {
          for (const dl of [-1, 1]) {
            const n = enemyAt(st, l + dl, t.row);
            if (n) hit(st, n, 1, { el: 'blade', frontal: false, src: 'splash' }, events);
          }
        }
        if (r.blocked) { endRow = t.row; break; }
        endRow = n >= S.pierce ? t.row : -1;
      }
      events.push({ type: 'fireEnd', lane: l, row: endRow });
    }
    return;
  }

  if (sym === 'wave') {
    events.push({ ...base });
    const first = shotTargets(st, lane)[0];
    const row = first ? first.row : 0;
    // 맨 앞 적과 같은 줄의 양옆 레인까지 쓸어 낸다(뒤쪽으로는 번지지 않는다)
    const cells = [[-1, 0], [1, 0]];
    const splash = cells.map(([dl, dr]) => [lane + dl, row + dr]).filter(([l, r]) => l >= 0 && l < LANES && r >= 0 && r <= FRONT);
    events.push({ type: 'burst', lane, row, cells: splash, tier: shot.tier, sweep: true });
    // 중심과 주변 대상을 먼저 확정한다(중간에 처치·이동되어도 대상이 바뀌지 않도록)
    const splashTargets = splash.map(([l, r]) => enemyAt(st, l, r)).filter(Boolean);
    const spread = first ? Math.ceil(first.poison / 2) : 0;
    if (first) {
      const r = hit(st, first, S.dmg, { el: 'wave', frontal: true, shatter: true }, events);
      // 직격당한 적은 한 칸 밀려난다. 유물 [파도 종]이 있으면 한 칸 더.
      if (!r.blocked && first.alive && !ENEMIES[first.type].boss) {
        const from = first.row;
        let steps = (S.push || 1) + (has(st, 'tideBell') ? 1 : 0);
        while (steps > 0 && first.row > 0 && !enemyAt(st, first.lane, first.row - 1)) {
          first.row--;
          steps--;
        }
        if (first.row !== from) {
          if (has(st, 'tideBell') && from - first.row > (S.push || 1)) relicEvent(st, events, 'tideBell', { id: first.id });
          events.push({ type: 'push', id: first.id, lane: first.lane, from, to: first.row });
        }
      }
    }
    for (const t of splashTargets) hit(st, t, S.splash, { el: 'wave', frontal: false, shatter: false, src: 'splash' }, events);
    // 휩쓸린 옆 레인의 적도 함께 밀려난다
    for (const t of splashTargets) {
      if (!t.alive || ENEMIES[t.type].boss) continue;
      const from = t.row;
      let steps = S.push || 1;
      while (steps > 0 && t.row > 0 && !enemyAt(st, t.lane, t.row - 1)) {
        t.row--;
        steps--;
      }
      if (t.row !== from) events.push({ type: 'push', id: t.id, lane: t.lane, from, to: t.row });
    }
    // 반응 [독 확산]: 중독된 적에게 파동 직격 → 휩쓸린 적에게 중독이 번진다
    const wet = splashTargets.filter((t) => t.alive);
    if (spread > 0 && wet.length) {
      events.push({ type: 'reaction', name: 'spread', lane, row, cells: wet.map((t) => [t.lane, t.row]) });
      for (const t of wet) {
        t.poison = Math.min(9, t.poison + spread);
        events.push({ type: 'poison', id: t.id, stacks: t.poison });
      }
    }
    events.push({ type: 'fireEnd', lane, row });
    return;
  }

  if (sym === 'bomb') {
    // 폭탄: 포물선으로 날아가 레인의 맨 뒤 적에게 떨어진다(저격하면 고른 적). 위에서 떨어지므로 방패가 막지 못한다.
    events.push({ ...base, lob: true });
    const list = shotTargets(st, lane);
    const first = aimFrom > 0 ? list[0] : list[list.length - 1];
    const row = first ? first.row : 0;
    const cells = S.area === 'square'
      ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
      : [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const splash = cells.map(([dl, dr]) => [lane + dl, row + dr]).filter(([l, r]) => l >= 0 && l < LANES && r >= 0 && r <= FRONT);
    events.push({ type: 'burst', lane, row, cells: splash, tier: shot.tier, bomb: true });
    const splashTargets = splash.map(([l, r]) => enemyAt(st, l, r)).filter(Boolean);
    const keg = lv(st, 'powderKeg');
    if (first) {
      const r = hit(st, first, S.dmg, { el: 'bomb', frontal: false, shatter: true }, events);
      if (r.killed && keg) {
        const p = st.player;
        const s0 = p.stamina ?? STAMINA.max;
        p.stamina = Math.min(STAMINA.max, s0 + keg);
        relicEvent(st, events, 'powderKeg');
        if (p.stamina > s0) events.push({ type: 'stamina', amount: p.stamina - s0, stamina: p.stamina });
      }
    }
    for (const t of splashTargets) hit(st, t, S.splash + keg, { el: 'bomb', frontal: false, src: 'splash' }, events);
    events.push({ type: 'fireEnd', lane, row });
    return;
  }

  if (sym === 'frost' || sym === 'venom') {
    events.push({ ...base });
    let endRow = -1;
    const targets = shotTargets(st, lane);
    const list = S.wholeLane ? targets : targets.slice(0, 1);
    for (const t of list) {
      const r = hit(st, t, S.dmg, { el: sym, frontal: true, freeze: S.freeze, poison: S.poison }, events);
      endRow = t.row;
      if (r.blocked) break;
    }
    events.push({ type: 'fireEnd', lane, row: endRow });
    return;
  }

  if (sym === 'spark') {
    events.push({ ...base });
    const first = shotTargets(st, lane)[0];
    if (!first) {
      events.push({ type: 'fireEnd', lane, row: -1 });
      return;
    }
    const hitSet = new Set([first.id]);
    let jumps = S.jumps + (first.frozen > 0 ? 1 : 0);
    let extra = first.frozen > 0 ? 1 : 0;
    hit(st, first, S.dmg, { el: 'spark', frontal: true }, events);
    let cur = { lane: first.lane, row: first.row };
    for (let j = 0; j < jumps; j++) {
      const cands = alive(st)
        .filter((e) => !hitSet.has(e.id))
        .map((e) => ({ e, d: Math.abs(e.lane - cur.lane) + Math.abs(e.row - cur.row) }))
        .filter((c) => c.d <= S.range)
        .sort((a, b) => a.d - b.d || b.e.row - a.e.row || a.e.lane - b.e.lane);
      if (!cands.length) break;
      const nx = cands[0].e;
      hitSet.add(nx.id);
      events.push({ type: 'chain', from: { ...cur }, to: { lane: nx.lane, row: nx.row }, id: nx.id });
      cur = { lane: nx.lane, row: nx.row };
      if (nx.frozen > 0 && extra < 2) {
        jumps++;
        extra++;
      }
      hit(st, nx, S.jumpDmg, { el: 'spark', frontal: false, src: 'chain' }, events);
    }
    events.push({ type: 'fireEnd', lane, row: first.row });
  }
}

export function fireShot(st, shotIndex, lane, depth = 0) {
  if (st.phase !== 'aim' || st.result) throw new Error('fireShot: wrong phase');
  const shot = st.shots[shotIndex];
  if (!shot || shot.used) throw new Error('fireShot: invalid shot');
  if (!(lane >= 0 && lane < LANES)) throw new Error('fireShot: invalid lane');
  shot.used = true;
  st.shotsFired++;
  const events = [];
  shotPower = shot.tier >= 2 ? 2 : 1;
  shot.used = false;
  const from = depth > 0 && canSnipe(st, shotIndex) ? Math.min(depth, laneTargets(st, lane).length - 1) : 0;
  shot.used = true;
  if (from > 0) {
    st.snipes--;
    events.push({ type: 'snipe', lane, depth: from, id: laneTargets(st, lane)[from].id });
  }
  aimFrom = Math.max(0, from);
  try {
    resolveShot(st, shot, lane, events);
  } finally {
    aimFrom = 0;
    shotPower = 1;
  }
  checkObjective(st, events);
  return events;
}

export function shotsLeft(st) {
  return st.shots.filter((s) => !s.used).length;
}

// 미리보기 = 복제본에서 실제 규칙 실행 → 실제 결과와 항상 일치
export function summarize(events) {
  const per = {};
  const get = (id) => (per[id] ||= { dmg: 0, killed: false, blocked: false, frozen: 0, tags: [], exposed: false });
  let guard = 0;
  let heal = 0;
  const cells = [];
  for (const ev of events) {
    if (ev.type === 'hit') {
      const p = get(ev.id);
      p.dmg += ev.dmg;
      for (const t of ev.tags) if (!p.tags.includes(t)) p.tags.push(t);
    }
    if (ev.type === 'kill') get(ev.id).killed = true;
    if (ev.type === 'block') {
      get(ev.id).blocked = true;
      get(ev.id).shieldLeft = ev.left;
    }
    if (ev.type === 'poison') get(ev.id).poison = ev.stacks;
    if (ev.type === 'freeze') get(ev.id).frozen = ev.turns;
    if (ev.type === 'expose') get(ev.id).exposed = true;
    if (ev.type === 'push') get(ev.id).pushed = ev.from - ev.to;
    if (ev.type === 'reaction' && ev.id != null && !get(ev.id).tags.includes(ev.name)) get(ev.id).tags.push(ev.name);
    if (ev.type === 'ward') guard += ev.amount;
    if (ev.type === 'heal') heal += ev.amount;
    if (ev.type === 'burst') cells.push(...ev.cells, [ev.lane, ev.row]);
    if (ev.type === 'shards') cells.push(...ev.cells);
    if (ev.type === 'boom') cells.push(...ev.cells);
  }
  return { per, guard, heal, cells };
}

export function previewShot(st, shotIndex, lane, depth = 0) {
  const c = clone(st);
  const events = fireShot(c, shotIndex, lane, depth);
  return { events, summary: summarize(events), result: c.result };
}

// ───────────────────────── 적 행동 결정(예고) ─────────────────────────

const ELDER_P1 = ['summon', 'shift', 'charge', 'volley'];
const ELDER_P2 = ['charge', 'volley', 'summon', 'shift'];

export function decide(st, e) {
  const sp = ENEMIES[e.type];
  if (e.frozen > 0) return { kind: 'frozen' };
  switch (e.type) {
    case 'kasa': {
      if (e.row >= sp.reach) return { kind: 'attack', style: 'melee', dmg: sp.atk + e.fury + (e.atkUp || 0) };
      const want = e.hp === e.maxHp ? 2 : 1;
      const steps = freeSteps(st, e, want);
      return steps > 0 ? { kind: 'move', steps, hop: want === 2 } : { kind: 'wait' };
    }
    case 'drum': {
      if (e.row >= sp.reach) return { kind: 'attack', style: 'melee', dmg: sp.atk + e.fury + (e.atkUp || 0) };
      let dir = e.dir || 1;
      if (e.lane + dir < 0 || e.lane + dir >= LANES) dir = -dir;
      if (!enemyAt(st, e.lane + dir, e.row + 1)) return { kind: 'move', steps: 1, toLane: e.lane + dir, dir };
      if (!enemyAt(st, e.lane, e.row + 1)) return { kind: 'move', steps: 1 };
      return { kind: 'wait' };
    }
    case 'mask': {
      if (e.row >= FRONT) return e.braced ? { kind: 'attack', style: 'heavy', dmg: sp.atk + e.fury + (e.atkUp || 0) } : { kind: 'brace' };
      if ((st.turn + e.id) % 2 === 0) {
        return freeSteps(st, e, 1) ? { kind: 'move', steps: 1 } : { kind: 'wait' };
      }
      return { kind: 'wait', slow: true };
    }
    case 'bomber': {
      if (e.row >= sp.reach) return { kind: 'attack', style: 'melee', dmg: sp.atk + e.fury + (e.atkUp || 0) };
      return freeSteps(st, e, 1) ? { kind: 'move', steps: 1 } : { kind: 'wait' };
    }
    case 'healer': {
      const others = st.enemies.filter((o) => o.alive && o.id !== e.id);
      if (!others.length) {
        // 혼자 남으면 직접 싸우러 온다
        if (e.row >= sp.reach) return { kind: 'attack', style: 'melee', dmg: sp.atk + e.fury + (e.atkUp || 0) };
        return freeSteps(st, e, 1) ? { kind: 'move', steps: 1 } : { kind: 'wait' };
      }
      const hurt = others.filter((o) => !ENEMIES[o.type].boss && o.hp < o.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id)[0];
      if (hurt) return { kind: 'mend', target: hurt.id, amount: sp.mend };
      if (e.row < sp.post && freeSteps(st, e, 1)) return { kind: 'move', steps: 1 };
      return { kind: 'wait', idle: true };
    }
    case 'boar': {
      if (e.row >= FRONT) return { kind: 'attack', style: 'heavy', dmg: sp.atk + e.fury + (e.atkUp || 0) };
      if (!e.charge) return { kind: 'rev' };
      // 앞에 다른 적이 있어도 뛰어넘어, 그 레인에서 가장 앞쪽의 빈칸까지 간다
      let to = -1;
      for (let r = FRONT; r > e.row; r--) {
        if (!enemyAt(st, e.lane, r)) { to = r; break; }
      }
      return to > e.row ? { kind: 'move', steps: to - e.row, dash: true } : { kind: 'wait' };
    }
    case 'archer': {
      if (e.row < sp.post && freeSteps(st, e, 1)) return { kind: 'move', steps: 1 };
      if (e.charge) return { kind: 'attack', style: 'ranged', dmg: sp.atk + e.fury + (e.atkUp || 0) };
      return { kind: 'aim' };
    }
    case 'elder': {
      const cyc = e.phase2 ? ELDER_P2 : ELDER_P1;
      const act = cyc[e.step % cyc.length];
      if (act === 'volley') {
        if (!e.charge) return { kind: 'charge' };
        return { kind: 'attack', style: 'volley', dmg: sp.atk + e.fury + (e.atkUp || 0), hits: e.phase2 ? 4 : 3 };
      }
      if (act === 'charge') return { kind: 'charge' };
      if (act === 'summon') return { kind: 'summon', count: e.phase2 ? 2 : 1 };
      // shift
      const opts = e.lane === 1 ? (st.turn % 2 ? [0, 2] : [2, 0]) : [1];
      for (const l of opts) if (!enemyAt(st, l, e.row)) return { kind: 'shift', toLane: l };
      return { kind: 'wait' };
    }
  }
  return { kind: 'wait' };
}

// 화면 표시용: 실제 행동 순서대로 위치 변화만 시뮬레이션해 예고를 만든다
export function computeIntents(st) {
  const c = { turn: st.turn, enemies: st.enemies.map((e) => ({ ...e })) };
  const order = c.enemies.filter((e) => e.alive).sort((a, b) => b.row - a.row || a.lane - b.lane);
  const out = {};
  for (const e of order) {
    const it = decide(c, e);
    out[e.id] = it;
    if (it.kind === 'move') {
      e.row += it.steps;
      if (it.toLane != null) e.lane = it.toLane;
    }
    if (it.kind === 'shift') e.lane = it.toLane;
  }
  return out;
}

// ───────────────────────── 적의 차례 ─────────────────────────

export function endPlayerTurn(st) {
  if (st.phase !== 'aim' || st.result) throw new Error('endPlayerTurn: wrong phase');
  const events = [];
  for (const e of st.enemies) e.exposed = false;
  st.phase = 'enemy';
  // 중독: 턴이 끝날 때 중독 수치만큼 피해(방패 무시), 그 뒤 1 줄어든다
  for (const e of alive(st).sort((a, b) => b.row - a.row || a.lane - b.lane)) {
    if (e.poison <= 0) continue;
    events.push({ type: 'poisonTick', id: e.id });
    hit(st, e, e.poison, { el: 'venom', frontal: false, src: 'poison' }, events);
    if (e.alive && !has(st, 'plague')) e.poison--;
  }
  for (const e of alive(st)) if (e.wet > 0) e.wet--;
  checkObjective(st, events);
  if (st.result) return events;
  st.queue = alive(st).sort((a, b) => b.row - a.row || a.lane - b.lane).map((e) => e.id);
  events.push({ type: 'enemyPhase' });
  return events;
}

function execute(st, e, it, events) {
  switch (it.kind) {
    case 'frozen':
      e.frozen--;
      events.push({ type: 'frozenSkip', id: e.id, left: e.frozen });
      return null;
    case 'wait':
      events.push({ type: 'wait', id: e.id, slow: !!it.slow });
      return null;
    case 'move': {
      const from = e.row;
      const fromLane = e.lane;
      e.row += it.steps;
      if (it.toLane != null) {
        e.lane = it.toLane;
        e.dir = it.dir;
      }
      if (it.dash) e.charge = false;
      events.push({ type: 'move', id: e.id, lane: e.lane, fromLane, from, to: e.row, hop: !!it.hop, dash: !!it.dash });
      return null;
    }
    case 'rev':
      e.charge = true;
      events.push({ type: 'rev', id: e.id, lane: e.lane });
      return null;
    case 'mend': {
      const t = byId(st, it.target);
      if (t && t.alive) {
        const h0 = t.hp;
        t.hp = Math.min(t.maxHp, t.hp + it.amount);
        events.push({ type: 'mend', id: e.id, target: t.id, amount: t.hp - h0, hp: t.hp });
      }
      return null;
    }
    case 'brace':
      e.braced = true;
      events.push({ type: 'brace', id: e.id });
      return null;
    case 'aim':
      e.charge = true;
      events.push({ type: 'aim', id: e.id, lane: e.lane });
      return null;
    case 'charge':
      e.charge = true;
      e.vulnerable = true;
      e.step++;
      events.push({ type: 'charge', id: e.id });
      return null;
    case 'summon': {
      events.push({ type: 'summon', id: e.id });
      const lanes = [0, 1, 2].filter((l) => l !== e.lane);
      if (randInt(st, 2)) lanes.reverse();
      lanes.push(e.lane);
      let made = 0;
      for (const l of lanes) {
        if (made >= it.count) break;
        if (!enemyAt(st, l, 1) && spawnEnemy(st, 'kasa', l, 1, events, 'summon')) made++;
      }
      e.step++;
      return null;
    }
    case 'shift': {
      const from = e.lane;
      e.lane = it.toLane;
      events.push({ type: 'shift', id: e.id, from, to: e.lane, row: e.row });
      e.step++;
      return null;
    }
    case 'attack': {
      const style = it.style;
      return {
        attack: {
          attackerId: e.id, etype: e.type, style, dmg: it.dmg,
          lane: e.lane, row: e.row, hits: it.hits || 1, hitIndex: 0,
          windup: WINDUP[style],
          parry: style !== 'heavy',
        },
      };
    }
  }
  return null;
}

export function nextEnemyStep(st) {
  if (st.phase !== 'enemy') throw new Error('nextEnemyStep: wrong phase');
  if (st.pending || st.pendingCounter) throw new Error('nextEnemyStep: reaction pending');
  const events = [];
  while (st.queue.length) {
    const e = byId(st, st.queue.shift());
    if (!e || !e.alive) continue;
    const r = execute(st, e, decide(st, e), events);
    if (r && r.attack) {
      st.pending = r.attack;
      return { events, attack: clone(r.attack) };
    }
    return { events };
  }
  finishEnemyPhase(st, events);
  return { events, done: true };
}

function applyPlayerDamage(st, dmg, events) {
  if (dmg <= 0) return;
  const p = st.player;
  const absorbed = Math.min(p.guard, dmg);
  p.guard -= absorbed;
  const real = dmg - absorbed;
  p.hp = Math.max(0, p.hp - real);
  st.stats.dmgTaken += real;
  events.push({ type: 'playerHit', dmg: real, absorbed, hp: p.hp, guard: p.guard });
}

function finishAttacker(st, a, e) {
  if (!e) return;
  e.fury = 0;
  if (a.style === 'heavy') e.braced = false;
  if (a.style === 'ranged') e.charge = false;
  if (a.style === 'volley') {
    e.charge = false;
    e.vulnerable = false;
    e.step++;
  }
}

// 이 반응에 드는 기력(타이밍이 빗나가면 0)
export function reactCost(action, grade) {
  if (grade !== 'perfect' && grade !== 'good') return 0;
  if (action === 'guard') return STAMINA.guard;
  if (action === 'dodge') return grade === 'perfect' ? STAMINA.perfectDodge : STAMINA.dodge;
  return 0;
}

// input: { action: 'guard'|'dodge'|null, grade: 'perfect'|'good'|'miss' }
export function resolveReaction(st, input) {
  const a = st.pending;
  if (!a) throw new Error('resolveReaction: nothing pending');
  const e = byId(st, a.attackerId);
  const events = [];
  const action = input && input.action;
  const grade = (input && input.grade) || 'miss';
  const heavy = a.style === 'heavy';
  let dmg = a.dmg;
  let outcome = 'none';
  let needCounter = false;
  let mirrorGuard = false;
  const cost = reactCost(action, grade);
  const sta = st.player.stamina ?? STAMINA.max;

  if (cost > sta) {
    // 기력이 모자라면 타이밍이 맞아도 막거나 피하지 못한다
    outcome = 'tired';
    st.stats.fail++;
  } else if (action === 'guard' && grade === 'perfect') {
    st.stats.perfect++;
    if (heavy) {
      dmg = Math.ceil(dmg / 2);
      outcome = 'guardHeavy';
    } else {
      dmg = 0;
      outcome = 'perfectGuard';
      st.player.embers = Math.min(EMBER_CAP, st.player.embers + 1);
      mirrorGuard = has(st, 'counterMirror');
      if (a.style === 'volley') outcome = 'deflect';
      else needCounter = true;
    }
  } else if (action === 'guard' && grade === 'good') {
    st.stats.good++;
    if (heavy) {
      outcome = 'guardBreak';
    } else {
      dmg = Math.floor(dmg / 2);
      outcome = 'guard';
    }
  } else if (action === 'dodge' && (grade === 'good' || grade === 'perfect')) {
    dmg = 0;
    st.stats.dodges++;
    if (grade === 'perfect') {
      st.stats.perfect++;
      st.player.embers = Math.min(EMBER_CAP, st.player.embers + 1);
    } else st.stats.good++;
    outcome = grade === 'perfect' ? 'perfectDodge' : 'dodge';
  } else {
    outcome = action ? 'fail' : 'none';
    st.stats.fail++;
  }

  if (outcome !== 'tired' && cost > 0) st.player.stamina = sta - cost;
  events.push({ type: 'react', outcome, action, grade, style: a.style, attackerId: a.attackerId, lane: a.lane, hitIndex: a.hitIndex, stamina: st.player.stamina, spent: outcome !== 'tired' ? cost : 0, ember: outcome === 'perfectGuard' || outcome === 'perfectDodge' || outcome === 'deflect' });
  applyPlayerDamage(st, dmg, events);
  if (['perfectGuard', 'deflect', 'perfectDodge', 'guardHeavy'].includes(outcome)) addCoins(st, COIN.perfect, 'perfect', events);
  if (mirrorGuard) addGuard(st, lv(st, 'counterMirror'), events, 'counterMirror');
  // 융합 [맞수]: 퍼펙트 막기·회피 성공 → 모든 적 1 피해
  if (has(st, 'duel') && ['perfectGuard', 'deflect', 'dodge', 'perfectDodge'].includes(outcome)) {
    relicEvent(st, events, 'duel');
    for (const n of alive(st)) hit(st, n, 1, { el: 'counter', frontal: false, pierceShield: true, src: 'relic' }, events);
  }

  if (e && e.alive) {
    if (outcome === 'dodge' || outcome === 'perfectDodge') {
      if (has(st, 'shadowShoes')) {
        relicEvent(st, events, 'shadowShoes', { id: e.id });
        hit(st, e, 2 * lv(st, 'shadowShoes'), { el: 'counter', frontal: false, pierceShield: true, src: 'relic' }, events);
      }
      if (e.alive) {
        e.exposed = true;
        events.push({ type: 'expose', id: e.id });
      }
    }
    if (outcome === 'guard' && a.style === 'melee') {
      events.push({ type: 'fire', symbol: 'counter', tier: 1, lane: e.lane, small: true });
      hit(st, e, 1, { el: 'counter', frontal: false, pierceShield: true, shatter: true, src: 'counter' }, events);
      events.push({ type: 'fireEnd', lane: e.lane, row: e.row });
    }
    if (outcome === 'deflect') {
      events.push({ type: 'fire', symbol: 'deflect', tier: 1, lane: e.lane, targetId: e.id });
      hit(st, e, 2 + 2 * lv(st, 'counterMirror'), { el: 'counter', frontal: false, pierceShield: true, shatter: true, src: 'deflect' }, events);
      events.push({ type: 'fireEnd', lane: e.lane, row: e.row });
      st.stats.counters++;
    }
  }
  a.hitIndex++;

  if (st.player.hp <= 0) {
    finishAttacker(st, a, e);
    st.pending = null;
    checkObjective(st, events);
    return { events };
  }
  checkObjective(st, events);
  if (st.result) {
    st.pending = null;
    return { events };
  }
  if (needCounter) {
    finishAttacker(st, a, e);
    st.pending = null;
    st.pendingCounter = { lane: a.lane, dmg: 3 + 2 * lv(st, 'counterMirror'), attackerId: a.attackerId };
    return { events, counter: { defaultLane: a.lane } };
  }
  if (a.hitIndex < a.hits && e && e.alive) {
    return { events, attack: clone(a) };
  }
  finishAttacker(st, a, e);
  st.pending = null;
  return { events };
}

export function resolveCounter(st, lane) {
  const pc = st.pendingCounter;
  if (!pc) throw new Error('resolveCounter: nothing pending');
  if (!(lane >= 0 && lane < LANES)) lane = pc.lane;
  st.pendingCounter = null;
  st.stats.counters++;
  const events = [{ type: 'fire', symbol: 'counter', tier: 2, lane }];
  let endRow = -1;
  for (const t of laneTargets(st, lane)) {
    hit(st, t, pc.dmg, { el: 'counter', frontal: true, pierceShield: true, shatter: true, src: 'counter' }, events);
    endRow = t.row;
  }
  events.push({ type: 'fireEnd', lane, row: -1, lastRow: endRow });
  checkObjective(st, events);
  return events;
}

export function previewCounter(st, lane) {
  const c = clone(st);
  const events = resolveCounter(c, lane);
  return { events, summary: summarize(events) };
}

function finishEnemyPhase(st, events) {
  const o = st.def.objective;
  if (o.type === 'survive' && st.turn >= o.turns) {
    win(st, events);
    return;
  }
  if (o.type === 'rush' && st.turn >= o.turns && !st.result) {
    st.result = 'lose';
    st.loseReason = 'time';
    st.phase = 'over';
    events.push({ type: 'lose', reason: 'time' });
    return;
  }
  startTurn(st, events);
}

// ───────────────────────── 목표 ─────────────────────────

function win(st, events) {
  if (st.result) return;
  st.result = 'win';
  st.phase = 'over';
  addCoins(st, st.def.clearCoins, 'clear', events);
  events.push({ type: 'win' });
}

export function checkObjective(st, events) {
  if (st.result) return;
  if (st.player.hp <= 0) {
    st.result = 'lose';
    st.phase = 'over';
    events.push({ type: 'lose' });
    return;
  }
  const o = st.def.objective;
  if (o.type === 'annihilate' && st.waves.every((w) => w.done) && alive(st).length === 0) win(st, events);
  // 세 갈래: 레인마다 정해진 수만큼 처치(적이 다 떨어지면 그대로 승리)
  if (o.type === 'lanes' && (st.laneKills.every((k) => k >= o.need) || (st.waves.every((w) => w.done) && alive(st).length === 0))) win(st, events);
  // 속전: 기한 안에 정해진 수 처치
  if (o.type === 'rush' && (st.kills >= o.kills || (st.waves.every((w) => w.done) && alive(st).length === 0))) win(st, events);
  if (o.type === 'hunt') {
    const targets = st.enemies.filter((e) => e.type === o.target);
    if (targets.length && targets.every((e) => !e.alive)) win(st, events);
  }
}

export function objectiveProgress(st) {
  const o = st.def.objective;
  if (o.type === 'annihilate') return { label: '적 처치', value: `${st.kills}/${st.totalEnemies}`, ratio: st.kills / Math.max(1, st.totalEnemies) };
  if (o.type === 'survive') {
    const done = Math.min(o.turns, st.turn - (st.result === 'win' ? 0 : 1));
    return { label: '버티기', value: `${done}/${o.turns}턴`, ratio: done / o.turns };
  }
  if (o.type === 'lanes') return { label: '레인별', value: st.laneKills.map((k) => `${Math.min(k, o.need)}/${o.need}`).join(' · '), ratio: st.laneKills.reduce((a, k) => a + Math.min(k, o.need), 0) / (o.need * 3) };
  if (o.type === 'rush') return { label: '처치', value: `${Math.min(st.kills, o.kills)}/${o.kills} · ${Math.max(0, o.turns - st.turn + 1)}턴 남음`, ratio: st.kills / o.kills };
  const t = st.enemies.find((e) => e.type === o.target);
  return { label: '보스 체력', value: t ? `${t.hp}/${t.maxHp}` : '-', ratio: t ? 1 - t.hp / t.maxHp : 0, bossId: t && t.id };
}
