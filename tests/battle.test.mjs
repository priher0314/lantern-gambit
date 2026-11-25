import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBattle, spin, reroll, canReroll, fireShot, previewShot, endPlayerTurn,
  nextEnemyStep, resolveReaction, resolveCounter, previewCounter, computeIntents, decide, alive, describeOmen, canSnipe, reactCost,
} from '../src/core/battle.js';
import { evaluateReels, evaluateLines } from '../src/core/slot.js';
import { BATTLES, BASE_STRIP, RELIC_IDS, FRONT, STAMINA, shotStats } from '../src/core/data.js';
import { judge } from '../src/core/timing.js';
import { createRun, battleOptions, rollRewards, rollStartRelics, applyReward, recordBattle, advance, availableFusions } from '../src/core/run.js';
import { rand, randInt } from '../src/core/rng.js';

const strips = [BASE_STRIP, BASE_STRIP, BASE_STRIP];
const mkDef = (units, objective = { type: 'annihilate' }) => ({ id: 't', name: 't', objective, waves: [{ at: 1, units }] });
const mk = (units, extra = {}) => createBattle(mkDef(units, extra.objective), { seed: 42, hp: 15, maxHp: 15, strips, affinity: false, ...extra }).st;
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

  const st2 = mk([['mask', 1, FRONT]]);
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
  const st = mk([['mask', 1, FRONT]], { guard: 1 });
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
  // 파동은 직격한 적을 한 칸 밀어낸다. 파도 종이 있으면 한 칸 더.
  st = mk([['kasa', 1, 4]]);
  setShots(st, [['wave', 1]]);
  fireShot(st, 0, 1);
  assert.equal(st.enemies[0].row, 3);
  st = mk([['kasa', 1, 4]], { relics: ['tideBell'] });
  setShots(st, [['wave', 1]]);
  fireShot(st, 0, 1);
  assert.equal(st.enemies[0].row, 2);
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

test('빙고 단계: 2줄이면 보너스가 잭팟급(3단계)', () => {
  const strip = ['frost', 'blade', 'frost', 'blade'];
  const { st } = createBattle(mkDef([['kasa', 1, 0]]), { seed: 5, hp: 15, maxHp: 15, strips: [strip, strip, strip] });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    st.phase = 'spin';
    spin(st);
    if (st.bingos.length === 2) {
      ok = true;
      assert.equal(st.bingoLevel, 2 + (st.shots[0].tier === 3 && !st.shots[0].bonus ? 1 : 0));
      assert.ok(st.shots.filter((s) => s.bonus).every((s) => s.tier === 3));
    }
  }
  assert.ok(ok);
});

test('반응: 중독+전격=감전 폭발, 동결+전격=초전도, 중독+파동=확산', () => {
  let st = mk([['kasa', 1, 3], ['kasa', 0, 3]]);
  st.enemies[0].poison = 3;
  setShots(st, [['spark', 1]]);
  let ev = fireShot(st, 0, 1);
  const h = ev.find((e) => e.type === 'hit' && e.tags.includes('detonate'));
  assert.equal(h.dmg, 2 + 3);
  assert.equal(st.enemies[0].poison, 0);
  assert.ok(ev.some((e) => e.type === 'reaction' && e.name === 'detonate'));
  assert.ok(st.enemies[1].maxHp - st.enemies[1].hp >= 3, '옆 적도 폭발 피해');

  st = mk([['kasa', 1, 3], ['kasa', 0, 3], ['kasa', 2, 3]]);
  st.enemies[0].frozen = 1;
  setShots(st, [['spark', 1]]);
  ev = fireShot(st, 0, 1);
  assert.ok(ev.find((e) => e.type === 'hit').tags.includes('conduct'));
  assert.equal(ev.filter((e) => e.type === 'chain').length, 2, '초전도로 연쇄 +1');

  st = mk([['kasa', 1, 3], ['kasa', 0, 3]]);
  st.enemies[0].poison = 4;
  setShots(st, [['wave', 1]]);
  ev = fireShot(st, 0, 1);
  assert.equal(st.enemies[1].poison, 2);
});

