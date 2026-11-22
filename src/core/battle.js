// 전투 규칙 엔진 — 화면/소리와 무관한 순수 로직.
// 모든 행동 함수는 "이벤트 목록"을 반환하고, 연출 코드는 그 목록을 재생만 한다.
// 상태(st)는 순수 데이터(JSON 호환)이므로 structuredClone으로 복제해 미리보기를 계산한다.

import { rand, randInt, pickDistinct } from './rng.js';
import {
  LANES, FRONT, GUARD_CAP, EMBER_CAP, REROLLS_PER_TURN,
  ENEMIES, shotStats,
} from './data.js';
import { evaluateReels } from './slot.js';
import { WINDUP } from './timing.js';

const clone = (o) => structuredClone(o);
export const has = (st, id) => st.relics.includes(id);
const guardCap = (st) => GUARD_CAP + (has(st, 'oilFlask') ? 2 : 0);

function relicEvent(st, events, relic, extra = {}) {
  events.push({ type: 'relic', relic, ...extra });
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
  const f = sp.boss ? 1 : turns;
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
    def: { id: def.id, name: def.name, objective: { ...def.objective } },
    turn: 0,
    phase: 'spin', // spin | aim | enemy | over
    relics: (opt.relics || []).slice(),
    player: {
      hp: opt.hp, maxHp: opt.maxHp,
      guard: Math.min(GUARD_CAP, opt.guard || 0),
      embers: Math.min(EMBER_CAP, (opt.embers || 0) + ((opt.relics || []).includes('emberWick') ? 1 : 0)),
    },
    strips: opt.strips.map((s) => s.slice()),
    reels: [],
    shots: [],
    shotsFired: 0,
    rerollsLeft: 0,
    rerollCount: 0,
    turnGild: 0,
    omens: [],
    enemies: [],
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

function spawnEnemy(st, type, lane, row, events, src = 'wave') {
  const cell = findSpawnCell(st, lane, row);
  if (!cell) return null;
  const sp = ENEMIES[type];
  const e = {
    id: st.nextId++, type, lane: cell.lane, row: cell.row,
    hp: sp.hp, maxHp: sp.hp, alive: true,
    frozen: 0, exposed: false, braced: false, charge: false,
    fury: 0, step: 0, vulnerable: false, shieldBroken: false, phase2: false,
  };
  st.enemies.push(e);
  if (src !== 'wave') st.totalEnemies++;
  events.push({ type: 'spawn', id: e.id, enemy: clone(e), src });
  return e;
}

function spawnWave(st, w, events) {
  const left = [];
  for (const [type, lane, row] of w.units) {
    if (!spawnEnemy(st, type, lane, row, events)) left.push([type, lane, row]);
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
  st.phase = 'spin';
  st.rerollsLeft = REROLLS_PER_TURN + (has(st, 'gamblerCoin') ? 1 : 0);
  st.rerollCount = 0;
  st.turnGild = 0;
  st.shots = [];
  st.shotsFired = 0;
  st.omens = [rollOmen(st), rollOmen(st), rollOmen(st)];
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
    return { text: canMove ? `${ENEMIES[e.type].name} 1칸 전진` : `${ENEMIES[e.type].name} 분노 +1`, id: e.id };
  }
  if (omen.kind === 'empower' && e && e.alive) return { text: `${ENEMIES[e.type].name} 분노 +2`, id: e.id };
  const lane = omen.lane ?? (e ? e.lane : 1);
  return { text: `${lane + 1}번 레인에 우산 도깨비 등장`, lane };
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
  st.shots = evaluateReels(st.reels);
  const top = Math.max(...st.shots.map((s) => s.tier));
  if (top === 3) st.stats.jackpots++;
  else if (top === 2) st.stats.pairs++;
  events.push({ type: 'spin', reels: clone(st.reels), shots: clone(st.shots) });
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

export function reroll(st) {
  if (!canReroll(st)) throw new Error('reroll not allowed');
  const events = [];
  applyOmen(st, st.omens[st.rerollCount], events);
  st.rerollCount++;
  st.rerollsLeft--;
  st.stats.rerolls++;
  if (has(st, 'gamblerCoin')) addGuard(st, 1, events, 'gamblerCoin');
  rollReels(st, st.turnGild + st.rerollCount, events);
  return events;
}

// ───────────────────────── 피해 처리 ─────────────────────────

// o: { el, frontal, shatter, freeze, pierceShield, src }
function hit(st, e, dmg, o, events, depth = 0) {
  if (!e || !e.alive) return { skipped: true };
  const sp = ENEMIES[e.type];
  const tags = [];
  const shielded = sp.shield && !e.shieldBroken && !e.exposed && o.frontal && !o.pierceShield;
  let bonus = 0;
  let shards = false;
  if (e.frozen > 0 && o.shatter) {
    bonus += 3;
    e.frozen = 0;
    shards = true;
    tags.push('shatter');
    st.stats.shatters++;
    if (sp.shield && !e.shieldBroken) {
      e.shieldBroken = true;
      tags.push('shieldBreak');
    }
  } else if (shielded) {
    events.push({ type: 'block', id: e.id, el: o.el, lane: e.lane, row: e.row });
    return { blocked: true };
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
  events.push({ type: 'hit', id: e.id, dmg: total, el: o.el, tags, hp: Math.max(0, e.hp), lane: e.lane, row: e.row, src: o.src || null });

  if (e.hp <= 0) {
    e.hp = 0;
    e.alive = false;
    st.kills++;
    events.push({ type: 'kill', id: e.id, etype: e.type, lane: e.lane, row: e.row });
    // 유물 [천둥 북]: 처치 → 가장 가까운 적에게 번개 (연쇄 깊이 제한)
    if (has(st, 'thunderDrum') && depth < 3) {
      const near = alive(st)
        .map((n) => ({ n, d: Math.abs(n.lane - e.lane) + Math.abs(n.row - e.row) }))
        .sort((a, b) => a.d - b.d || b.n.row - a.n.row || a.n.lane - b.n.lane)[0];
      if (near) {
        relicEvent(st, events, 'thunderDrum', { from: { lane: e.lane, row: e.row }, to: { lane: near.n.lane, row: near.n.row }, id: near.n.id });
        hit(st, near.n, 2, { el: 'spark', frontal: false, src: 'relic' }, events, depth + 1);
      }
    }
  } else {
    if (sp.boss && !e.phase2 && e.hp <= e.maxHp / 2) {
      e.phase2 = true;
      e.step = 0;
      events.push({ type: 'bossPhase', id: e.id });
    }
    if (o.freeze) applyFreeze(st, e, o.freeze, events);
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
        applyFreeze(st, n, 1, events);
      }
    }
  }
  return { total, killed: !e.alive };
}

// ───────────────────────── 공격 기술 ─────────────────────────

function resolveShot(st, shot, lane, events) {
  const S = shotStats(shot.symbol, shot.tier, shot.gild);
  if (shot.gild > 0 && has(st, 'emberWick')) for (const k of ['dmg', 'sideDmg']) if (S[k] != null) S[k] += 1;
  if (shot.symbol === 'blade' && has(st, 'whetstone') && S.pierce < 99) S.pierce += 1;
  if (shot.symbol === 'wave' && has(st, 'tideBell') && S.splash != null) S.splash += 1;
  const base = { type: 'fire', symbol: shot.symbol, tier: shot.tier, gild: shot.gild, lane, shotId: shot.id };
  const sym = shot.symbol;

  if (sym === 'lantern') {
    events.push({ ...base });
    const p = st.player;
    const before = p.guard;
    p.guard = Math.min(guardCap(st), p.guard + S.guard);
    events.push({ type: 'ward', amount: p.guard - before, guard: p.guard });
    const healAmt = S.heal + (has(st, 'oilFlask') ? 1 : 0);
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
      for (const t of laneTargets(st, l)) {
        if (n >= S.pierce) break;
        const r = hit(st, t, side ? S.sideDmg : S.dmg, {
          el: 'blade', frontal: true, shatter: true, pierceShield: shot.tier === 3,
        }, events);
        n++;
        if (r.killed && has(st, 'whetstone')) addGuard(st, 1, events, 'whetstone');
        if (r.blocked) { endRow = t.row; break; }
        endRow = n >= S.pierce ? t.row : -1;
      }
      events.push({ type: 'fireEnd', lane: l, row: endRow });
    }
    return;
  }

  if (sym === 'wave') {
    events.push({ ...base });
    const first = laneTargets(st, lane)[0];
    const row = first ? first.row : 0;
    const cells = S.area === 'square'
      ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
      : [[-1, 0], [1, 0], [0, -1]];
    const splash = cells.map(([dl, dr]) => [lane + dl, row + dr]).filter(([l, r]) => l >= 0 && l < LANES && r >= 0 && r <= FRONT);
    events.push({ type: 'burst', lane, row, cells: splash, tier: shot.tier });
    // 중심과 주변 대상을 먼저 확정한다(중간에 처치·이동되어도 대상이 바뀌지 않도록)
    const splashTargets = splash.map(([l, r]) => enemyAt(st, l, r)).filter(Boolean);
    if (first) {
      const r = hit(st, first, S.dmg, { el: 'wave', frontal: true, shatter: true }, events);
      // 유물 [파도 방울]: 직격당한 적을 한 칸 밀어낸다
      if (!r.blocked && first.alive && has(st, 'tideBell') && !ENEMIES[first.type].boss && first.row > 0 && !enemyAt(st, first.lane, first.row - 1)) {
        relicEvent(st, events, 'tideBell', { id: first.id });
        const from = first.row;
        first.row--;
        events.push({ type: 'push', id: first.id, lane: first.lane, from, to: first.row });
      }
    }
    for (const t of splashTargets) hit(st, t, S.splash, { el: 'wave', frontal: false, shatter: false, src: 'splash' }, events);
    events.push({ type: 'fireEnd', lane, row });
    return;
  }

  if (sym === 'frost') {
    events.push({ ...base });
    let endRow = -1;
    const targets = laneTargets(st, lane);
    const list = S.wholeLane ? targets : targets.slice(0, 1);
    for (const t of list) {
      const r = hit(st, t, S.dmg, { el: 'frost', frontal: true, freeze: S.freeze }, events);
      endRow = t.row;
      if (r.blocked) break;
    }
    events.push({ type: 'fireEnd', lane, row: endRow });
    return;
  }

  if (sym === 'spark') {
    events.push({ ...base });
    const first = laneTargets(st, lane)[0];
    if (!first) {
      events.push({ type: 'fireEnd', lane, row: -1 });
      return;
    }
    const hitSet = new Set([first.id]);
    hit(st, first, S.dmg, { el: 'spark', frontal: true }, events);
    let cur = { lane: first.lane, row: first.row };
    for (let j = 0; j < S.jumps; j++) {
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
      hit(st, nx, S.jumpDmg, { el: 'spark', frontal: false, src: 'chain' }, events);
    }
    events.push({ type: 'fireEnd', lane, row: first.row });
  }
}

