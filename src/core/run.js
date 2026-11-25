// 한 판(런) 진행: 전투 순서, 체력 이월, 릴 구성, 유물, 보상
import { randInt, shuffle } from './rng.js';
import {
  BATTLES, BASE_STRIP, REWARDS, RELICS, RELIC_IDS, FUSIONS, FUSION_IDS,
  RUN_LENGTH, NIGHT_NAMES, OBJ_INFO, MODS, COIN, SHOP_PRICES, SYMBOLS, LANES, START_PURSE, TIER, MAX_TIER, SYMBOL_IDS, TRAIN_MAX, TRAIN_TEXT, CHARACTERS, symbolsOf, SHRINE_COST, REST_HEAL } from './data.js';

export function createRun(seed, opt = {}) {
  const run = {
    seed: seed >>> 0 || 1,
    rng: seed >>> 0 || 1,
    tier: Math.max(0, Math.min(MAX_TIER, opt.tier || 0)), // 단계(높을수록 어렵다)
    heirloom: null, // 지난 판에서 가져온 유물
    char: CHARACTERS[opt.char] ? opt.char : 'blade', // 캐릭터(고유 기술이 다르다)
    symLv: {},
    stage: 0,
    hp: 15,
    maxHp: 15,
    strips: [],
    relics: [],
    relicLv: {},
    relicProc: {},
    picks: [],
    coins: 0,
    def: null, // 지금 치르는 밤
    totals: { kills: 0, perfect: 0, counters: 0, jackpots: 0, bingos: 0, shatters: 0, dmgDealt: 0, turns: 0, score: 0, coins: 0 },
  };
  // 릴의 절단 자리는 캐릭터의 고유 기술로 채운다
  const sig = CHARACTERS[run.char].sig;
  run.strips = [0, 1, 2].map(() => makeStrip(run).map((s) => (s === 'blade' ? sig : s)));
  if (opt.heirloom && RELICS[opt.heirloom] && !FUSIONS[opt.heirloom] && relicFits(run, opt.heirloom)) {
    run.relics.push(opt.heirloom);
    run.heirloom = opt.heirloom;
  }
  run.def = generateNight(run, 0, false);
  return run;
}

// ───────────────────────── 밤 생성 ─────────────────────────
// 같은 판(seed)·같은 밤·같은 길이면 항상 같은 구성이 나온다.

const UNIT_COST = { kasa: 2, drum: 2, archer: 2, mask: 3, bomber: 2, healer: 3, boar: 3 };
const ELITE_COST = 2;
const BUDGET = [14, 20, 25, 29, 33]; // 밤이 깊어질수록 적이 많아지고
const HP_SCALE = [1, 1.15, 1.33, 1.46, 1.6, 1.55]; // 단단해진다(마지막은 보스의 부하들)

function pickWeighted(r, table) {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let x = randInt(r, total);
  for (const [v, w] of table) {
    if (x < w) return v;
    x -= w;
  }
  return table[0][0];
}

// 단계에 따른 강화값
function tierMods(run) {
  const t = run.tier || 0;
  return { tier: t, atkUp: Math.floor(t / TIER.atkEvery), hp: 1 + TIER.hp * t, bossScale: 1 + TIER.boss * t };
}