test('연속 처치 3번째에 불씨, 유물 강화(II)로 효과 2배, 북 도깨비 지그재그', () => {
  let st = mk([['kasa', 0, 3], ['kasa', 1, 3], ['kasa', 2, 3]]);
  st.enemies.forEach((e) => (e.hp = 1));
  setShots(st, [['wave', 1]]);
  const ev = fireShot(st, 0, 1);
  assert.deepEqual(ev.filter((e) => e.type === 'combo').map((e) => e.n), [2, 3]);
  assert.equal(st.player.embers, 1);

  st = mk([['kasa', 1, 4], ['kasa', 1, 3]], { relics: ['thunderDrum'], relicLv: { thunderDrum: 2 } });
  st.enemies[0].hp = 1;
  setShots(st, [['frost', 1]]);
  fireShot(st, 0, 1);
  assert.equal(st.enemies[1].maxHp - st.enemies[1].hp, 4);

  const run = createRun(3);
  applyReward(run, 'thunderDrum');
  applyReward(run, 'up:thunderDrum');
  assert.equal(battleOptions(run).relicLv.thunderDrum, 2);

  st = mk([['drum', 0, 0]]);
  const it = computeIntents(st)[1];
  assert.equal(it.toLane, 1);
  setShots(st, []);
  endPlayerTurn(st);
  nextEnemyStep(st);
  assert.deepEqual([st.enemies[0].lane, st.enemies[0].row], [1, 1]);
});

test('진화: II 유물이 6번 발동하면 III(효과 3배)', () => {
  const st = mk([['kasa', 1, 0]], { relics: ['gamblerCoin'], relicLv: { gamblerCoin: 2 }, relicProc: { gamblerCoin: 5 } });
  spin(st);
  assert.equal(st.rerollsLeft, 4);
  const ev = reroll(st);
  assert.ok(ev.some((e) => e.type === 'evolve' && e.relic === 'gamblerCoin'));
  assert.equal(st.relicLv.gamblerCoin, 3);
  const run = createRun(1);
  applyReward(run, 'gamblerCoin');
  recordBattle(run, st);
  assert.equal(run.relicLv.gamblerCoin, 3, '진화는 다음 전투로 이어진다');
});

test('융합: 재료 두 개가 모이면 보상에 나오고, 새 효과가 더해진다', () => {
  const run = createRun(2);
  applyReward(run, 'frostbite');
  assert.deepEqual(availableFusions(run), []);
  applyReward(run, 'iceMirror');
  assert.deepEqual(availableFusions(run), ['glacier']);
  assert.ok(rollRewards(run).includes('fuse:glacier'));
  applyReward(run, 'fuse:glacier');
  assert.ok(run.relics.includes('glacier') && run.relics.includes('frostbite'));
  assert.deepEqual(availableFusions(run), []);
  // 빙하: 파쇄 +3 (기본 3 + 고드름 1 + 빙하 3)
  let st = mk([['kasa', 1, 4]], { relics: run.relics });
  st.enemies[0].frozen = 1;
  st.enemies[0].hp = st.enemies[0].maxHp = 30;
  setShots(st, [['blade', 1]]);
  assert.equal(fireShot(st, 0, 1).find((e) => e.type === 'hit').dmg, 3 + 3 + 1 + 3);
  // 역병: 중독이 줄지 않는다
  st = mk([['kasa', 1, 0]], { relics: ['venomFang', 'comboFlute', 'plague'] });
  st.enemies[0].poison = 2;
  st.enemies[0].hp = st.enemies[0].maxHp = 30;
  setShots(st, []);
  endPlayerTurn(st);
  assert.equal(st.enemies[0].poison, 2);
  // 대박: 첫 다시 돌리기는 대가 없음
  st = mk([['kasa', 1, 2]], { relics: ['gamblerCoin', 'bingoBell', 'windfall'] });
  spin(st);
  st.omens[0] = { kind: 'hasten', id: st.enemies[0].id };
  reroll(st);
  assert.equal(st.enemies[0].row, 2);
  // 칼바람: 절단이 양옆에도 1
  st = mk([['kasa', 1, 4], ['kasa', 0, 4], ['kasa', 2, 4]], { relics: ['whetstone', 'tideBell', 'gale'] });
  setShots(st, [['blade', 1]]);
  fireShot(st, 0, 1);
  assert.deepEqual(st.enemies.map((e) => e.maxHp - e.hp), [3, 1, 1]);
});

// ───────── 로그라이크 구조: 밤 생성, 코인, 상점 ─────────
import { generateNight, rollPaths, bankBattle, rollShop, buyItem, cantBuy, rerollShop, shopRerollCost } from '../src/core/run.js';
import { RUN_LENGTH, SHOP_PRICES } from '../src/core/data.js';
import { playRun } from '../tools/balance.mjs';

