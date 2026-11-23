// 게임 데이터 — 규칙 엔진과 연출이 함께 참조한다.

// 게임 제목(한 곳에서만 바꾸면 된다)
export const GAME_TITLE = 'SPIN TILL DAWN';
// 배포할 때마다 올린다. 메인 화면 아래에 표시되어 최신 버전인지 확인할 수 있다.
export const GAME_VERSION = 'v0.20';

export const ROWS = 7;
export const LANES = 3;
export const FRONT = ROWS - 1; // 플레이어(결계선) 바로 앞 줄
const ROWS_REACH = FRONT - 1; // 우산·북 도깨비는 앞 두 줄에서 공격한다
export const GUARD_CAP = 6;
export const EMBER_CAP = 3;
export const REROLLS_PER_TURN = 2;

export const SYMBOL_IDS = ['blade', 'wave', 'frost', 'spark', 'venom', 'lantern'];

export const SYMBOLS = {
  blade: { name: '절단', ink: '#3b46b0', tint: '#dfe4ff', fx: '#eef2ff', fx2: '#8fa8ff' },
  wave: { name: '파동', ink: '#0d8f74', tint: '#cff5e8', fx: '#4ff0c4', fx2: '#0fae8a' },
  frost: { name: '동결', ink: '#2b7fd0', tint: '#d6ecff', fx: '#b8e6ff', fx2: '#4aa6ff' },
  spark: { name: '전격', ink: '#7b3fd0', tint: '#fff2b0', fx: '#ffe45c', fx2: '#b77cff' },
  venom: { name: '중독', ink: '#4a8a1a', tint: '#e2f6c4', fx: '#a6f04a', fx2: '#6a2fb0' },
  lantern: { name: '등불', ink: '#d0532a', tint: '#ffe2c0', fx: '#ffc266', fx2: '#ff7a3d' },
  counter: { name: '되치기', ink: '#b8860b', tint: '#fff0b0', fx: '#ffd84a', fx2: '#ff9f1a' },
  bomb: { name: '폭탄', ink: '#8a3210', tint: '#ffe0c8', fx: '#ff8a3d', fx2: '#ffd84a' },
};

// 캐릭터: 문양 다섯 가지는 함께 쓰고, 한 자리(고유 기술)만 다르다
export const CHARACTERS = {
  blade: {
    id: 'blade', sig: 'blade', name: '칼잡이', en: 'Swordhand', color: '#cfd8ff', scarf: '#33c79a',
    desc: '고유 기술 절단 · 맨 앞부터 꿰뚫는다 · 얼린 적을 파쇄',
    enDesc: 'Signature: Slash · Pierces from the front · Shatters frozen enemies',
  },
  bomb: {
    id: 'bomb', sig: 'bomb', name: '폭탄꾼', en: 'Bombardier', color: '#ff8a3d', scarf: '#ff8a3d',
    desc: '고유 기술 폭탄 · 맨 뒤 적에게 떨어져 주변까지 터진다 · 방패 무시',
    enDesc: 'Signature: Bomb · Lands on the rearmost enemy and bursts around it · Ignores shields',
  },
};
export const CHARACTER_IDS = Object.keys(CHARACTERS);
// 그 캐릭터가 쓰는 문양 목록(절단 자리가 고유 기술로 바뀐다)
export const symbolsOf = (charId) => SYMBOL_IDS.map((s) => (s === 'blade' ? (CHARACTERS[charId] || CHARACTERS.blade).sig : s));

export const SHOT_NAMES = {
  blade: ['', '절단', '관통 베기', '반달 베기'],
  wave: ['', '파동', '큰 파동', '해일'],
  frost: ['', '동결', '서리 줄기', '한파'],
  spark: ['', '전격', '연쇄 전격', '벼락'],
  venom: ['', '중독', '독 줄기', '독안개'],
  lantern: ['', '방어막', '큰 방어막', '등불'],
  bomb: ['', '폭탄', '큰 폭탄', '불꽃놀이'],
};

