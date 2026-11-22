import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBattle, spin, reroll, canReroll, fireShot, previewShot, endPlayerTurn,
  nextEnemyStep, resolveReaction, resolveCounter, previewCounter, computeIntents, decide, alive, describeOmen,
} from '../src/core/battle.js';
import { evaluateReels, evaluateLines } from '../src/core/slot.js';
import { BATTLES, BASE_STRIP, RELIC_IDS } from '../src/core/data.js';
import { judge } from '../src/core/timing.js';
import { createRun, battleOptions, rollRewards, rollStartRelics, applyReward, recordBattle, advance } from '../src/core/run.js';
import { rand, randInt } from '../src/core/rng.js';

const strips = [BASE_STRIP, BASE_STRIP, BASE_STRIP];
const mkDef = (units, objective = { type: 'annihilate' }) => ({ id: 't', name: 't', objective, waves: [{ at: 1, units }] });
const mk = (units, extra = {}) => createBattle(mkDef(units, extra.objective), { seed: 42, hp: 15, maxHp: 15, strips, ...extra }).st;
const setShots = (st, shots) => {
  st.phase = 'aim';
  st.shots = shots.map(([symbol, tier, gild = 0], i) => ({ id: String(i), symbol, tier, gild, reels: [i], used: false }));
};

test('슬롯: 인접 연결과 잭팟 판정', () => {
  const r = (a, b, c) => [a, b, c].map((symbol) => ({ symbol, gilded: false }));
  assert.deepEqual(evaluateReels(r('blade', 'blade', 'blade')).map((s) => s.tier), [3]);
  assert.deepEqual(evaluateReels(r('blade', 'blade', 'wave')).map((s) => [s.symbol, s.tier]), [['blade', 2], ['wave', 1]]);
  assert.deepEqual(evaluateReels(r('wave', 'frost', 'frost')).map((s) => [s.symbol, s.tier]), [['wave', 1], ['frost', 2]]);
  // 양 끝만 같으면 연결 아님
  assert.deepEqual(evaluateReels(r('spark', 'wave', 'spark')).map((s) => s.tier), [1, 1, 1]);
  const g = evaluateReels([{ symbol: 'blade', gilded: true }, { symbol: 'blade', gilded: true }, { symbol: 'wave', gilded: false }]);
  assert.equal(g[0].gild, 2);
});

test('절단: 관통 2, 탈 방패에 막힘', () => {
  const st = mk([['kasa', 0, 5], ['kasa', 0, 4], ['kasa', 0, 3]]);
  setShots(st, [['blade', 1]]);
  const ev = fireShot(st, 0, 0);
  const hits = ev.filter((e) => e.type === 'hit');
  assert.equal(hits.length, 2);
  assert.deepEqual(st.enemies.map((e) => e.maxHp - e.hp), [3, 3, 0]);

  const st2 = mk([['mask', 1, 5], ['kasa', 1, 3]]);
  setShots(st2, [['blade', 1]]);
  const ev2 = fireShot(st2, 0, 1);
  assert.ok(ev2.some((e) => e.type === 'block'));
  assert.equal(ev2.filter((e) => e.type === 'hit').length, 0, '방패 뒤의 적도 보호');
});

test('파동: 측면 피해는 방패를 무시', () => {
  const st = mk([['kasa', 0, 4], ['mask', 1, 4]]);
  setShots(st, [['wave', 1]]);
  fireShot(st, 0, 0);
  const mask = st.enemies.find((e) => e.type === 'mask');
  assert.equal(mask.maxHp - mask.hp, 1);
});

test('동결 → 절단 = 파쇄 (+3, 파편), 순서가 중요', () => {
  const st = mk([['kasa', 1, 4], ['kasa', 0, 4]]);
  setShots(st, [['frost', 1], ['blade', 1]]);
  fireShot(st, 0, 1); // 동결 1
  const ev = fireShot(st, 1, 1); // 3 + 3 파쇄
  const h = ev.find((e) => e.type === 'hit' && e.tags.includes('shatter'));
  assert.ok(h);
  assert.equal(h.dmg, 6);
  const side = st.enemies.find((e) => e.lane === 0);
  assert.equal(side.maxHp - side.hp, 1, '얼음 파편이 옆 적에게 1');
});