test('밤 생성: 같은 판이면 같은 구성, 첫 무리는 간격을 두고 선다', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const run = createRun(seed);
    for (let stage = 0; stage < RUN_LENGTH - 1; stage++) {
      for (const risky of [false, true]) {
        const a = generateNight(run, stage, risky);
        assert.deepEqual(a, generateNight(run, stage, risky));
        assert.equal(a.mods.length, risky ? (stage >= 3 ? 2 : 1) : 0);
        const first = a.waves[0].units.filter((u) => u[0] !== 'archer' && u[0] !== 'healer');
        for (const u of a.waves.flatMap((w) => w.units)) assert.ok(u[1] >= 0 && u[1] <= 2 && u[2] >= 0 && u[2] <= 4);
        for (let l = 0; l < 3; l++) {
          const rows = first.filter((u) => u[1] === l).map((u) => u[2]).sort((x, y) => x - y);
          for (let i = 1; i < rows.length; i++) assert.ok(rows[i] - rows[i - 1] >= 2 || rows[i] === 4, `seed ${seed} stage ${stage}`);
        }
      }
    }
    const paths = rollPaths(run);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0].objective.type + paths[0].risky, paths[1].objective.type + paths[1].risky);
  }
  const last = createRun(3);
  last.stage = RUN_LENGTH - 2;
  assert.equal(rollPaths(last)[0].objective.type, 'hunt');
});

test('코인: 그냥 처치는 0, 연속 처치·퍼펙트·절약·클리어로 번다', () => {
  let st = mk([['kasa', 0, 3], ['kasa', 1, 3], ['kasa', 2, 3]]);
  st.enemies.forEach((e) => (e.hp = 1));
  st.def.clearCoins = 4;
  setShots(st, [['wave', 1]]);
  fireShot(st, 0, 1);
  assert.deepEqual(st.coinBy, { combo: 1, thrift: 3, clear: 4 });
  assert.equal(st.result, 'win');
  // 절약: 다시 돌리기를 한 번이라도 쓰면 없다
  st = mk([['kasa', 1, 3]]);
  st.def.clearCoins = 4;
  spin(st);
  reroll(st);
  st.enemies[0].hp = 1;
  setShots(st, [['blade', 1]]);
  fireShot(st, 0, 1);
  assert.equal(st.result, 'win');
  assert.equal(st.coinBy.thrift, undefined);
  // 멧돼지는 앞에 적이 있어도 뛰어넘는다
  st = mk([['boar', 1, 0], ['kasa', 1, 2]]);
  st.enemies[0].charge = true;
  assert.equal(decide(st, st.enemies[0]).steps, FRONT);
  // 퍼펙트
  st = mk([['kasa', 1, 5]]);
  setShots(st, []);
  endPlayerTurn(st);
  nextEnemyStep(st);
  resolveReaction(st, { action: 'guard', grade: 'perfect' });
  assert.equal(st.coinBy.perfect, 1);
  // 험한 길 배율
  const run = createRun(1);
  st.coins = 10;
  st.def.coinMult = 1.5;
  assert.equal(bankBattle(run, st).gained, 15);
  assert.equal(run.coins, 15);
});

test('목표: 세 갈래(레인별 처치), 속전(기한 안에 처치·시간 초과 패배)', () => {
  let st = createBattle({ id: 't', name: 't', objective: { type: 'lanes', need: 1 }, waves: [{ at: 1, units: [['kasa', 0, 3], ['kasa', 1, 3], ['kasa', 2, 3], ['kasa', 0, 0]] }] }, { seed: 1, hp: 15, maxHp: 15, strips }).st;
  st.enemies.forEach((e) => (e.hp = 1));
  setShots(st, [['wave', 1]]);
  fireShot(st, 0, 1);
  assert.equal(st.result, 'win');
  st = createBattle({ id: 't', name: 't', objective: { type: 'rush', kills: 2, turns: 1 }, waves: [{ at: 1, units: [['kasa', 0, 0], ['kasa', 1, 0], ['kasa', 2, 0]] }] }, { seed: 1, hp: 15, maxHp: 15, strips }).st;
  setShots(st, []);
  endPlayerTurn(st);
  for (let i = 0; i < 10 && !st.result; i++) nextEnemyStep(st);
  assert.equal(st.result, 'lose');
  assert.equal(st.loseReason, 'time');
});