// 영어 이름(스팀 출시 대비). 화면 전환 기능은 아직 없고 데이터만 준비해 둔다.
export const SHOT_NAMES_EN = {
  blade: ['', 'Slash', 'Piercing Slash', 'Crescent'],
  wave: ['', 'Wave', 'Big Wave', 'Tidal Wave'],
  frost: ['', 'Frost', 'Frost Line', 'Cold Snap'],
  spark: ['', 'Spark', 'Chain Spark', 'Thunderbolt'],
  venom: ['', 'Poison', 'Poison Line', 'Miasma'],
  lantern: ['', 'Guard', 'Big Guard', 'Lantern'],
  bomb: ['', 'Bomb', 'Big Bomb', 'Fireworks'],
};
export const SYMBOL_EN = { bomb: 'Bomb', blade: 'Slash', wave: 'Wave', frost: 'Frost', spark: 'Spark', venom: 'Poison', lantern: 'Guard' };
export const ENEMY_EN = { kasa: 'Umbrella Imp', drum: 'Drum Imp', mask: 'Mask Bearer', archer: 'Lantern Wisp', elder: 'Great Lantern', bomber: 'Firecracker Imp', healer: 'Brew Imp', boar: 'Boar' };
// 정예: 체력 1.6배, 공격 +1, 처치하면 코인
export const ELITE = { hp: 1.6, atk: 1 };
export const STAGE_EN = { b1: 'Bridgehead', b2: 'Mask Dance', b3: 'Lantern Alley', b4: 'Drumbeat', b5: 'Great Lantern' };

// 기력: 막기·회피에 드는 힘. 매 턴 조금씩 돌아온다. 퍼펙트여도 기력은 든다(퍼펙트 회피만 1로 줄어든다).
export const STAMINA = { max: 4, regen: 2, guard: 1, dodge: 2, perfectDodge: 1 };
// 수련: 상점에서 문양을 단련하면 그 기술이 강해진다(최대 단계)
export const TRAIN_MAX = 3;
export const TRAIN_TEXT = { bomb: '피해 +1', blade: '피해 +1', wave: '피해 +1', frost: '피해 +1', spark: '피해 +1', venom: '중독 +1', lantern: '방어막 +1' };

// 기술 수치. gild = 금빛 릴 수(피해 +1, 고유 능력 +1), lv = 수련 단계
export function shotStats(symbol, tier, gild = 0, lv = 0) {
  const s = baseShotStats(symbol, tier, gild);
  if (lv > 0) {
    if (symbol === 'venom') s.poison += lv;
    else if (symbol === 'lantern') s.guard += lv;
    else {
      s.dmg += lv;
      if (s.sideDmg != null) s.sideDmg += lv;
    }
  }
  return s;
}

function baseShotStats(symbol, tier, gild = 0) {
  const g = gild;
  switch (symbol) {
    case 'blade':
      if (tier === 1) return { dmg: 3 + g, pierce: 2 + g };
      if (tier === 2) return { dmg: 4 + g, pierce: 99 };
      return { dmg: 5 + g, pierce: 99, sideDmg: 3 + g };
    case 'wave':
      if (tier === 1) return { dmg: 2 + g, splash: 1 + g, area: 'cross' };
      if (tier === 2) return { dmg: 3 + g, splash: 2 + g, area: 'square' };
      return { dmg: 3 + g, push: 1 };
    case 'frost':
      if (tier === 1) return { dmg: 1 + g, freeze: 1 + g };
      if (tier === 2) return { dmg: 1 + g, freeze: 1 + g, wholeLane: true };
      return { dmg: 1 + g, freeze: 2 + g };
    case 'spark':
      if (tier === 1) return { dmg: 2 + g, jumps: 1 + g, jumpDmg: 1, range: 2 };
      if (tier === 2) return { dmg: 2 + g, jumps: 3 + g, jumpDmg: 2, range: 3 };
      return { dmg: 3 + g };
    case 'venom':
      if (tier === 1) return { dmg: 1 + g, poison: 3 + g };
      if (tier === 2) return { dmg: 1 + g, poison: 3 + g, wholeLane: true };
      return { dmg: 1 + g, poison: 4 + g };
    case 'bomb':
      if (tier === 1) return { dmg: 3 + g, splash: 2 + g, area: 'cross' };
      if (tier === 2) return { dmg: 4 + g, splash: 3 + g, area: 'square' };
      return { dmg: 5 + g };
    case 'lantern':
      if (tier === 1) return { guard: 2 + g, heal: 0 };
      if (tier === 2) return { guard: 3 + g, heal: 2 };
      return { guard: 4 + g, heal: 5, exposeAll: true };
  }
  return {};
}

