// 한 판(런) 진행: 전투 순서, 체력 이월, 릴 구성, 보상
import { randInt, shuffle } from './rng.js';
import { BATTLES, BASE_STRIP, REWARDS } from './data.js';

export function createRun(seed) {
  const run = {
    seed: seed >>> 0 || 1,
    rng: seed >>> 0 || 1,
    stage: 0,
    hp: 16,
    maxHp: 16,
    strips: [],
    perks: { startEmbers: 0, startGuard: 0 },
    picks: [],
    totals: { kills: 0, perfect: 0, counters: 0, jackpots: 0, shatters: 0, dmgDealt: 0, turns: 0 },
  };
  run.strips = [0, 1, 2].map(() => shuffle(run, BASE_STRIP));
  return run;
}

export function currentBattle(run) {
  return BATTLES[run.stage] || null;
}

export function battleOptions(run) {
  return {
    seed: (run.seed * 31 + run.stage * 7919 + 17) >>> 0,
    hp: run.hp,
    maxHp: run.maxHp,
    strips: run.strips,
    embers: run.perks.startEmbers,
    guard: run.perks.startGuard,
  };
}

export function recordBattle(run, st) {
  run.hp = st.player.hp;
  run.maxHp = st.player.maxHp;
  const t = run.totals;
  t.kills += st.kills;
  t.perfect += st.stats.perfect;
  t.counters += st.stats.counters;
  t.jackpots += st.stats.jackpots;
  t.shatters += st.stats.shatters;
  t.dmgDealt += st.stats.dmgDealt;
  t.turns += st.stats.turns;
}

export function rollRewards(run) {
  const pool = Object.keys(REWARDS).filter((k) => {
    if (k === 'embers' && run.perks.startEmbers >= 2) return false;
    if (k === 'hat' && run.perks.startGuard >= 3) return false;
    if (k === 'heal' && run.hp >= run.maxHp) return false;
    return true;
  });
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(randInt(run, pool.length), 1)[0]);
  return out;
}

export function applyReward(run, id) {
  const r = REWARDS[id];
  if (!r) throw new Error('unknown reward ' + id);
  if (id === 'heal') run.hp = Math.min(run.maxHp, run.hp + 7);
  if (id === 'maxhp') {
    run.maxHp += 3;
    run.hp = Math.min(run.maxHp, run.hp + 3);
  }
  if (r.sym) {
    run.strips = run.strips.map((s) => {
      const c = s.slice();
      c.splice(randInt(run, c.length + 1), 0, r.sym);
      return c;
    });
  }
  if (id === 'embers') run.perks.startEmbers = 2;
  if (id === 'hat') run.perks.startGuard = 3;
  run.picks.push(id);
}

export function advance(run) {
  run.stage++;
  return currentBattle(run);
}