test('동결은 조준을 끊고 적 행동을 건너뛴다', () => {
  const st = mk([['archer', 1, 1]]);
  st.enemies[0].charge = true;
  setShots(st, [['frost', 1]]);
  const ev = fireShot(st, 0, 1);
  assert.ok(ev.some((e) => e.type === 'interrupt'));
  assert.equal(st.enemies[0].charge, false);
  assert.equal(decide(st, st.enemies[0]).kind, 'frozen');
});

test('전격 연쇄: 같은 적을 두 번 맞히지 않음, 처치 중복 집계 없음', () => {
  const st = mk([['kasa', 1, 5], ['kasa', 1, 4], ['kasa', 0, 4], ['kasa', 2, 4]]);
  st.enemies.forEach((e) => (e.hp = 1));
  setShots(st, [['spark', 2, 0]]);
  const ev = fireShot(st, 0, 1);
  const ids = ev.filter((e) => e.type === 'hit').map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ev.filter((e) => e.type === 'kill').length, 4);
  assert.equal(st.kills, 4);
});

test('죽은 적은 다시 피해/처치되지 않음 (잭팟 전체 공격 + 파편)', () => {
  const st = mk([['kasa', 1, 4], ['kasa', 0, 4], ['kasa', 2, 4]]);
  st.enemies.forEach((e) => { e.hp = 1; e.frozen = 1; });
  setShots(st, [['wave', 3]]);
  const ev = fireShot(st, 0, 1);
  assert.equal(ev.filter((e) => e.type === 'kill').length, 3);
  assert.equal(st.kills, 3);
});

test('미리보기 == 실제 결과 (무작위 상태 600회)', () => {
  const syms = ['blade', 'wave', 'frost', 'spark', 'lantern', 'venom'];
  const types = ['kasa', 'mask', 'archer'];
  for (let s = 1; s <= 600; s++) {
    const r = { rng: s * 7 + 3 };
    const units = [];
    const used = new Set();
    const n = 1 + randInt(r, 7);
    for (let i = 0; i < n; i++) {
      const l = randInt(r, 3), row = randInt(r, 6);
      if (used.has(l + ',' + row)) continue;
      used.add(l + ',' + row);
      units.push([types[randInt(r, 3)], l, row]);
    }
    const st = mk(units, { relics: RELIC_IDS.filter(() => rand(r) < 0.35) });
    st.enemies.forEach((e) => {
      if (rand(r) < 0.3) e.frozen = 1;
      if (rand(r) < 0.2) e.exposed = true;
      if (rand(r) < 0.2) e.poison = 2;
      e.hp = 1 + randInt(r, e.maxHp);
    });
    setShots(st, [[syms[randInt(r, 6)], 1 + randInt(r, 3), randInt(r, 2)]]);
    const lane = randInt(r, 3);
    const pv = previewShot(st, 0, lane);
    const real = fireShot(st, 0, lane);
    assert.deepEqual(pv.events, real, 'seed ' + s);
  }
});

test('같은 시드 + 같은 입력 = 같은 전투 (결정성)', () => {
  const play = () => {
    const { st } = createBattle(BATTLES[0], { seed: 777, hp: 15, maxHp: 15, strips });
    const log = [];
    for (let t = 0; t < 6 && !st.result; t++) {
      log.push(...spin(st));
      if (canReroll(st)) log.push(...reroll(st));
      st.shots.forEach((_, i) => { if (!st.result) log.push(...fireShot(st, i, i % 3)); });
      if (st.result) break;
      log.push(...endPlayerTurn(st));
      if (st.result) break;
      for (let g = 0; g < 50; g++) {
        const r = nextEnemyStep(st);
        log.push(...r.events);
        let a = r.attack;
        while (a) {
          const res = resolveReaction(st, { action: 'guard', grade: 'perfect' });
          log.push(...res.events);
          if (res.counter) log.push(...resolveCounter(st, 1));
          a = res.attack;
        }
        if (r.done || st.result) break;
      }
    }
    return JSON.stringify(log);
  };
  assert.equal(play(), play());
});