export function shotDesc(symbol, tier, gild = 0, lv = 0) {
  const s = shotStats(symbol, tier, gild, lv);
  switch (symbol) {
    case 'blade':
      if (tier === 1) return `관통 ${s.pierce} · 피해 ${s.dmg} · 얼어붙은 적 파쇄`;
      if (tier === 2) return `레인 전체 관통 · 피해 ${s.dmg} · 파쇄`;
      return `레인 전체 ${s.dmg} + 양옆 레인 ${s.sideDmg} · 방패 무시`;
    case 'wave':
      if (tier === 1) return `첫 적 ${s.dmg} · 양옆·뒤 ${s.splash} · 밀어내기`;
      if (tier === 2) return `첫 적 ${s.dmg} · 주변 8칸 ${s.splash} · 밀어내기`;
      return `모든 적 ${s.dmg} · 한 칸 밀어내기`;
    case 'frost':
      if (tier === 1) return `첫 적 ${s.dmg} · 동결 ${s.freeze}턴 (행동·조준 취소)`;
      if (tier === 2) return `레인 전체 ${s.dmg} · 동결 ${s.freeze}턴`;
      return `모든 적 ${s.dmg} · 동결 ${s.freeze}턴`;
    case 'spark':
      if (tier === 1) return `첫 적 ${s.dmg} · 근처 ${s.jumps}명에게 연쇄 ${s.jumpDmg}`;
      if (tier === 2) return `첫 적 ${s.dmg} · 연쇄 ${s.jumps}회 각 ${s.jumpDmg}`;
      return `모든 적 ${s.dmg} 감전`;
    case 'venom':
      if (tier === 1) return `첫 적 ${s.dmg} · 중독 ${s.poison} (매 턴 피해, 방패 무시)`;
      if (tier === 2) return `레인 전체 ${s.dmg} · 중독 ${s.poison}`;
      return `모든 적 ${s.dmg} · 중독 ${s.poison}`;
    case 'bomb':
      if (tier === 1) return `맨 뒤 적 ${s.dmg} · 앞뒤·양옆 ${s.splash} · 방패 무시`;
      if (tier === 2) return `맨 뒤 적 ${s.dmg} · 주변 8칸 ${s.splash} · 방패 무시`;
      return `모든 적 ${s.dmg} · 방패 무시 · 파쇄`;
    case 'lantern':
      if (tier === 1) return `방어막 +${s.guard} · 기력 +1`;
      if (tier === 2) return `방어막 +${s.guard} · 체력 +${s.heal} · 기력 +2`;
      return `방어막 +${s.guard} · 체력 +${s.heal} · 기력 가득 · 모든 적 노출`;
  }
  return '';
}

