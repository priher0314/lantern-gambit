// 밸런스 측정: 실력이 다른 봇들로 런 승률·평균 남은 체력을 본다.  node tools/balance.mjs
import {
  createBattle, spin, reroll, canReroll, fireShot, previewShot, endPlayerTurn,
  nextEnemyStep, resolveReaction, resolveCounter,
} from '../src/core/battle.js';
import { BATTLES } from '../src/core/data.js';
import { createRun, battleOptions, rollRewards, rollStartRelics, applyReward, recordBattle, advance } from '../src/core/run.js';
import { rand, randInt } from '../src/core/rng.js';

const PROFILES = {
  // 반응: [퍼펙트 막기, 일반 막기, 회피 성공, 실패] 확률 / 조준: smart = 미리보기로 최선 레인
  novice: { react: [0.05, 0.35, 0.15], smart: 0.4, reroll: 0.2 },
  average: { react: [0.2, 0.4, 0.2], smart: 0.75, reroll: 0.3 },
  skilled: { react: [0.45, 0.3, 0.2], smart: 1, reroll: 0.35 },
};

function score(sum) {
  return Object.values(sum.per).reduce((s, p) => s + p.dmg + (p.killed ? 3 : 0) + (p.frozen ? 2 : 0), 0) + sum.guard * 0.8;
}

function playRun(seed, P) {
  const run = createRun(seed);
  applyReward(run, rollStartRelics(run)[0]);
  const r = { rng: seed * 101 + 7 };
  const reached = [];
  for (let stage = 0; stage < BATTLES.length; stage++) {
    const { st } = createBattle(BATTLES[stage], battleOptions(run));
    let attacks = 0;
    while (!st.result) {
      spin(st);
      while (canReroll(st) && rand(r) < P.reroll) reroll(st);
      for (let i = 0; i < st.shots.length && !st.result; i++) {
        let lane = randInt(r, 3);
        if (rand(r) < P.smart) {
          let best = -1;
          for (let l = 0; l < 3; l++) {
            const s = score(previewShot(st, i, l).summary);
            if (s > best) { best = s; lane = l; }
          }
        }
        fireShot(st, i, lane);
      }
      if (st.result) break;
      endPlayerTurn(st);
      for (;;) {
        const step = nextEnemyStep(st);
        let a = step.attack;
        while (a) {
          const x = rand(r);
          const [pp, gg, dd] = P.react;
          let input;
          if (a.style === 'heavy') input = x < pp + gg + dd ? { action: 'dodge', grade: 'good' } : { action: 'guard', grade: 'good' };
          else input = x < pp ? { action: 'guard', grade: 'perfect' } : x < pp + gg ? { action: 'guard', grade: 'good' } : x < pp + gg + dd ? { action: 'dodge', grade: 'good' } : { action: null };
          attacks++;
          const res = resolveReaction(st, input);
          if (res.counter) resolveCounter(st, res.counter.defaultLane);
          a = res.attack;
        }
        if (step.done || st.result) break;
      }
    }
    reached.push({ stage, result: st.result, hp: st.player.hp, turns: st.turn, attacks });
    if (st.result === 'lose') return { win: false, reached };
    recordBattle(run, st);
    if (stage < BATTLES.length - 1) applyReward(run, rollRewards(run)[0]);
    advance(run);
  }
  return { win: true, reached, hp: run.hp };
}

for (const [name, P] of Object.entries(PROFILES)) {
  const N = 400;
  let wins = 0;
  const lostAt = [0, 0, 0, 0, 0];
  const turns = [0, 0, 0, 0, 0];
  const hpAfter = [0, 0, 0, 0, 0];
  const cnt = [0, 0, 0, 0, 0];
  const atk = [0, 0, 0, 0, 0];
  for (let s = 1; s <= N; s++) {
    const res = playRun(s, P);
    if (res.win) wins++;
    for (const b of res.reached) {
      cnt[b.stage]++;
      turns[b.stage] += b.turns;
      atk[b.stage] += b.attacks;
      hpAfter[b.stage] += b.hp;
      if (b.result === 'lose') lostAt[b.stage]++;
    }
  }
  const avg = (a) => a.map((v, i) => (cnt[i] ? (v / cnt[i]).toFixed(1) : '-')).join(' / ');
  console.log(`${name.padEnd(8)} 승률 ${((wins / N) * 100).toFixed(0)}%  패배 위치 ${lostAt.join('/')}  평균 턴 ${avg(turns)}  전투 후 체력 ${avg(hpAfter)}  적 공격 수 ${avg(atk)}`);
}