test('재굴림: 흉조 예고대로 적용되고 금빛 릴이 늘어남', () => {
  const st = mk([['kasa', 1, 2]]);
  spin(st);
  st.omens = [{ kind: 'hasten', id: st.enemies[0].id }, { kind: 'summon', lane: 2 }];
  const d = describeOmen(st, st.omens[0]);
  assert.match(d.text, /전진/);
  reroll(st);
  assert.equal(st.enemies[0].row, 3);
  assert.equal(st.reels.filter((r) => r.gilded).length, 1);
  reroll(st);
  assert.equal(alive(st).length, 2);
  assert.equal(st.reels.filter((r) => r.gilded).length, 2);
  assert.equal(canReroll(st), false);
  fireShot(st, 0, 0);
  assert.throws(() => reroll(st));
});

test('우산 도깨비: 체력이 가득하면 2칸, 깎이면 1칸', () => {
  const st = mk([['kasa', 0, 0]]);
  assert.deepEqual(computeIntents(st)[1], { kind: 'move', steps: 2, hop: true });
  st.enemies[0].hp = 3;
  assert.equal(computeIntents(st)[1].steps, 1);
});

test('반응: 퍼펙트 막기 → 피해 0 + 되치기 + 불씨, 회피 → 노출', () => {
  const st = mk([['kasa', 1, 5], ['kasa', 1, 3]]);
  setShots(st, []);
  endPlayerTurn(st);
  const r = nextEnemyStep(st);
  assert.equal(r.attack.style, 'melee');
  const res = resolveReaction(st, { action: 'guard', grade: 'perfect' });
  assert.equal(st.player.hp, 15);
  assert.equal(st.player.embers, 1);
  assert.ok(res.counter);
  const pv = previewCounter(st, 1);
  const ev = resolveCounter(st, 1);
  assert.deepEqual(pv.events, ev);
  assert.equal(ev.filter((e) => e.type === 'hit').length, 2, '되치기는 레인 전체 관통');

  const st2 = mk([['mask', 1, 5]]);
  st2.enemies[0].braced = true;
  setShots(st2, []);
  endPlayerTurn(st2);
  const r2 = nextEnemyStep(st2);
  assert.equal(r2.attack.style, 'heavy');
  resolveReaction(st2, { action: 'dodge', grade: 'good' });
  assert.equal(st2.player.hp, 15);
  assert.equal(st2.enemies[0].exposed, true);
});

test('강공격은 일반 막기로 못 막음, 방어막이 먼저 흡수', () => {
  const st = mk([['mask', 1, 5]], { guard: 1 });
  st.enemies[0].braced = true;
  setShots(st, []);
  endPlayerTurn(st);
  nextEnemyStep(st);
  resolveReaction(st, { action: 'guard', grade: 'good' });
  assert.equal(st.player.guard, 0);
  assert.equal(st.player.hp, 11);
});

test('타이밍 판정 창', () => {
  assert.equal(judge('guard', 10), 'perfect');
  assert.equal(judge('guard', -150), 'good');
  assert.equal(judge('guard', 300), 'miss');
  assert.equal(judge('dodge', 70), 'good');
  assert.equal(judge('dodge', 140), 'miss');
});

test('보상: 선택한 효과가 즉시 반영, 체력 이월', () => {
  const run = createRun(5);
  run.hp = 6;
  applyReward(run, 'heal');
  assert.equal(run.hp, 13);
  const before = run.strips[0].length;
  applyReward(run, 'stripFrost');
  assert.equal(run.strips[0].length, before + 1);
  applyReward(run, 'emberWick');
  const { st } = createBattle(BATTLES[1], battleOptions(run));
  assert.equal(st.player.embers, 1);
  assert.equal(st.player.hp, 13);
  spin(st);
  assert.equal(st.reels.filter((r) => r.gilded).length, 1);
  const opts = rollRewards(run);
  assert.equal(opts.length, 3);
  assert.ok(!opts.includes('emberWick'), '이미 가진 유물은 다시 나오지 않음');
  assert.equal(rollStartRelics(createRun(9)).length, 3);
});