export const ENEMIES = {
  kasa: {
    name: '우산 도깨비', hp: 9, atk: 3, reach: ROWS_REACH,
    act: '체력이 가득하면 2칸씩 뛴다.',
    how: '한 대만 쳐도 느려진다. 공격은 막기.',
  },
  mask: {
    name: '탈꾼', hp: 14, atk: 5, shield: true, shieldHp: 2,
    act: '탈이 정면 공격을 2번 막는다.',
    how: '두 번 치면 깨진다. 파동 옆 피해·연쇄·중독은 바로 통한다.',
  },
  drum: {
    name: '북 도깨비', hp: 8, atk: 3, reach: ROWS_REACH,
    act: '지그재그로 레인을 바꾸며 다가온다.',
    how: '머리 위 화살표가 다음 레인. 미리 노려라.',
  },
  archer: {
    name: '초롱불', hp: 7, atk: 3, post: 1,
    act: '한 턴 조준한 뒤 불씨를 쏜다.',
    how: '얼리면 조준이 풀린다. 불씨는 막기.',
  },
  bomber: {
    name: '폭죽 도깨비', hp: 6, atk: 4, reach: ROWS_REACH, explode: 3,
    act: '쓰러지면 터져서 옆의 적에게 3 피해.',
    how: '적들 사이에 있을 때 잡아라. 공격은 막기.',
  },
  healer: {
    name: '약탕 도깨비', hp: 8, atk: 2, post: 1, reach: ROWS_REACH, mend: 3,
    act: '매 턴 다친 적 하나를 3 회복시킨다.',
    how: '먼저 잡아라. 혼자 남으면 다가온다.',
  },
  boar: {
    name: '멧돼지', hp: 12, atk: 5,
    act: '콧김을 뿜은 다음 턴, 앞의 적도 뛰어넘어 돌진한다.',
    how: '얼리면 돌진이 풀린다. 들이받기는 회피.',
  },
  elder: {
    name: '왕초롱', hp: 80, atk: 3, boss: true,
    act: '소환 → 이동 → 충전 → 연속 발사를 반복.',
    how: '충전 중엔 받는 피해 +2. 발사는 한 발씩 막기.',
  },
};

// 상성: 약점인 기술은 피해 +2(번지는 피해는 +1), 저항하는 기술은 직격 피해 -1
export const AFFINITY = {
  kasa: { weak: 'blade', resist: 'wave' }, // 종이 우산은 잘 베이고, 물은 튕겨 낸다
  drum: { weak: 'wave', resist: 'spark' }, // 젖은 북은 울리지 않는다
  mask: { weak: 'venom' }, // 탈 틈으로 스민다
  archer: { weak: 'frost', resist: 'blade' }, // 불씨는 추위에 약하고 칼로는 잘 베이지 않는다
  bomber: { weak: 'spark' }, // 불꽃이 닿으면 심지에 불이 붙는다
  healer: { weak: 'blade' }, // 약탕 단지가 깨진다
  boar: { weak: 'frost', resist: 'blade' }, // 두꺼운 가죽, 얼면 굼뜨다
  elder: { weak: 'wave' }, // 큰불에는 물
};
export const WEAK_BONUS = 2;
export const RESIST_CUT = 1;
// 저격: 턴마다 이 횟수만큼, 레인의 맨 앞이 아닌 적을 골라 맞힐 수 있다
export const SNIPES_PER_TURN = 1;

export const OBJECTIVES = {
  annihilate: '모든 적 처치',
  survive: '버티기',
  hunt: '보스 처치',
};