export function fireShot(st, shotIndex, lane) {
  if (st.phase !== 'aim' || st.result) throw new Error('fireShot: wrong phase');
  const shot = st.shots[shotIndex];
  if (!shot || shot.used) throw new Error('fireShot: invalid shot');
  if (!(lane >= 0 && lane < LANES)) throw new Error('fireShot: invalid lane');
  shot.used = true;
  st.shotsFired++;
  const events = [];
  resolveShot(st, shot, lane, events);
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
    if (ev.type === 'block') get(ev.id).blocked = true;
    if (ev.type === 'freeze') get(ev.id).frozen = ev.turns;
    if (ev.type === 'expose') get(ev.id).exposed = true;
    if (ev.type === 'ward') guard += ev.amount;
    if (ev.type === 'heal') heal += ev.amount;
    if (ev.type === 'burst') cells.push(...ev.cells, [ev.lane, ev.row]);
    if (ev.type === 'shards') cells.push(...ev.cells);
  }
  return { per, guard, heal, cells };
}

export function previewShot(st, shotIndex, lane) {
  const c = clone(st);
  const events = fireShot(c, shotIndex, lane);
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
      if (e.row >= sp.reach) return { kind: 'attack', style: 'melee', dmg: sp.atk + e.fury };
      const want = e.hp === e.maxHp ? 2 : 1;
      const steps = freeSteps(st, e, want);
      return steps > 0 ? { kind: 'move', steps, hop: want === 2 } : { kind: 'wait' };
    }
    case 'mask': {
      if (e.row >= FRONT) return e.braced ? { kind: 'attack', style: 'heavy', dmg: sp.atk + e.fury } : { kind: 'brace' };
      if ((st.turn + e.id) % 2 === 0) {
        return freeSteps(st, e, 1) ? { kind: 'move', steps: 1 } : { kind: 'wait' };
      }
      return { kind: 'wait', slow: true };
    }
    case 'archer': {
      if (e.row < sp.post && freeSteps(st, e, 1)) return { kind: 'move', steps: 1 };
      if (e.charge) return { kind: 'attack', style: 'ranged', dmg: sp.atk + e.fury };
      return { kind: 'aim' };
    }
    case 'elder': {
      const cyc = e.phase2 ? ELDER_P2 : ELDER_P1;
      const act = cyc[e.step % cyc.length];
      if (act === 'volley') {
        if (!e.charge) return { kind: 'charge' };
        return { kind: 'attack', style: 'volley', dmg: sp.atk + e.fury, hits: e.phase2 ? 4 : 3 };
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
    if (it.kind === 'move') e.row += it.steps;
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
      e.row += it.steps;
      events.push({ type: 'move', id: e.id, lane: e.lane, from, to: e.row, hop: !!it.hop });
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

  if (action === 'guard' && grade === 'perfect') {
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

  events.push({ type: 'react', outcome, action, grade, style: a.style, attackerId: a.attackerId, lane: a.lane, hitIndex: a.hitIndex, ember: outcome === 'perfectGuard' || outcome === 'perfectDodge' || outcome === 'deflect' });
  applyPlayerDamage(st, dmg, events);
  if (mirrorGuard) addGuard(st, 1, events, 'counterMirror');

  if (e && e.alive) {
    if (outcome === 'dodge' || outcome === 'perfectDodge') {
      if (has(st, 'shadowShoes')) {
        relicEvent(st, events, 'shadowShoes', { id: e.id });
        hit(st, e, 2, { el: 'counter', frontal: false, pierceShield: true, src: 'relic' }, events);
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
      hit(st, e, 2 + (has(st, 'counterMirror') ? 2 : 0), { el: 'counter', frontal: false, pierceShield: true, shatter: true, src: 'deflect' }, events);
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
    st.pendingCounter = { lane: a.lane, dmg: 3 + (has(st, 'counterMirror') ? 2 : 0), attackerId: a.attackerId };
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
  startTurn(st, events);
}

// ───────────────────────── 목표 ─────────────────────────

function win(st, events) {
  if (st.result) return;
  st.result = 'win';
  st.phase = 'over';
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
  if (o.type === 'hunt') {
    const targets = st.enemies.filter((e) => e.type === o.target);
    if (targets.length && targets.every((e) => !e.alive)) win(st, events);
  }
}

export function objectiveProgress(st) {
  const o = st.def.objective;
  if (o.type === 'annihilate') return { label: '적 전멸', value: `${st.kills}/${st.totalEnemies}`, ratio: st.kills / Math.max(1, st.totalEnemies) };
  if (o.type === 'survive') {
    const done = Math.min(o.turns, st.turn - (st.result === 'win' ? 0 : 1));
    return { label: '버티기', value: `${done}/${o.turns}턴`, ratio: done / o.turns };
  }
  const t = st.enemies.find((e) => e.type === o.target);
  return { label: '장로 처치', value: t ? `${t.hp}/${t.maxHp}` : '-', ratio: t ? 1 - t.hp / t.maxHp : 0, bossId: t && t.id };
}