// 무작위 봇으로 전 전투를 끝까지 진행 — 무한 루프·예외·상태 불일치 탐지
test('봇 전체 런 300회: 예외 없이 종료, 처치 수 일관', () => {
  let wins = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const run = createRun(seed);
    applyReward(run, rollStartRelics(run)[0]);
    const r = { rng: seed * 13 };
    let lost = false;
    for (let stage = 0; stage < BATTLES.length && !lost; stage++) {
      const { st } = createBattle(BATTLES[stage], battleOptions(run));
      let guardSteps = 0;
      while (!st.result) {
        assert.ok(++guardSteps < 400, 'battle too long');
        spin(st);
        while (canReroll(st) && rand(r) < 0.3) reroll(st);
        for (let i = 0; i < st.shots.length && !st.result; i++) {
          const lanes = [0, 1, 2].map((l) => [l, previewShot(st, i, l).summary]);
          lanes.sort((a, b) => Object.values(b[1].per).reduce((s, p) => s + p.dmg, 0) - Object.values(a[1].per).reduce((s, p) => s + p.dmg, 0));
          fireShot(st, i, lanes[0][0]);
        }
        if (st.result) break;
        endPlayerTurn(st);
        if (st.result) break;
        for (let g = 0; g < 100; g++) {
          const step = nextEnemyStep(st);
          let a = step.attack;
          while (a) {
            const x = rand(r);
            const input = x < 0.35 ? { action: 'guard', grade: 'perfect' } : x < 0.6 ? { action: 'guard', grade: 'good' } : x < 0.8 ? { action: 'dodge', grade: 'good' } : { action: null, grade: 'miss' };
            const res = resolveReaction(st, input);
            if (res.counter) resolveCounter(st, randInt(r, 3));
            a = res.attack;
          }
          if (step.done || st.result) break;
          assert.ok(g < 99);
        }
      }
      const dead = st.enemies.filter((e) => !e.alive).length;
      assert.equal(st.kills, dead, 'kill count == dead enemies');
      assert.ok(st.player.hp >= 0 && st.player.hp <= st.player.maxHp);
      if (st.result === 'lose') lost = true;
      else {
        recordBattle(run, st);
        if (stage < BATTLES.length - 1) applyReward(run, rollRewards(run)[0]);
        advance(run);
      }
    }
    if (!lost) wins++;
  }
  console.log(`  봇 승률(대략적 난이도 지표): ${wins}/300`);
});

test('유물 [천둥 북]: 처치 → 가까운 적에게 번개, 연쇄 처치도 한 번씩만 집계', () => {
  const st = mk([['kasa', 1, 5], ['kasa', 1, 4], ['kasa', 0, 4], ['kasa', 2, 2]], { relics: ['thunderDrum'] });
  st.enemies.forEach((e) => (e.hp = 2));
  setShots(st, [['frost', 1, 1]]); // 피해 2
  const ev = fireShot(st, 0, 1);
  assert.ok(ev.some((e) => e.type === 'relic' && e.relic === 'thunderDrum'));
  const kills = ev.filter((e) => e.type === 'kill').length;
  assert.equal(st.kills, kills);
  assert.equal(st.kills, st.enemies.filter((e) => !e.alive).length);
  assert.ok(kills >= 3, '연쇄 처치');
  assert.ok(kills <= 4);
});

test('유물 [서리 방울]: 파쇄 파편에 맞은 적이 얼어붙는다', () => {
  const st = mk([['kasa', 1, 4], ['kasa', 0, 4]], { relics: ['frostbite'] });
  st.enemies[0].frozen = 1;
  setShots(st, [['blade', 1]]);
  fireShot(st, 0, 1);
  assert.equal(st.enemies[1].frozen, 1);
});

test('유물 [되치기 거울]·[도박꾼의 엽전]·[달빛 숫돌]·[그림자 신]·[등잔 기름병]·[파도 방울]', () => {
  // 되치기 거울: 되치기 5 피해 + 퍼펙트 막기 방어막
  let st = mk([['kasa', 1, 5]], { relics: ['counterMirror'] });
  setShots(st, []);
  endPlayerTurn(st);
  nextEnemyStep(st);
  resolveReaction(st, { action: 'guard', grade: 'perfect' });
  assert.equal(st.player.guard, 1);
  const ev = resolveCounter(st, 1);
  assert.equal(ev.find((e) => e.type === 'hit').dmg, 5);
  // 엽전: 재굴림 3회 + 방어막
  st = mk([['kasa', 1, 0]], { relics: ['gamblerCoin'] });
  spin(st);
  assert.equal(st.rerollsLeft, 3);
  reroll(st);
  assert.equal(st.player.guard, 1);
  // 숫돌: 관통 3
  st = mk([['kasa', 0, 5], ['kasa', 0, 4], ['kasa', 0, 3]], { relics: ['whetstone'] });
  setShots(st, [['blade', 1]]);
  assert.equal(fireShot(st, 0, 0).filter((e) => e.type === 'hit').length, 3);
  // 그림자 신: 회피 시 2 피해 후 노출
  st = mk([['kasa', 1, 5]], { relics: ['shadowShoes'] });
  setShots(st, []);
  endPlayerTurn(st);
  nextEnemyStep(st);
  resolveReaction(st, { action: 'dodge', grade: 'good' });
  assert.equal(st.enemies[0].maxHp - st.enemies[0].hp, 2);
  assert.equal(st.enemies[0].exposed, true);
  // 기름병: 등불 회복 +1
  st = mk([['kasa', 1, 0]], { relics: ['oilFlask'], hp: 10 });
  setShots(st, [['lantern', 1]]);
  fireShot(st, 0, 1);
  assert.equal(st.player.hp, 11);
  // 파도 방울: 직격 적 밀림
  st = mk([['kasa', 1, 4]], { relics: ['tideBell'] });
  setShots(st, [['wave', 1]]);
  fireShot(st, 0, 1);
  assert.equal(st.enemies[0].row, 3);
});