// units: [type, lane, row]
export const BATTLES = [
  {
    id: 'b1', name: '다리 입구', night: '첫째 밤',
    objective: { type: 'annihilate' },
    intro: '적을 모두 쓰러뜨려라.',
    waves: [
      { at: 1, units: [['kasa', 0, 2], ['kasa', 2, 1], ['kasa', 1, 0]] },
      { at: 2, units: [['drum', 0, 0], ['archer', 2, 0]] },
      { at: 4, units: [['kasa', 1, 0], ['drum', 2, 0], ['kasa', 0, 0]] },
      { at: 6, units: [['archer', 1, 0], ['kasa', 2, 1], ['kasa', 0, 0], ['drum', 1, 1]] },
    ],
  },
  {
    id: 'b2', name: '탈놀이', night: '둘째 밤',
    objective: { type: 'survive', turns: 7 },
    pullWaves: false,
    intro: '7턴 동안 버텨라.',
    waves: [
      { at: 1, units: [['mask', 1, 3], ['kasa', 0, 2], ['kasa', 2, 2], ['drum', 1, 0]] },
      { at: 2, units: [['kasa', 2, 0], ['archer', 0, 0], ['kasa', 1, 0]] },
      { at: 3, units: [['drum', 1, 0], ['kasa', 0, 0], ['archer', 2, 0]] },
      { at: 4, units: [['mask', 2, 0], ['kasa', 1, 0], ['archer', 0, 0]] },
      { at: 5, units: [['kasa', 0, 0], ['drum', 1, 0], ['kasa', 2, 0]] },
      { at: 6, units: [['mask', 0, 0], ['kasa', 1, 0], ['kasa', 2, 0], ['archer', 1, 1]] },
    ],
  },
  {
    id: 'b3', name: '초롱 골목', night: '셋째 밤',
    objective: { type: 'annihilate' },
    intro: '적을 모두 쓰러뜨려라.',
    waves: [
      { at: 1, units: [['mask', 0, 2], ['archer', 0, 0], ['drum', 2, 2], ['archer', 2, 0], ['kasa', 1, 1]] },
      { at: 3, units: [['archer', 1, 0], ['kasa', 0, 0], ['drum', 2, 0], ['mask', 1, 1]] },
      { at: 5, units: [['mask', 1, 1], ['archer', 0, 0], ['archer', 2, 0], ['kasa', 1, 0], ['drum', 0, 1]] },
    ],
  },
  {
    id: 'b4', name: '북소리', night: '넷째 밤',
    objective: { type: 'survive', turns: 7 },
    pullWaves: false,
    intro: '7턴 동안 버텨라.',
    waves: [
      { at: 1, units: [['drum', 0, 2], ['kasa', 1, 3], ['drum', 2, 2], ['mask', 1, 1], ['archer', 0, 0]] },
      { at: 2, units: [['archer', 2, 0], ['kasa', 1, 0], ['drum', 0, 0]] },
      { at: 3, units: [['mask', 0, 0], ['mask', 2, 0], ['kasa', 1, 0]] },
      { at: 4, units: [['drum', 0, 0], ['kasa', 1, 0], ['kasa', 2, 0], ['archer', 1, 1]] },
      { at: 5, units: [['kasa', 0, 0], ['mask', 1, 0], ['drum', 2, 0], ['archer', 0, 1]] },
      { at: 6, units: [['kasa', 0, 0], ['kasa', 1, 0], ['kasa', 2, 0], ['drum', 1, 1]] },
    ],
  },
  {
    id: 'b5', name: '왕초롱', night: '마지막 밤',
    objective: { type: 'hunt', target: 'elder' },
    pullWaves: false,
    intro: '왕초롱을 쓰러뜨려라.',
    waves: [
      { at: 1, units: [['elder', 1, 0], ['kasa', 0, 2], ['mask', 1, 3], ['drum', 2, 1]] },
      { at: 3, units: [['archer', 2, 0], ['kasa', 0, 0], ['drum', 1, 1]] },
      { at: 5, units: [['mask', 2, 0], ['archer', 0, 0]] },
      { at: 7, units: [['drum', 0, 0], ['kasa', 2, 0], ['archer', 1, 1]] },
      { at: 9, units: [['mask', 0, 0], ['drum', 2, 0], ['kasa', 1, 1]] },
    ],
  },
];

// ───── 한 판의 구조: 무작위로 만들어지는 밤 5개 + 보스 ─────
export const RUN_LENGTH = 6;
// 단계(0부터): 보스를 잡을 때마다 다음 단계가 열린다. 단계마다 적 체력·수가 늘고, 2단계마다 공격력 +1.
export const MAX_TIER = 5;
export const TIER = { hp: 0.12, budget: 0.07, boss: 0.15, atkEvery: 2, coin: 1 };
export const NIGHT_NAMES = ['첫째 밤', '둘째 밤', '셋째 밤', '넷째 밤', '다섯째 밤', '마지막 밤'];

// 밤의 목표
export const OBJ_INFO = {
  annihilate: { name: '소탕', en: 'Sweep', desc: () => '적을 모두 처치' },
  survive: { name: '버티기', en: 'Hold Out', desc: (o) => `${o.turns}턴 버티기` },
  lanes: { name: '세 갈래', en: 'Three Lanes', desc: (o) => `레인마다 ${o.need}마리씩 처치` },
  rush: { name: '속전', en: 'Rush', desc: (o) => `${o.turns}턴 안에 ${o.kills}마리 처치` },
  hunt: { name: '왕초롱', en: 'Great Lantern', desc: () => '왕초롱 처치' },
};