test('조건: 보름달(체력), 성난 밤(공격력), 엽전 강화 시 대가가 모자라지 않는다', () => {
  const def = { id: 't', name: 't', objective: { type: 'annihilate' }, mods: ['fullMoon', 'rage'], waves: [{ at: 1, units: [['kasa', 1, 5]] }] };
  let st = createBattle(def, { seed: 1, hp: 15, maxHp: 15, strips }).st;
  assert.equal(st.enemies[0].maxHp, Math.ceil(9 * 1.25));
  assert.equal(computeIntents(st)[1].dmg, 4);
  st = mk([['kasa', 1, 0]], { relics: ['gamblerCoin'], relicLv: { gamblerCoin: 3 } });
  spin(st);
  for (let i = 0; i < 5; i++) reroll(st);
  assert.equal(st.rerollsLeft, 0);
});

test('상점: 코인으로 사고, 모자라면 못 사고, 효과는 바로 적용', () => {
  const run = createRun(11);
  const shop = rollShop(run);
  assert.equal(shop.items.length, 5);
  assert.ok(shop.items.some((it) => it.id.startsWith('train:')), '수련 칸이 있다');
  assert.equal(cantBuy(run, shop.items[0]), '코인 부족');
  assert.equal(buyItem(run, shop, 0), false);
  run.coins = 100;
  const id = shop.items[0].id;
  assert.equal(buyItem(run, shop, 0), true);
  assert.equal(run.coins, 100 - SHOP_PRICES.relic);
  assert.ok(run.relics.includes(id));
  assert.equal(buyItem(run, shop, 0), false, '같은 물건은 한 번만');
  const hi = shop.items.findIndex((it) => it.id === 'heal');
  assert.equal(cantBuy(run, shop.items[hi]), '체력 가득');
  run.hp = 5;
  assert.equal(buyItem(run, shop, hi), true);
  assert.equal(run.hp, 12);
  const before = run.coins;
  assert.equal(rerollShop(run, shop), true);
  assert.equal(run.coins, before - SHOP_PRICES.reroll);
  assert.equal(shopRerollCost(shop), SHOP_PRICES.reroll + 2);
  // 문양 덜기
  const n0 = run.strips[0].length;
  applyReward(run, 'trim:lantern');
  assert.equal(run.strips[0].length, n0 - 1);
});

test('새 흐름 전체 런 80회: 예외 없이 끝난다', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const res = playRun(seed, { react: [0.2, 0.4, 0.2], smart: 0.75, reroll: 0.3, risk: 0.5 });
    const lastB = res.reached[res.reached.length - 1];
    assert.ok(lastB.result === 'win' || lastB.result === 'lose');
    assert.ok(res.run.coins >= 0);
  }
});

test('새 적: 폭죽은 터지고, 약탕은 치유하고, 멧돼지는 돌진한다', () => {
  // 폭죽 도깨비: 쓰러지면 옆의 적에게 3 피해
  let st = mk([['bomber', 1, 3], ['kasa', 0, 3], ['kasa', 1, 2]]);
  setShots(st, [['blade', 2, 2]]);
  const kasaL = st.enemies.find((e) => e.lane === 0);
  const hp0 = kasaL.hp;
  const evs = fireShot(st, 0, 1);
  assert.ok(evs.some((e) => e.type === 'boom'));
  assert.equal(kasaL.hp, hp0 - 3);
  // 약탕 도깨비: 다친 적을 회복, 혼자 남으면 다가온다
  st = mk([['healer', 0, 0], ['kasa', 2, 0]]);
  const kasa = st.enemies.find((e) => e.type === 'kasa');
  const healer = st.enemies.find((e) => e.type === 'healer');
  kasa.hp -= 5;
  assert.equal(decide(st, healer).kind, 'mend');
  st.phase = 'aim';
  endPlayerTurn(st);
  for (let i = 0; i < 4; i++) { const s = nextEnemyStep(st); if (s.done) break; }
  assert.equal(kasa.hp, kasa.maxHp - 2);
  kasa.alive = false;
  assert.equal(decide(st, healer).kind, 'move');
  // 멧돼지: 콧김 → 맨 앞까지 돌진 → 강타(회피), 얼리면 풀린다
  st = mk([['boar', 1, 0]]);
  const boar = st.enemies[0];
  assert.equal(decide(st, boar).kind, 'rev');
  boar.charge = true;
  const d = decide(st, boar);
  assert.equal(d.kind, 'move');
  assert.equal(d.steps, FRONT);
  boar.row = FRONT;
  assert.equal(decide(st, boar).style, 'heavy');
});

