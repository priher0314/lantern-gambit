// 밸런스 측정: 실력이 다른 봇들이 한 판(밤 생성·길 선택·상점 포함)을 끝까지 돈다.  node tools/balance.mjs
import {
  createBattle, spin, reroll, canReroll, fireShot, previewShot, endPlayerTurn, canSnipe, reactCost,
  nextEnemyStep, resolveReaction, resolveCounter,
} from '../src/core/battle.js';
import { RUN_LENGTH } from '../src/core/data.js';
import {
  createRun, battleOptions, rollRewards, rollStartRelics, applyReward, recordBattle, advance,
  rollPaths, bankBattle, rollShop, buyItem, cantBuy, rollStops, rollRest, rollShrine, takeShrine,
} from '../src/core/run.js';
import { rand, randInt } from '../src/core/rng.js';

const PROFILES = {
  // react: [퍼펙트 막기, 일반 막기, 회피 성공] 확률 / smart: 미리보기로 레인을 고르는 비율 / risk: 험한 길을 고르는 비율
  novice: { react: [0.05, 0.35, 0.15], smart: 0.4, reroll: 0.2, risk: 0.2 },
  average: { react: [0.2, 0.4, 0.2], smart: 0.75, reroll: 0.3, risk: 0.4 },
  skilled: { react: [0.45, 0.3, 0.2], smart: 1, reroll: 0.35, risk: 0.7 },
};

function score(sum) {
  return Object.values(sum.per).reduce((s, p) => s + p.dmg + (p.killed ? 3 : 0) + (p.frozen ? 2 : 0) + (p.poison || 0) + (p.blocked ? 1 : 0), 0) + sum.guard * 0.8;
}

export function playBattle(st, P, r) {
  let attacks = 0;
  while (!st.result) {
    spin(st);
    while (canReroll(st) && rand(r) < P.reroll) reroll(st);
    for (let i = 0; i < st.shots.length && !st.result; i++) {
      let lane = randInt(r, 3);
      let depth = 0;
      if (rand(r) < P.smart) {
        let best = -1;
        const depths = canSnipe(st, i) && rand(r) < P.smart ? [0, 1, 2] : [0];
        for (let l = 0; l < 3; l++) {
          for (const d of depths) {
            const s = score(previewShot(st, i, l, d).summary) - d * 0.01;
            if (s > best) { best = s; lane = l; depth = d; }
          }
        }
      }
      fireShot(st, i, lane, depth);
    }
    if (st.result) break;
    endPlayerTurn(st);
    if (st.result) break;
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
        // 기력이 모자라면 그 동작은 포기한다(막기로 바꾸거나 그냥 맞는다)
        if (reactCost(input.action, input.grade) > st.player.stamina) {
          input = st.player.stamina >= reactCost('guard', 'good') && a.style !== 'heavy' ? { action: 'guard', grade: 'good' } : { action: null };
        }
        const res = resolveReaction(st, input);
        if (res.counter) resolveCounter(st, res.counter.defaultLane);
        a = res.attack;
      }
      if (step.done || st.result) break;
    }
  }
  return attacks;
}

// 상점: 융합 > 새 유물 > 강화 순으로 사고, 체력이 낮으면 회복 먼저
function shopBot(run) {
  const shop = rollShop(run);
  const want = (it) => (it.id === 'heal' ? (run.hp < run.maxHp * 0.55 ? 100 : run.hp < run.maxHp * 0.8 ? 5 : -1) : it.id.startsWith('fuse:') ? 50 : it.id.startsWith('up:') ? 20 : it.id.includes(':') ? 1 : it.id === 'maxhp' ? 4 : it.price >= 16 ? 30 : 2);
  for (;;) {
    const order = shop.items.map((it, i) => [want(it), i]).filter(([w, i]) => w > 0 && !cantBuy(run, shop.items[i])).sort((a, b) => b[0] - a[0]);
    if (!order.length) break;
    buyItem(run, shop, order[0][1]);
  }
}

// 갈림길: 다쳤으면 쉼터, 코인이 넉넉하면 상점, 아니면 사당
function stopBot(run) {
  const stops = rollStops(run);
  const has = (k) => stops.includes(k);
  let k;
  if (run.hp < run.maxHp * 0.55 && has('rest')) k = 'rest';
  else if (has('shop') && run.coins >= 18) k = 'shop';
  else if (has('shrine') && run.hp > 6) k = 'shrine';
  else if (has('rest')) k = 'rest';
  else k = 'shop';
  if (k === 'shop') return shopBot(run);
  if (k === 'rest') {
    const ids = rollRest(run);
    return applyReward(run, run.hp < run.maxHp * 0.7 || ids.length < 2 ? ids[0] : ids[1]);
  }
  const ids = rollShrine(run);
  if (ids.length) takeShrine(run, ids[ids.length - 1].startsWith('fuse:') ? ids[ids.length - 1] : ids[0]);
}

export function playRun(seed, P, opt = {}) {
  const run = createRun(seed, { ...opt, char: process.env.CHAR || 'blade' });
  applyReward(run, rollStartRelics(run)[0]);
  const r = { rng: seed * 101 + 7 };
  const reached = [];
  for (let stage = 0; stage < RUN_LENGTH; stage++) {
    const { st } = createBattle(run.def, battleOptions(run));
    const attacks = playBattle(st, P, r);
    reached.push({ stage, result: st.result, hp: st.player.hp, turns: st.turn, attacks, risky: run.def.risky, kind: run.def.objective.type, reason: st.loseReason });
    recordBattle(run, st);
    if (st.result === 'lose') return { win: false, reached, run };
    bankBattle(run, st);
    if (stage === RUN_LENGTH - 1) break;
    stopBot(run);
    const paths = rollPaths(run);
    advance(run, paths.length > 1 && rand(r) < P.risk ? paths[1] : paths[0]);
  }
  return { win: true, reached, run };
}

const TIER_ARG = Number(process.argv[2]) || 0; // node tools/balance.mjs 2 → 3단계 기준
if (process.argv[1] && process.argv[1].endsWith('balance.mjs')) {
  for (const [name, P] of Object.entries(PROFILES)) {
    const N = 400;
    let wins = 0, coins = 0, relics = 0, timeouts = 0;
    const z = () => Array(RUN_LENGTH).fill(0);
    const lostAt = z(), turns = z(), hpAfter = z(), cnt = z(), atk = z();
    for (let s = 1; s <= N; s++) {
      const res = playRun(s, P, { tier: TIER_ARG, heirloom: TIER_ARG ? 'thunderDrum' : null });
      if (res.win) wins++;
      coins += res.run.totals.coins;
      relics += res.run.relics.length;
      for (const b of res.reached) {
        cnt[b.stage]++;
        turns[b.stage] += b.turns;
        atk[b.stage] += b.attacks;
        hpAfter[b.stage] += b.hp;
        if (b.result === 'lose') { lostAt[b.stage]++; if (b.reason === 'time') timeouts++; }
      }
    }
    const avg = (a) => a.map((v, i) => (cnt[i] ? (v / cnt[i]).toFixed(1) : '-')).join(' / ');
    console.log(`${name.padEnd(8)} 승률 ${((wins / N) * 100).toFixed(0)}%  패배 위치 ${lostAt.join('/')} (시간초과 ${timeouts})  평균 턴 ${avg(turns)}  체력 ${avg(hpAfter)}  피격 ${avg(atk)}  코인 ${(coins / N).toFixed(0)}  유물 ${(relics / N).toFixed(1)}`);
  }
}