// 험한 길에 붙는 조건
export const MODS = {
  fullMoon: { name: '보름달', en: 'Full Moon', desc: '적 체력 +25%' },
  rage: { name: '성난 밤', en: 'Angry Night', desc: '적 공격력 +1' },
  gust: { name: '빠른 걸음', en: 'Quick March', desc: '매 턴, 적 하나가 한 칸 더 다가온다' },
  fog: { name: '안개', en: 'Fog', desc: '뒤쪽 적의 다음 행동이 안 보임' },
};

// 코인: 어떻게 싸웠는지에 따라 달라진다
// 그냥 처치하는 것만으로는 벌리지 않는다. 연속 처치(한 턴 3마리째부터)·퍼펙트·빙고·절약(밤 내내 다시 돌리기를 안 씀)·클리어로 번다.
export const COIN = { kill: 0, boss: 0, perfect: 1, bingo: 1, thrift: 3, clearBase: 3, riskyMult: 2, elite: 3, comboFrom: 3 };
export const COIN_LABEL = { kill: '처치', combo: '연속 처치', perfect: '퍼펙트', bingo: '빙고', thrift: '절약', clear: '클리어', elite: '정예 처치' };
export const START_PURSE = 15; // 유물 대신 고를 수 있는 시작 코인
export const SHOP_PRICES = { relic: 18, up: 14, fuse: 22, heal: 7, maxhp: 12, charm: 9, trim: 9, reroll: 3, train: 12, trainStep: 4 };

export const BASE_STRIP = [
  'blade', 'wave', 'frost', 'spark', 'lantern', 'venom',
  'blade', 'wave', 'frost', 'spark',
  'blade', 'wave', 'frost', 'spark', 'lantern', 'venom',
];

export const REWARDS = {
  heal: { name: '기름 한 병', en: 'Oil', desc: '체력 +7', icon: 'heal' },
  maxhp: { name: '굵은 심지', en: 'Thick Wick', desc: '최대 체력 +3 · 체력 +3', icon: 'maxhp' },
  purse: { name: '엽전 꾸러미', en: 'Coin Purse', desc: '유물 없이 시작 · 코인 +15', icon: 'coin' },
  stripBlade: { name: '절단 부적', en: 'Slash Charm', desc: '절단 문양이 더 자주 나옴', icon: 'blade', sym: 'blade' },
  stripWave: { name: '파동 부적', en: 'Wave Charm', desc: '파동 문양이 더 자주 나옴', icon: 'wave', sym: 'wave' },
  stripFrost: { name: '동결 부적', en: 'Frost Charm', desc: '동결 문양이 더 자주 나옴', icon: 'frost', sym: 'frost' },
  stripSpark: { name: '전격 부적', en: 'Spark Charm', desc: '전격 문양이 더 자주 나옴', icon: 'spark', sym: 'spark' },
  stripVenom: { name: '중독 부적', en: 'Poison Charm', desc: '중독 문양이 더 자주 나옴', icon: 'venom', sym: 'venom' },
  stripBomb: { name: '폭탄 부적', en: 'Bomb Charm', desc: '폭탄 문양이 더 자주 나옴', icon: 'bomb', sym: 'bomb' },
};