export function generateNight(run, stage, risky) {
  if (stage >= RUN_LENGTH - 1) return bossNight(run);
  const tm = tierMods(run);
  const r = { rng: ((run.seed * 977 + stage * 131 + (risky ? 7 : 3)) >>> 0) || 1 };
  // 목표: 첫 밤은 소탕, 그 뒤로는 길마다 다른 목표
  const kinds = ['annihilate', 'survive', 'lanes', 'rush'];
  let kind = 'annihilate';
  if (stage > 0) {
    const base = (run.seed + stage * 5) % kinds.length;
    kind = kinds[(base + (risky ? 1 + randInt(r, 3) : 0)) % kinds.length];
  }
  // 적 구성
  const table = [
    ['kasa', 4], ['drum', stage >= 1 ? 3 : 1], ['archer', 2], ['mask', stage === 0 ? 0 : stage >= 3 ? 3 : 2],
    ['bomber', stage >= 1 ? 2 : 0], ['boar', stage >= 2 ? 2 : 0], ['healer', stage >= 2 ? 1 : 0],
  ].filter(([, w]) => w > 0);
  let budget = Math.round(BUDGET[stage] * (kind === 'survive' ? 1.15 : 1) * (risky ? 1.1 : 1) * (1 + TIER.budget * tm.tier));
  // 정예: 셋째 밤부터(험한 길은 둘째 밤부터) 하나, 다섯째 밤은 둘
  const elites = stage >= (risky ? 1 : 2) ? (stage >= 4 ? 2 : 1) : 0;
  budget -= elites * ELITE_COST;
  const types = [];
  while (budget >= 2) {
    let t = pickWeighted(r, table);
    if (t === 'healer' && types.includes('healer')) t = 'kasa'; // 약탕 도깨비는 한 밤에 하나만
    if (UNIT_COST[t] > budget) t = 'kasa';
    types.push(t);
    budget -= UNIT_COST[t];
  }
  const total = types.length;
  // 무리(웨이브) 나누기
  const turnsLimit = 6 + (stage >= 3 ? 1 : 0);
  const waveTurns = kind === 'survive' ? Array.from({ length: turnsLimit - 1 }, (_, i) => i + 1) : stage >= 3 ? [1, 3, 5, 7] : [1, 3, 5];
  const waves = waveTurns.map((at) => ({ at, units: [] }));
  const firstShare = Math.max(3, Math.round(total * (kind === 'survive' ? 0.3 : 0.4)));
  // 첫 무리는 간격을 두고 넓게 선다(같은 레인에서는 최소 한 칸 띄움)
  const laneOrder = shuffle(r, [0, 1, 2]);
  const nextRow = [randInt(r, 2), randInt(r, 2), randInt(r, 2)];
  let li = 0;
  types.forEach((t, i) => {
    const lane = laneOrder[li % LANES];
    li++;
    if (i < firstShare) {
      const row = Math.min(4, nextRow[lane]);
      nextRow[lane] += 2;
      waves[0].units.push([t, lane, t === 'archer' || t === 'healer' ? 0 : row]);
    } else {
      const w = waves[1 + ((i - firstShare) % (waves.length - 1))];
      const used = w.units.filter((u) => u[1] === lane).length;
      w.units.push([t, lane, Math.min(1, used)]);
    }
  });
  // 정예 표시: 뒤에서 치유만 하는 적은 빼고, 무리마다 하나씩
  const eligible = waves.flatMap((w, wi) => w.units.map((u) => [u, wi])).filter(([u]) => u[0] !== 'healer');
  for (let n = 0; n < elites && eligible.length; n++) {
    const pool = eligible.filter(([, wi]) => (n === 0 ? wi === 0 : wi > 0));
    const [u] = (pool.length ? pool : eligible)[randInt(r, (pool.length ? pool : eligible).length)];
    if (u[3] !== 'elite') u[3] = 'elite';
  }
  const objective = { type: kind };
  if (kind === 'survive') objective.turns = turnsLimit;
  if (kind === 'lanes') objective.need = Math.max(1, Math.min(3, Math.floor(total / 3) - 1));
  if (kind === 'rush') {
    objective.kills = Math.ceil(total * 0.65);
    objective.turns = Math.ceil(objective.kills / 1.15) + 3; // 새 적(치유·정예)이 끼어 처치가 느려진 만큼 한 턴 더
  }
  const mods = risky ? shuffle(r, Object.keys(MODS)).slice(0, stage >= 3 ? 2 : 1) : [];
  return {
    id: `n${stage}${risky ? 'r' : 's'}`,
    stage, risky,
    name: OBJ_INFO[kind].name,
    night: NIGHT_NAMES[stage],
    objective,
    intro: OBJ_INFO[kind].desc(objective),
    pullWaves: kind !== 'survive',
    waves: waves.filter((w) => w.units.length),
    mods,
    hpScale: HP_SCALE[stage] * tm.hp,
    tier: tm.tier, atkUp: tm.atkUp, bossScale: tm.bossScale,
    clearCoins: COIN.clearBase + stage + (risky ? 2 : 0) + TIER.coin * tm.tier,
    coinMult: risky ? COIN.riskyMult : 1,
    counts: types.reduce((a, t) => ((a[t] = (a[t] || 0) + 1), a), {}),
    elites: waves.flatMap((w) => w.units).filter((u) => u[3] === 'elite').length,
  };
}