test('정예: 더 단단하고 아프며, 처치하면 코인을 준다 · 엽전 꾸러미로 시작', () => {
  const st = mk([['kasa', 1, 3, 'elite'], ['kasa', 0, 3]]);
  const [el, norm] = st.enemies;
  assert.ok(el.elite && el.maxHp > norm.maxHp && el.atkUp === 1);
  setShots(st, [['blade', 3, 3]]);
  el.hp = 1;
  const c0 = st.coins;
  fireShot(st, 0, 1);
  assert.ok(st.coinBy.elite === 3 && st.coins >= c0 + 3);
  const run = createRun(5);
  applyReward(run, 'purse');
  assert.equal(run.coins, 15);
  assert.equal(run.relics.length, 0);
});

test('단계: 높을수록 적이 단단하고 아프며, 유물 하나를 가져간다', () => {
  const a = createRun(9);
  const b = createRun(9, { tier: 2, heirloom: 'thunderDrum' });
  assert.deepEqual(b.relics, ['thunderDrum']);
  assert.ok(b.def.hpScale > a.def.hpScale);
  assert.equal(b.def.atkUp, 1);
  const st = createBattle(b.def, battleOptions(b)).st;
  assert.ok(st.enemies.every((e) => e.atkUp >= 1));
  assert.ok(!rollStartRelics(b).includes('thunderDrum'));
  const boss = createBattle(rollPaths({ ...b, stage: RUN_LENGTH - 2 })[0], battleOptions(b)).st.enemies.find((e) => e.type === 'elder');
  assert.equal(boss.maxHp, Math.ceil(80 * 1.3));
});

test('상성: 약점은 +2(번지는 피해 +1), 저항은 직격 -1', () => {
  const on = (units) => mk(units, { affinity: true });
  // 우산 도깨비: 절단에 약하고 파동을 튕겨 낸다
  let st = on([['kasa', 0, 4]]);
  setShots(st, [['blade', 1], ['wave', 1]]);
  let ev = fireShot(st, 0, 0);
  assert.equal(ev.find((e) => e.type === 'hit').dmg, 5);
  assert.ok(ev.find((e) => e.type === 'hit').tags.includes('bane'));
  ev = fireShot(st, 1, 0);
  assert.equal(ev.find((e) => e.type === 'hit').dmg, 1);
  assert.ok(ev.find((e) => e.type === 'hit').tags.includes('resist'));
  // 번지는 피해: 약점은 +1, 저항은 적용하지 않는다
  st = on([['mask', 1, 4], ['drum', 0, 4], ['kasa', 2, 4]]);
  st.enemies[0].shieldHp = 0;
  setShots(st, [['wave', 1]]);
  fireShot(st, 0, 1);
  assert.equal(st.enemies[1].maxHp - st.enemies[1].hp, 2, '북 도깨비: 파동 옆 피해 1 + 약점 1');
  assert.equal(st.enemies[2].maxHp - st.enemies[2].hp, 1, '우산 도깨비: 옆 피해는 저항 없이 1');
  // 초롱불: 동결에 약하다(피해 1 → 3)
  st = on([['archer', 1, 1]]);
  setShots(st, [['frost', 1]]);
  fireShot(st, 0, 1);
  assert.equal(st.enemies[0].maxHp - st.enemies[0].hp, 3);
});