// 유물: 한 판의 싸움 방식을 정한다. 규칙은 battle.js의 has/lv 지점에서 적용.
// id는 저장 데이터와 연결되므로 이름을 바꿔도 그대로 둔다.
// name/desc = 한국어, en/enDesc = 영어. tag = 계열(작은 배지), proc = 발동 시 화면에 뜨는 짧은 이유, up = II 강화 효과.
export const RELICS = {
  frostbite: { name: '살얼음', en: 'Thin Ice', color: '#7cc8ff', tag: '동결', proc: '파쇄 → 주변 동결', desc: '파쇄 시 주변 적 동결', enDesc: 'Shatter freezes nearby enemies', up: '주변 동결 2턴' },
  thunderDrum: { name: '벼락북', en: 'Thunder Drum', color: '#ffe45c', tag: '전격', proc: '처치 → 번개', desc: '적 처치 시 가까운 적에게 번개 2', enDesc: 'On kill: 2 lightning damage to the nearest enemy', up: '번개 2 → 4' },
  counterMirror: { name: '손거울', en: 'Hand Mirror', color: '#ffd84a', tag: '되치기', proc: '퍼펙트 막기 → 방어막', desc: '되치기 피해 +2 · 퍼펙트 막기 시 방어막 +1', enDesc: 'Counter damage +2 · Perfect block: +1 Guard', up: '되치기 +4 · 방어막 +2' },
  gamblerCoin: { name: '엽전', en: 'Lucky Coin', color: '#c58cff', tag: '슬롯', proc: '다시 돌림 → 방어막', desc: '다시 돌리기 +1회 · 돌릴 때 방어막 +1', enDesc: '+1 Reroll per turn · Reroll: +1 Guard', up: '+2회 · 방어막 +2' },
  emberWick: { name: '심지', en: 'Wick', color: '#ffb347', tag: '금빛', proc: '', desc: '금빛 릴 1개로 시작 · 금빛 피해 +1', enDesc: 'Start each battle with 1 Gilded reel · Gilded damage +1', up: '금빛 릴 2개 · 피해 +2' },
  tideBell: { name: '파도 종', en: 'Tide Bell', color: '#4ff0c4', tag: '파동', proc: '직격 → 더 밀어냄', desc: '파동 옆 피해 +1 · 직격한 적을 1칸 더 밀어냄', enDesc: 'Wave splash +1 · Direct hit pushes the enemy 1 more cell', up: '옆 피해 +2' },
  powderKeg: { name: '화약통', en: 'Powder Keg', color: '#ff8a3d', tag: '폭탄', sym: 'bomb', proc: '폭탄 처치 → 기력', desc: '폭탄 주변 피해 +1 · 폭탄 직격으로 처치 시 기력 +1', enDesc: 'Bomb splash +1 · Kill with a direct Bomb hit: +1 Stamina', up: '주변 피해 +2 · 기력 +2' },
  whetstone: { name: '숫돌', en: 'Whetstone', color: '#cfd8ff', tag: '절단', sym: 'blade', proc: '절단 처치 → 방어막', desc: '절단 관통 +1 · 절단 처치 시 방어막 +1', enDesc: 'Slash pierce +1 · Slash kill: +1 Guard', up: '관통 +2 · 방어막 +2' },
  shadowShoes: { name: '짚신', en: 'Straw Shoes', color: '#8fe8ff', tag: '회피', proc: '회피 → 반격', desc: '회피가 쉬워짐 · 회피 시 적에게 2 피해', enDesc: 'Wider dodge window · Dodge: 2 damage to the attacker', up: '회피 반격 4' },
  oilFlask: { name: '기름병', en: 'Oil Flask', color: '#ff9a5a', tag: '방어막', proc: '방어막 → 회복', desc: '방어막 사용 시 체력 +1 · 최대 방어막 +2', enDesc: 'Guard skill: heal 1 · Max Guard +2', up: '체력 +2 · 최대 방어막 +4' },
  venomFang: { name: '독니', en: 'Fang', color: '#a6f04a', tag: '중독', proc: '처치 → 전염', desc: '중독 +2 · 중독된 적 처치 시 주변 중독 2', enDesc: 'Poison +2 · Killing a poisoned enemy spreads 2 Poison', up: '중독 +4 · 전염 4' },
  stormRune: { name: '먹구름', en: 'Storm Cloud', color: '#b77cff', tag: '전격', proc: '', desc: '전격 연쇄 +1 · 감전 폭발 +2', enDesc: 'Spark chain +1 · Detonate +2', up: '연쇄 +2 · 폭발 +4' },
  bingoBell: { name: '금방울', en: 'Gold Bell', color: '#ffe08a', tag: '빙고', proc: '빙고 → 방어막', desc: '빙고 시 방어막 +2 · 다음 턴 금빛 +1', enDesc: 'Bingo: +2 Guard and +1 Gilded reel next turn', up: '방어막 +4' },
  iceMirror: { name: '고드름', en: 'Icicle', color: '#bfe6ff', tag: '동결', proc: '', desc: '동결 +1턴 · 언 적이 받는 피해 +1', enDesc: 'Freeze +1 turn · Frozen enemies take +1 damage', up: '+2턴 · 피해 +2' },
  comboFlute: { name: '피리', en: 'Flute', color: '#ff9ac0', tag: '처치', proc: '연속 처치 → 회복', desc: '한 턴 2번째 처치부터 체력 +1', enDesc: 'From the 2nd kill each turn: heal 1', up: '체력 +2' },
};
for (const k in RELICS) RELICS[k].build = RELICS[k].tag; // 예전 필드명 호환
export const RELIC_IDS = Object.keys(RELICS);