// 첫 판 따라 하기용 밤: 우산 도깨비 넷과 초롱불 하나
export function tutorialNight() {
  return {
    id: 'tut', stage: 0, risky: false,
    name: OBJ_INFO.annihilate.name, night: NIGHT_NAMES[0],
    objective: { type: 'annihilate' }, intro: OBJ_INFO.annihilate.desc(),
    pullWaves: true,
    waves: [
      { at: 1, units: [['kasa', 1, 3], ['kasa', 0, 1], ['kasa', 2, 1]] },
      { at: 3, units: [['kasa', 1, 0], ['archer', 2, 0]] },
    ],
    mods: [], hpScale: 1, clearCoins: COIN.clearBase, coinMult: 1,
    counts: { kasa: 4, archer: 1 }, elites: 0,
  };
}

function bossNight(run) {
  const b = BATTLES[BATTLES.length - 1];
  const tm = tierMods(run || {});
  return {
    tier: tm.tier, atkUp: tm.atkUp, bossScale: tm.bossScale,
    ...b,
    id: 'boss', stage: RUN_LENGTH - 1, risky: false,
    night: NIGHT_NAMES[RUN_LENGTH - 1],
    waves: b.waves.map((w) => ({ at: w.at, units: w.units.map((u) => u.slice()) })),
    mods: [], clearCoins: 0, coinMult: 1, hpScale: HP_SCALE[RUN_LENGTH - 1] * tm.hp,
    counts: b.waves.flatMap((w) => w.units).reduce((a, u) => ((a[u[0]] = (a[u[0]] || 0) + 1), a), {}),
  };
}

// 다음 밤의 길: 순한 길 / 험한 길 (마지막은 보스 하나)
export function rollPaths(run) {
  const next = run.stage + 1;
  if (next >= RUN_LENGTH - 1) return [bossNight(run)];
  return [generateNight(run, next, false), generateNight(run, next, true)];
}

