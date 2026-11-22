// 한 판(런) 진행: 전투 순서, 체력 이월, 릴 구성, 유물, 보상
import { randInt, shuffle } from './rng.js';
import { BATTLES, BASE_STRIP, REWARDS, RELICS, RELIC_IDS } from './data.js';

export function createRun(seed) {
  const run = {
    seed: seed >>> 0 || 1,
    rng: seed >>> 0 || 1,
    stage: 0,
    hp: 16,
    maxHp: 16,
    strips: [],
    relics: [],
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
    relics: run.relics,
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

function pickSome(run, pool, n) {
  const p = pool.slice();
  const out = [];
  while (out.length < n && p.length) out.push(p.splice(randInt(run, p.length), 1)[0]);
  return out;
}

// 보상 정보(유물이든 일반 보상이든 같은 모양으로)
export function rewardInfo(id) {
  if (RELICS[id]) return { id, relic: true, ...RELICS[id] };
  return { id, relic: false, ...REWARDS[id] };
}

// 런 시작: 유물 3개 중 하나를 고른다 → 빌드의 출발점
export function rollStartRelics(run) {
  return pickSome(run, RELIC_IDS, 3);
}

// 전투 보상: 새 유물 2개 + 일반 보상 1개
export function rollRewards(run) {
  const relics = pickSome(run, RELIC_IDS.filter((id) => !run.relics.includes(id)), 2);
  const utils = Object.keys(REWARDS).filter((k) => !(k === 'heal' && run.hp >= run.maxHp));
  return [...relics, ...pickSome(run, utils, 3 - relics.length)];
}

export function applyReward(run, id) {
  if (RELICS[id]) {
    if (!run.relics.includes(id)) run.relics.push(id);
    run.picks.push(id);
    return;
  }
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
  run.picks.push(id);
}

export function advance(run) {
  run.stage++;
  return currentBattle(run);
}