test('탈 방패: 정면에서 두 번 맞으면 깨진다(혼자 남아도 처치 가능)', () => {
  const st = mk([['mask', 1, 3]]);
  setShots(st, [['blade', 1], ['blade', 1], ['blade', 1]]);
  const e1 = fireShot(st, 0, 1);
  assert.equal(e1.find((e) => e.type === 'block').left, 1);
  const e2 = fireShot(st, 1, 1);
  assert.equal(e2.find((e) => e.type === 'block').broke, true);
  const e3 = fireShot(st, 2, 1);
  assert.equal(e3.filter((e) => e.type === 'hit').length, 1);
  // 연결 기술은 한 번에 깬다
  const st2 = mk([['mask', 1, 3]]);
  st2.phase = 'aim';
  st2.shots = [{ id: 'x', symbol: 'blade', tier: 2, gild: 0, reels: [0, 1], used: false }];
  assert.equal(fireShot(st2, 0, 1).find((e) => e.type === 'block').broke, true);
});

test('중독: 턴 종료마다 수치만큼 피해 후 1 감소, 방패 무시, 처치 집계', () => {
  const st = mk([['kasa', 1, 2], ['kasa', 0, 0]]);
  setShots(st, [['venom', 1]]);
  fireShot(st, 0, 1);
  const k = st.enemies[0];
  assert.equal(k.poison, 3);
  assert.equal(k.maxHp - k.hp, 1);
  const ev = endPlayerTurn(st);
  assert.ok(ev.some((e) => e.type === 'poisonTick'));
  assert.equal(k.maxHp - k.hp, 4);
  assert.equal(k.poison, 2);
  // 중독으로 마지막 적이 죽으면 그 자리에서 승리
  const st2 = mk([['kasa', 1, 2]]);
  st2.enemies[0].hp = 2;
  st2.enemies[0].poison = 3;
  setShots(st2, []);
  endPlayerTurn(st2);
  assert.equal(st2.result, 'win');
  assert.equal(st2.kills, 1);
});

test('3×3 빙고: 가운데 줄 외의 가로·세로·대각선', () => {
  const g = [['blade', 'wave', 'frost'], ['spark', 'blade', 'frost'], ['venom', 'wave', 'blade']];
  assert.deepEqual(evaluateLines(g).map((l) => l.id), ['d0']);
  const g2 = [['frost', 'wave', 'blade'], ['frost', 'spark', 'blade'], ['frost', 'wave', 'blade']];
  assert.deepEqual(evaluateLines(g2).map((l) => l.id).sort(), ['r0', 'r2']);
  // 빙고가 뜨면 보너스 기술이 패에 추가된다
  const strip = ['frost', 'blade', 'frost', 'blade'];
  const { st } = createBattle(mkDef([['kasa', 1, 0]]), { seed: 3, hp: 15, maxHp: 15, strips: [strip, strip, strip] });
  let found = false;
  for (let i = 0; i < 40 && !found; i++) {
    st.phase = 'spin';
    spin(st);
    found = st.shots.some((s) => s.bonus);
    if (found) {
      const bi = st.shots.findIndex((s) => s.bonus);
      const pv = previewShot(st, bi, 1);
      assert.deepEqual(pv.events, fireShot(st, bi, 1));
    }
  }
  assert.ok(found);
});