// ───────────────────────── 갈림길 ─────────────────────────
// 밤을 넘기면 세 곳(상점·쉼터·사당) 중 두 곳이 열리고, 그중 한 곳만 들른다.
// 같은 판·같은 밤이면 항상 같은 두 곳이 나온다.
const STOP_KINDS = ['shop', 'rest', 'shrine'];
// 닫히는 곳의 순서: 한 판 안에서 세 곳이 고루 닫히고, 첫 갈림길에는 상점이 있으며, 상점이 연달아 닫히지 않는다
function closedStops(run) {
  let h = (run.seed ^ 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  const first = h & 1 ? 'rest' : 'shrine';
  const other = first === 'rest' ? 'shrine' : 'rest';
  if (h & 2) return [first, other, 'shop', h & 4 ? first : other];
  return [first, 'shop', other, h & 4 ? first : 'shop'];
}
export function rollStops(run) {
  const stage = run.stage; // 방금 넘긴 밤
  if (stage + 1 >= RUN_LENGTH - 1) return ['shop', 'rest']; // 보스 앞: 채비를 갖출 수 있게
  const seq = closedStops(run);
  const closed = seq[stage % seq.length];
  return STOP_KINDS.filter((k) => k !== closed);
}

// 쉼터: 쉬기(체력이 가득이면 최대 체력) 또는 문양 수련 둘 중 하나
export function rollRest(run) {
  const lvOf = (s) => (run.symLv && run.symLv[s]) || 0;
  const train = pickSome(run, symbolsOf(run.char).filter((s) => lvOf(s) < TRAIN_MAX), 2).map((s) => 'train:' + s);
  return [run.hp >= run.maxHp ? 'maxhp' : 'rest', ...train];
}

// 사당: 유물 둘 중 하나(융합 재료가 모였으면 융합도 나온다)
export function rollShrine(run) {
  const out = pickSome(run, RELIC_IDS.filter((id) => !run.relics.includes(id) && relicFits(run, id)), 2);
  const fuse = availableFusions(run);
  if (fuse.length) out[out.length ? out.length - 1 : 0] = 'fuse:' + fuse[0];
  return out;
}

// 사당에 바치는 체력(1 아래로는 내려가지 않는다)
export const shrineCost = (run) => Math.min(SHRINE_COST, Math.max(0, run.hp - 1));
export function takeShrine(run, id) {
  run.hp -= shrineCost(run);
  applyReward(run, id);
}

// ───────────────────────── 코인·상점 ─────────────────────────

// 전투에서 번 코인을 지갑에 넣는다(험한 길은 배율 적용)
export function bankBattle(run, st) {
  const mult = st.def.coinMult || 1;
  const gained = Math.round(st.coins * mult);
  run.coins += gained;
  run.totals.coins += gained;
  return { by: { ...st.coinBy }, base: st.coins, mult, gained };
}

export function rollShop(run, keepRerolls = 0) {
  const P = SHOP_PRICES;
  // 진열대는 단출하게: 유물 2칸(융합·강화가 가능하면 둘째 칸에), 소모품 1칸, 회복
  const fresh = pickSome(run, RELIC_IDS.filter((id) => !run.relics.includes(id) && relicFits(run, id)), 2).map((id) => ({ id, price: P.relic }));
  const fuse = availableFusions(run);
  const upg = run.relics.filter((id) => !FUSIONS[id] && (run.relicLv[id] || 1) < 2);
  const items = [fresh[0]].filter(Boolean);
  if (fuse.length) items.push({ id: 'fuse:' + fuse[0], price: P.fuse });
  else if (upg.length && randInt(run, 2)) items.push({ id: 'up:' + upg[randInt(run, upg.length)], price: P.up });
  else if (fresh[1]) items.push(fresh[1]);
  const charms = Object.keys(REWARDS).filter((k) => REWARDS[k].sym && run.strips[0].includes(REWARDS[k].sym));
  const trimmable = Object.keys(SYMBOLS).filter((s) => s !== 'counter' && run.strips.every((st) => st.filter((x) => x === s).length >= 2));
  const extras = [{ id: 'maxhp', price: P.maxhp }, { id: charms[randInt(run, charms.length)], price: P.charm }];
  if (trimmable.length) extras.push({ id: 'trim:' + trimmable[randInt(run, trimmable.length)], price: P.trim });
  items.push(extras[randInt(run, extras.length)]);
  // 수련: 문양 하나를 단련(단계가 오를수록 비싸다)
  const lvOf = (s) => (run.symLv && run.symLv[s]) || 0;
  const trainable = symbolsOf(run.char).filter((s) => lvOf(s) < TRAIN_MAX);
  if (trainable.length) {
    const s = trainable[randInt(run, trainable.length)];
    items.push({ id: 'train:' + s, price: P.train + P.trainStep * lvOf(s) });
  }
  items.push({ id: 'heal', price: P.heal });
  return { items: items.map((it) => ({ ...it, sold: false })), rerolls: keepRerolls };
}

export const shopRerollCost = (shop) => SHOP_PRICES.reroll + shop.rerolls * 2;

// 살 수 없는 이유(없으면 null)
export function cantBuy(run, it) {
  if (it.sold) return '구매함';
  if (it.id === 'heal' && run.hp >= run.maxHp) return '체력 가득';
  if (run.coins < it.price) return '코인 부족';
  return null;
}

export function buyItem(run, shop, i) {
  const it = shop.items[i];
  if (!it || cantBuy(run, it)) return false;
  run.coins -= it.price;
  applyReward(run, it.id);
  it.sold = true;
  return true;
}

export function rerollShop(run, shop) {
  const cost = shopRerollCost(shop);
  if (run.coins < cost) return false;
  run.coins -= cost;
  shop.items = rollShop(run).items;
  shop.rerolls++;
  return true;
}

// 같은 문양이 위아래로 붙지 않는 릴 띠
function noRepeat(s) {
  return s.every((v, i) => v !== s[(i + 1) % s.length]);
}

// 이 판의 캐릭터가 쓸 수 있는 유물인가(특정 문양 전용 유물은 그 문양이 릴에 있어야 한다)
export function relicFits(run, id) {
  const need = RELICS[id] && RELICS[id].sym;
  return !need || run.strips.some((s) => s.includes(need));
}

function makeStrip(run) {
  let s = shuffle(run, BASE_STRIP);
  for (let i = 0; i < 300 && !noRepeat(s); i++) s = shuffle(run, BASE_STRIP);
  return s;
}

export function currentBattle(run) {
  return run.def || BATTLES[run.stage] || null;
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
    symLv: run.symLv || {},
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
  if (id.startsWith('trim:')) {
    const s = id.slice(5);
    return { id, relic: false, name: `${SYMBOLS[s].name} 덜기`, desc: `${SYMBOLS[s].name} 문양이 덜 나옴`, icon: s };
  }
  if (id.startsWith('train:')) {
    const s = id.slice(6);
    return { id, relic: false, name: `${SYMBOLS[s].name} 수련`, desc: `${SYMBOLS[s].name} ${TRAIN_TEXT[s]} (이번 판 내내)`, icon: s };
  }
  if (RELICS[id]) return { id, relic: true, relicId: id, ...RELICS[id] };
  return { id, relic: false, ...REWARDS[id] };
}

// 런 시작: 유물 3개 중 하나를 고른다 → 빌드의 출발점
export function rollStartRelics(run) {
  return pickSome(run, RELIC_IDS.filter((id) => !run.relics.includes(id) && relicFits(run, id)), 3);
}
// 시작 선택지: 유물 3개 + 유물 없이 코인으로 시작
export function rollStartChoices(run) {
  return [...rollStartRelics(run), 'purse'];
}

export function availableFusions(run) {
  return FUSION_IDS.filter((f) => !run.relics.includes(f) && run.relics.includes(FUSIONS[f].a) && run.relics.includes(FUSIONS[f].b));
}

// 전투 보상: 새 유물 2개 + 일반 보상 1개
export function rollRewards(run) {
  const relics = pickSome(run, RELIC_IDS.filter((id) => !run.relics.includes(id) && relicFits(run, id)), 2);
  const utils = Object.keys(REWARDS).filter((k) => k !== 'rest' && !(k === 'heal' && run.hp >= run.maxHp));
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
  if (id.startsWith('train:')) {
    const s = id.slice(6);
    run.symLv = run.symLv || {};
    run.symLv[s] = Math.min(TRAIN_MAX, (run.symLv[s] || 0) + 1);
    run.picks.push(id);
    return;
  }
  if (id.startsWith('trim:')) {
    // 릴마다 그 문양을 하나씩 뺀다(같은 문양이 위아래로 붙지 않는 자리를 우선)
    const sym = id.slice(5);
    run.strips = run.strips.map((s) => {
      const c = s.slice();
      const n = c.length;
      const spots = c.map((v, i) => i).filter((i) => c[i] === sym);
      if (spots.length < 2) return c;
      const safe = spots.filter((i) => c[(i + n - 1) % n] !== c[(i + 1) % n]);
      const list = safe.length ? safe : spots;
      c.splice(list[randInt(run, list.length)], 1);
      return c;
    });
    run.picks.push(id);
    return;
  }
  const r = REWARDS[id];
  if (!r) throw new Error('unknown reward ' + id);
  if (id === 'purse') run.coins += START_PURSE;
  if (id === 'heal') run.hp = Math.min(run.maxHp, run.hp + 7);
  if (id === 'rest') run.hp = Math.min(run.maxHp, run.hp + REST_HEAL);
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

// 다음 밤으로. def는 길 선택에서 고른 밤(없으면 순한 길).
export function advance(run, def) {
  run.stage++;
  run.def = def || generateNight(run, run.stage, false);
  return run.def;
}
