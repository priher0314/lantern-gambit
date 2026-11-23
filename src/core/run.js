// 한 판(런) 진행: 전투 순서, 체력 이월, 릴 구성, 유물, 보상
import { randInt, shuffle } from './rng.js';
import { BATTLES, BASE_STRIP, REWARDS, RELICS, RELIC_IDS, FUSIONS, FUSION_IDS } from './data.js';

export function createRun(seed) {
  const run = {
    seed: seed >>> 0 || 1,
    rng: seed >>> 0 || 1,
    stage: 0,
    hp: 15,
    maxHp: 15,
    strips: [],
    relics: [],
    relicLv: {},
    relicProc: {},
    picks: [],
    totals: { kills: 0, perfect: 0, counters: 0, jackpots: 0, bingos: 0, shatters: 0, dmgDealt: 0, turns: 0, score: 0 },
  };
  run.strips = [0, 1, 2].map(() => makeStrip(run));
  return run;
}

// 같은 문양이 위아래로 붙지 않는 릴 띠
function noRepeat(s) {
  return s.every((v, i) => v !== s[(i + 1) % s.length]);
}

function makeStrip(run) {
  let s = shuffle(run, BASE_STRIP);
  for (let i = 0; i < 300 && !noRepeat(s); i++) s = shuffle(run, BASE_STRIP);
  return s;
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
    relicLv: run.relicLv,
    relicProc: run.relicProc,
  };
}

export function recordBattle(run, st) {
  run.hp = st.player.hp;
  run.relicLv = { ...st.relicLv }; // 전투 중 진화한 단계를 이어 간다
  run.relicProc = { ...st.relicProc };
  run.maxHp = st.player.maxHp;
  const t = run.totals;
  t.kills += st.kills;
  t.perfect += st.stats.perfect;
  t.counters += st.stats.counters;
  t.jackpots += st.stats.jackpots;
  t.shatters += st.stats.shatters;
  t.dmgDealt += st.stats.dmgDealt;
  t.turns += st.stats.turns;
  t.bingos += st.stats.bingos || 0;
  // 점수: 피해·연속 처치·빙고(전투 중 누적) + 퍼펙트·되치기 + 남은 체력(승리 시)
  t.score += st.score + st.stats.perfect * 100 + st.stats.counters * 60 + (st.result === 'win' ? st.player.hp * 20 : 0);
}

function pickSome(run, pool, n) {
  const p = pool.slice();
  const out = [];
  while (out.length < n && p.length) out.push(p.splice(randInt(run, p.length), 1)[0]);
  return out;
}

// 보상 정보(유물이든 일반 보상이든 같은 모양으로)
export function rewardInfo(id) {
  if (id.startsWith('fuse:')) {
    const f = FUSIONS[id.slice(5)];
    return { id, relic: true, fuse: true, relicId: id.slice(5), ...f, tag: '융합', name: f.name, desc: f.desc, parts: [RELICS[f.a].name, RELICS[f.b].name] };
  }
  if (id.startsWith('up:')) {
    const r = RELICS[id.slice(3)];
    return { id, relic: true, upgrade: true, relicId: id.slice(3), ...r, name: r.name + ' II', desc: '강화: ' + r.up };
  }
  if (RELICS[id]) return { id, relic: true, relicId: id, ...RELICS[id] };
  return { id, relic: false, ...REWARDS[id] };
}

// 런 시작: 유물 3개 중 하나를 고른다 → 빌드의 출발점
export function rollStartRelics(run) {
  return pickSome(run, RELIC_IDS, 3);
}

export function availableFusions(run) {
  return FUSION_IDS.filter((f) => !run.relics.includes(f) && run.relics.includes(FUSIONS[f].a) && run.relics.includes(FUSIONS[f].b));
}

// 전투 보상: 새 유물 2개 + 일반 보상 1개
export function rollRewards(run) {
  const relics = pickSome(run, RELIC_IDS.filter((id) => !run.relics.includes(id)), 2);
  const utils = Object.keys(REWARDS).filter((k) => !(k === 'heal' && run.hp >= run.maxHp));
  const out = [...relics, ...pickSome(run, utils, 3 - relics.length)];
  // 가진 유물이 있으면 60% 확률로 마지막 칸이 "유물 강화(II)"가 된다
  const upgradable = run.relics.filter((id) => (run.relicLv[id] || 1) < 2);
  if (upgradable.length && randInt(run, 10) < 6) out[out.length - 1] = 'up:' + upgradable[randInt(run, upgradable.length)];
  // 융합 재료가 모였으면 반드시 융합 선택지를 준다
  const fuse = availableFusions(run);
  if (fuse.length) out[out.length - 1] = 'fuse:' + fuse[0];
  return out;
}

export function applyReward(run, id) {
  if (id.startsWith('fuse:')) {
    if (!run.relics.includes(id.slice(5))) run.relics.push(id.slice(5));
    run.picks.push(id);
    return;
  }
  if (id.startsWith('up:')) {
    run.relicLv[id.slice(3)] = Math.max(2, run.relicLv[id.slice(3)] || 1);
    run.picks.push(id);
    return;
  }
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
      const ok = [];
      for (let i = 0; i < c.length; i++) if (c[i] !== r.sym && c[(i + c.length - 1) % c.length] !== r.sym) ok.push(i);
      c.splice(ok.length ? ok[randInt(run, ok.length)] : randInt(run, c.length + 1), 0, r.sym);
      return c;
    });
  }
  run.picks.push(id);
}

export function advance(run) {
  run.stage++;
  return currentBattle(run);
}