test('저격: 턴마다 한 번, 맨 앞이 아닌 적을 골라 맞힌다', () => {
  let st = mk([['kasa', 0, 5], ['kasa', 0, 3], ['kasa', 0, 1]]);
  setShots(st, [['frost', 1], ['blade', 1], ['blade', 2]]);
  assert.equal(st.snipes, 1);
  assert.equal(canSnipe(st, 0), true);
  assert.equal(canSnipe(st, 2), false, '레인 전체 공격은 고를 필요가 없다');
  // 미리보기는 저격 횟수를 쓰지 않는다
  previewShot(st, 0, 0, 2);
  assert.equal(st.snipes, 1);
  let ev = fireShot(st, 0, 0, 2);
  assert.ok(ev.some((e) => e.type === 'snipe'));
  assert.equal(st.enemies[2].frozen > 0, true, '맨 뒤 적이 얼었다');
  assert.equal(st.enemies[0].frozen, 0);
  assert.equal(st.snipes, 0);
  // 이번 턴에는 더 못 쓴다 → 맨 앞부터 맞는다
  ev = fireShot(st, 1, 0, 1);
  assert.ok(!ev.some((e) => e.type === 'snipe'));
  assert.equal(st.enemies[0].maxHp - st.enemies[0].hp, 3);
  // 절단 저격: 고른 적부터 뒤쪽으로 관통
  st = mk([['kasa', 0, 5], ['kasa', 0, 3], ['kasa', 0, 1]]);
  setShots(st, [['blade', 1]]);
  fireShot(st, 0, 0, 1);
  assert.deepEqual(st.enemies.map((e) => e.maxHp - e.hp), [0, 3, 3]);
  // 적이 하나뿐이면 저격이 아니다(횟수를 쓰지 않는다)
  st = mk([['kasa', 1, 4]]);
  setShots(st, [['blade', 1]]);
  fireShot(st, 0, 1, 2);
  assert.equal(st.snipes, 1);
});

test('기력: 막기 1, 회피 2(퍼펙트 회피 1). 모자라면 타이밍이 맞아도 맞는다', () => {
  const st = mk([['kasa', 1, 5]]);
  assert.equal(st.player.stamina, STAMINA.max);
  assert.equal(reactCost('guard', 'perfect'), 1);
  assert.equal(reactCost('dodge', 'perfect'), 1);
  assert.equal(reactCost('guard', 'good'), 1);
  assert.equal(reactCost('dodge', 'good'), 2);
  assert.equal(reactCost('dodge', 'miss'), 0);
  setShots(st, []);
  endPlayerTurn(st);
  nextEnemyStep(st);
  resolveReaction(st, { action: 'dodge', grade: 'good' });
  assert.equal(st.player.stamina, STAMINA.max - 2);
  assert.equal(st.player.hp, 15);
  // 기력이 바닥나면 회피가 통하지 않는다
  const st2 = mk([['kasa', 1, 5]]);
  st2.player.stamina = 1;
  setShots(st2, []);
  endPlayerTurn(st2);
  nextEnemyStep(st2);
  const res = resolveReaction(st2, { action: 'dodge', grade: 'good' });
  assert.equal(res.events.find((e) => e.type === 'react').outcome, 'tired');
  assert.ok(st2.player.hp < 15);
  assert.equal(st2.player.stamina, 1, '실패하면 기력은 쓰지 않는다');
  // 기력이 0이면 퍼펙트 막기도 통하지 않는다
  const st3 = mk([['kasa', 1, 5]]);
  st3.player.stamina = 0;
  setShots(st3, []);
  endPlayerTurn(st3);
  nextEnemyStep(st3);
  resolveReaction(st3, { action: 'guard', grade: 'perfect' });
  assert.ok(st3.player.hp < 15);
  // 등불은 기력도 채운다
  const st4 = mk([['kasa', 1, 0]]);
  st4.player.stamina = 1;
  setShots(st4, [['lantern', 1]]);
  fireShot(st4, 0, 1);
  assert.equal(st4.player.stamina, 2);
});

test('조합: 젖음 → 전격 +2, 젖음 → 동결 +1턴, 중독 → 절단 중독 +2', () => {
  let st = mk([['kasa', 1, 4]]);
  setShots(st, [['wave', 1], ['spark', 1]]);
  fireShot(st, 0, 1);
  assert.equal(st.enemies[0].wet, 2);
  let ev = fireShot(st, 1, 1);
  assert.equal(ev.find((e) => e.type === 'hit').dmg, 4);
  assert.ok(ev.find((e) => e.type === 'hit').tags.includes('surge'));
  assert.equal(st.enemies[0].wet, 0);
  st = mk([['kasa', 1, 4]]);
  setShots(st, [['wave', 1], ['frost', 1]]);
  fireShot(st, 0, 1);
  fireShot(st, 1, 1);
  assert.equal(st.enemies[0].frozen, 2);
  st = mk([['kasa', 1, 4]]);
  setShots(st, [['venom', 1], ['blade', 1]]);
  fireShot(st, 0, 1);
  const p0 = st.enemies[0].poison;
  fireShot(st, 1, 1);
  assert.equal(st.enemies[0].poison, p0 + 2);
});