// 진화: II 유물이 한 판 동안 이만큼 발동하면 III(효과 3배)로 진화한다
export const EVOLVE_AT = 6;

// 융합: 짝이 되는 두 유물을 모두 가지면 보상에 등장. 재료 효과는 유지되고 새 효과가 더해진다.
export const FUSIONS = {
  glacier: { name: '빙하', en: 'Glacier', a: 'frostbite', b: 'iceMirror', color: '#9fdcff', proc: '', desc: '파쇄 피해 +3', enDesc: 'Shatter deals +3 damage' },
  tempest: { name: '뇌우', en: 'Tempest', a: 'thunderDrum', b: 'stormRune', color: '#ffe45c', proc: '', desc: '벼락북 번개가 적 2명에게', enDesc: 'Thunder Drum strikes 2 enemies' },
  plague: { name: '역병', en: 'Plague', a: 'venomFang', b: 'comboFlute', color: '#a6f04a', proc: '', desc: '중독이 줄어들지 않음', enDesc: 'Poison no longer decays' },
  duel: { name: '맞수', en: 'Rival', a: 'counterMirror', b: 'shadowShoes', color: '#ffd84a', proc: '받아치기 → 전체 피해', desc: '퍼펙트 막기·회피 성공 시 모든 적 1 피해', enDesc: 'Perfect block or dodge: 1 damage to all enemies' },
  windfall: { name: '대박', en: 'Windfall', a: 'gamblerCoin', b: 'bingoBell', color: '#ffe08a', proc: '', desc: '턴마다 첫 다시 돌리기는 대가 없음', enDesc: 'First reroll each turn has no cost' },
  gale: { name: '칼바람', en: 'Gale', a: 'whetstone', b: 'tideBell', color: '#cfd8ff', proc: '', desc: '절단이 양옆 적에게도 1 피해', enDesc: 'Slash also deals 1 to enemies on both sides' },
  torch: { name: '횃불', en: 'Torch', a: 'emberWick', b: 'oilFlask', color: '#ffb347', proc: '턴 시작 → 방어막', desc: '턴 시작 시 방어막 +1', enDesc: 'Start of turn: +1 Guard' },
};
export const FUSION_IDS = Object.keys(FUSIONS);
// 조회 편의를 위해 유물 표에도 넣어 둔다(도감 수에는 포함하지 않는다: RELIC_IDS는 위에서 이미 확정)
for (const k of FUSION_IDS) RELICS[k] = { ...FUSIONS[k], tag: '융합', build: '융합', fusion: true, up: '' };
export const fusionOf = (id) => FUSION_IDS.find((f) => FUSIONS[f].a === id || FUSIONS[f].b === id);

// 원소 반응(길잡이 표시용)
export const REACTIONS = [
  ['동결 → 절단·파동', '파쇄', '+3 피해, 주변에 얼음 파편'],
  ['중독 → 전격', '감전 폭발', '중독 수치만큼 추가 피해가 주변까지 터진다'],
  ['동결 → 전격', '초전도', '+1 피해, 연쇄 +1'],
  ['중독 → 파동', '독 확산', '파동에 휩쓸린 적에게 중독이 번진다'],
];