test('수련: 상점에서 사면 그 기술이 강해진다', () => {
  assert.equal(shotStats('blade', 1, 0, 2).dmg, shotStats('blade', 1).dmg + 2);
  assert.equal(shotStats('venom', 1, 0, 1).poison, shotStats('venom', 1).poison + 1);
  const run = createRun(5);
  applyReward(run, 'train:blade');
  assert.equal(run.symLv.blade, 1);
  const st = createBattle(mkDef([['kasa', 1, 4]]), { ...battleOptions(run), affinity: false }).st;
  setShots(st, [['blade', 1]]);
  fireShot(st, 0, 1);
  assert.equal(st.enemies[0].maxHp - st.enemies[0].hp, 4);
});

test('캐릭터: 폭탄꾼의 릴에는 절단 대신 폭탄이 있고, 폭탄은 맨 뒤 적에게 떨어져 방패를 무시한다', () => {
  const run = createRun(9, { char: 'bomb' });
  assert.ok(run.strips.every((s) => s.includes('bomb') && !s.includes('blade')));
  assert.ok(createRun(9).strips.every((s) => s.includes('blade') && !s.includes('bomb')));
  // 맨 뒤 적 직격 3, 앞뒤·양옆 2
  let st = mk([['kasa', 1, 5], ['kasa', 1, 2], ['kasa', 0, 2], ['kasa', 1, 1]]);
  setShots(st, [['bomb', 1]]);
  fireShot(st, 0, 1);
  assert.deepEqual(st.enemies.map((e) => e.maxHp - e.hp), [0, 2, 0, 3]);
  // 탈 방패를 무시한다
  st = mk([['mask', 1, 3]]);
  setShots(st, [['bomb', 1]]);
  const ev = fireShot(st, 0, 1);
  assert.ok(!ev.some((e) => e.type === 'block'));
  assert.equal(st.enemies[0].maxHp - st.enemies[0].hp, 3);
});

// ───────── 갈림길(분기 방) ─────────
import { rollStops, rollRest, rollShrine, takeShrine, shrineCost } from '../src/core/run.js';
import { SHRINE_COST } from '../src/core/data.js';

test('갈림길: 두 곳이 열리고, 같은 판이면 같은 결과, 첫 갈림길과 보스 앞에는 상점이 있다', () => {
  let shopless = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const run = createRun(seed);
    let prevNoShop = false;
    for (let stage = 0; stage < RUN_LENGTH - 1; stage++) {
      run.stage = stage;
      const a = rollStops(run);
      assert.equal(a.length, 2);
      assert.deepEqual(a, rollStops(run));
      assert.ok(a.every((k) => ['shop', 'rest', 'shrine'].includes(k)));
      const noShop = !a.includes('shop');
      if (stage === 0) assert.ok(!noShop);
      if (stage === RUN_LENGTH - 2) assert.deepEqual(a, ['shop', 'rest']);
      assert.ok(!(noShop && prevNoShop), '상점이 두 번 연달아 빠지면 안 된다');
      prevNoShop = noShop;
      if (noShop) shopless++;
    }
  }
  assert.ok(shopless > 0, '상점이 없는 갈림길도 나온다');
});

test('쉼터: 쉬면 체력 +8, 체력이 가득이면 최대 체력으로 바뀐다. 수련은 거저', () => {
  const run = createRun(5);
  run.hp = 3;
  const ids = rollRest(run);
  assert.equal(ids[0], 'rest');
  assert.ok(ids.slice(1).every((id) => id.startsWith('train:')));
  applyReward(run, 'rest');
  assert.equal(run.hp, 11);
  const coins = run.coins;
  applyReward(run, ids[1]);
  assert.equal(run.symLv[ids[1].slice(6)], 1);
  assert.equal(run.coins, coins);
  run.hp = run.maxHp;
  assert.equal(rollRest(run)[0], 'maxhp');
});

test('사당: 유물을 받고 체력을 바친다(1 아래로는 내려가지 않는다)', () => {
  const run = createRun(9);
  const ids = rollShrine(run);
  assert.equal(ids.length, 2);
  const hp = run.hp;
  takeShrine(run, ids[0]);
  assert.equal(run.hp, hp - SHRINE_COST);
  assert.ok(run.relics.includes(ids[0]));
  run.hp = 2;
  assert.equal(shrineCost(run), 1);
  takeShrine(run, rollShrine(run)[0]);
  assert.equal(run.hp, 1);
});
