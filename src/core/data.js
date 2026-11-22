// 게임 데이터 — 규칙 엔진과 연출이 함께 참조한다.

export const ROWS = 6;
export const LANES = 3;
export const FRONT = ROWS - 1; // 플레이어(결계선) 바로 앞 줄
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
};

export const SHOT_NAMES = {
  blade: ['', '절단', '쌍월참', '만월 가르기'],
  wave: ['', '파동', '해일', '종소리 해일'],
  frost: ['', '동결', '서리창', '한겨울'],
  spark: ['', '전격', '연쇄 뇌격', '번개 축제'],
  venom: ['', '중독', '맹독 줄기', '독안개'],
  lantern: ['', '방어막', '큰 방어막', '등불 축제'],
};

// 기술 수치. gild = 금빛 릴 수(피해 +1, 고유 능력 +1)
export function shotStats(symbol, tier, gild = 0) {
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
    case 'lantern':
      if (tier === 1) return { guard: 2 + g, heal: 0 };
      if (tier === 2) return { guard: 3 + g, heal: 2 };
      return { guard: 4 + g, heal: 5, exposeAll: true };
  }
  return {};
}

export function shotDesc(symbol, tier, gild = 0) {
  const s = shotStats(symbol, tier, gild);
  switch (symbol) {
    case 'blade':
      if (tier === 1) return `관통 ${s.pierce} · 피해 ${s.dmg} · 얼어붙은 적 파쇄`;
      if (tier === 2) return `레인 전체 관통 · 피해 ${s.dmg} · 파쇄`;
      return `레인 전체 ${s.dmg} + 양옆 레인 ${s.sideDmg} · 방패 무시`;
    case 'wave':
      if (tier === 1) return `첫 적 ${s.dmg} · 양옆·뒤 ${s.splash} (측면 피해는 방패 무시)`;
      if (tier === 2) return `첫 적 ${s.dmg} · 주변 8칸 ${s.splash}`;
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
    case 'lantern':
      if (tier === 1) return `방어막 +${s.guard}`;
      if (tier === 2) return `방어막 +${s.guard} · 체력 +${s.heal}`;
      return `방어막 +${s.guard} · 체력 +${s.heal} · 모든 적 노출`;
  }
  return '';
}

export const ENEMIES = {
  kasa: {
    name: '우산 도깨비', hp: 6, atk: 3, reach: 4,
    act: '체력이 가득하면 2칸씩 뛴다.',
    how: '한 대만 쳐도 느려진다. 공격은 [막기].',
  },
  mask: {
    name: '탈 방패병', hp: 10, atk: 5, shield: true, shieldHp: 2,
    act: '탈 방패가 정면 공격을 2번 막는다.',
    how: '두 번 치면 탈이 깨진다. 옆 파동·전격 연쇄·중독은 바로 통한다.',
  },
  archer: {
    name: '불씨 초롱', hp: 5, atk: 3, post: 1,
    act: '한 턴 조준한 뒤 불씨를 쏜다.',
    how: '얼리면 조준이 풀린다. 불씨는 [막기].',
  },
  elder: {
    name: '등롱 장로', hp: 50, atk: 3, boss: true,
    act: '소환 → 이동 → 충전 → 연속 발사를 반복.',
    how: '충전 중엔 받는 피해 +2. 발사는 한 발씩 [막기].',
  },
};

export const OBJECTIVES = {
  annihilate: '모든 적 처치',
  survive: '버티기',
  hunt: '우두머리 처치',
};

// units: [type, lane, row]
export const BATTLES = [
  {
    id: 'b1', name: '다리 어귀', night: '첫째 밤',
    objective: { type: 'annihilate' },
    intro: '행렬의 선두가 다리에 올랐다. 모두 쓰러뜨려라.',
    waves: [
      { at: 1, units: [['kasa', 0, 2], ['kasa', 2, 1], ['kasa', 1, 0]] },
      { at: 3, units: [['kasa', 1, 0], ['archer', 2, 0], ['kasa', 0, 0]] },
      { at: 5, units: [['kasa', 0, 0], ['archer', 1, 0], ['kasa', 2, 1], ['kasa', 2, 0]] },
    ],
  },
  {
    id: 'b2', name: '탈춤 행렬', night: '둘째 밤',
    objective: { type: 'survive', turns: 7 },
    pullWaves: false,
    intro: '끝없는 탈춤 행렬. 7턴 동안 쓰러지지 마라.',
    waves: [
      { at: 1, units: [['mask', 1, 3], ['kasa', 0, 1], ['kasa', 2, 1]] },
      { at: 2, units: [['kasa', 2, 0], ['archer', 0, 0], ['kasa', 1, 0]] },
      { at: 3, units: [['kasa', 1, 0], ['kasa', 0, 0]] },
      { at: 4, units: [['mask', 2, 0], ['kasa', 1, 0], ['archer', 0, 0]] },
      { at: 5, units: [['kasa', 0, 0], ['archer', 1, 0], ['kasa', 2, 0]] },
      { at: 6, units: [['mask', 0, 0], ['kasa', 1, 0], ['kasa', 2, 0]] },
    ],
  },
  {
    id: 'b3', name: '초롱 골목', night: '셋째 밤',
    objective: { type: 'annihilate' },
    intro: '불씨 초롱 떼가 탈 방패병 뒤에 숨어 쏜다. 모두 쓰러뜨려라.',
    waves: [
      { at: 1, units: [['mask', 0, 2], ['archer', 0, 0], ['kasa', 2, 3], ['archer', 2, 0], ['kasa', 1, 1]] },
      { at: 3, units: [['archer', 1, 0], ['kasa', 0, 0], ['kasa', 2, 0]] },
      { at: 5, units: [['mask', 1, 1], ['archer', 0, 0], ['archer', 2, 0], ['kasa', 1, 0]] },
    ],
  },
  {
    id: 'b4', name: '북소리 고개', night: '넷째 밤',
    objective: { type: 'survive', turns: 6 },
    pullWaves: false,
    intro: '행렬 본대가 한꺼번에 밀려온다. 6턴만 버텨라.',
    waves: [
      { at: 1, units: [['kasa', 0, 2], ['kasa', 1, 2], ['kasa', 2, 2], ['mask', 1, 0]] },
      { at: 2, units: [['archer', 0, 0], ['archer', 2, 0], ['kasa', 1, 0]] },
      { at: 3, units: [['mask', 0, 0], ['mask', 2, 0], ['kasa', 1, 0]] },
      { at: 4, units: [['kasa', 0, 0], ['kasa', 1, 0], ['kasa', 2, 0], ['archer', 1, 0]] },
      { at: 5, units: [['kasa', 0, 0], ['mask', 1, 0], ['kasa', 2, 0], ['archer', 0, 0]] },
    ],
  },
  {
    id: 'b5', name: '등롱 장로', night: '마지막 밤',
    objective: { type: 'hunt', target: 'elder' },
    pullWaves: false,
    intro: '행렬을 이끄는 등롱 장로가 나타났다. 장로를 꺼뜨려라.',
    waves: [
      { at: 1, units: [['elder', 1, 0], ['kasa', 0, 2], ['mask', 1, 3], ['kasa', 2, 1]] },
      { at: 3, units: [['archer', 2, 0], ['kasa', 0, 0]] },
      { at: 6, units: [['mask', 2, 0], ['archer', 0, 0]] },
    ],
  },
];

export const BASE_STRIP = [
  'blade', 'wave', 'frost', 'spark', 'lantern', 'venom',
  'blade', 'wave', 'frost', 'spark',
  'blade', 'wave', 'frost', 'spark', 'lantern', 'venom',
];

export const REWARDS = {
  heal: { name: '등잔 기름', desc: '체력 7 회복', icon: 'heal' },
  maxhp: { name: '질긴 심지', desc: '최대 체력 +3, 체력 3 회복', icon: 'maxhp' },
  stripBlade: { name: '절단 부적', desc: '슬롯에 절단 문양이 더 자주 나온다', icon: 'blade', sym: 'blade' },
  stripWave: { name: '파동 부적', desc: '슬롯에 파동 문양이 더 자주 나온다', icon: 'wave', sym: 'wave' },
  stripFrost: { name: '동결 부적', desc: '슬롯에 동결 문양이 더 자주 나온다', icon: 'frost', sym: 'frost' },
  stripSpark: { name: '전격 부적', desc: '슬롯에 전격 문양이 더 자주 나온다', icon: 'spark', sym: 'spark' },
  stripVenom: { name: '중독 부적', desc: '슬롯에 중독 문양이 더 자주 나온다', icon: 'venom', sym: 'venom' },
};

// 유물: 한 판의 "빌드"를 결정한다. 규칙은 battle.js의 has(st, id) 지점에서 적용.
export const RELICS = {
  frostbite: { name: '서리 방울', color: '#7cc8ff', build: '동결·파쇄', proc: '파쇄 → 주변 동결', desc: '파쇄가 터지면 주변 적도 얼어붙는다' },
  thunderDrum: { name: '천둥 북', color: '#ffe45c', build: '연쇄 처치', proc: '처치 → 번개', desc: '적을 처치할 때마다 가까운 적에게 번개 2' },
  counterMirror: { name: '되치기 거울', color: '#ffd84a', build: '막기·되치기', proc: '퍼펙트 막기 → 방어막', desc: '되치기 피해 +2 · 퍼펙트 막기마다 방어막 +1' },
  gamblerCoin: { name: '도박꾼의 엽전', color: '#c58cff', build: '다시 굴리기', proc: '다시 굴림 → 방어막', desc: '다시 굴리기 +1회 · 굴릴 때마다 방어막 +1' },
  emberWick: { name: '불씨 심지', color: '#ffb347', build: '금빛 강화', proc: '', desc: '매 전투 금빛 릴 1개로 시작 · 금빛 공격 피해 +1' },
  tideBell: { name: '파도 방울', color: '#4ff0c4', build: '파동·밀치기', proc: '파동 직격 → 밀어냄', desc: '파동 옆 피해 +1 · 직격당한 적은 1칸 밀린다' },
  whetstone: { name: '달빛 숫돌', color: '#cfd8ff', build: '절단 관통', proc: '절단 처치 → 방어막', desc: '절단 관통 +1 · 절단으로 처치하면 방어막 +1' },
  shadowShoes: { name: '그림자 신', color: '#8fe8ff', build: '회피', proc: '회피 → 반격', desc: '회피가 쉬워진다 · 회피하면 그 적에게 2 피해' },
  oilFlask: { name: '등잔 기름병', color: '#ff9a5a', build: '방어막', proc: '방어막 사용 → 회복', desc: '방어막 기술을 쓸 때 체력 +1 · 방어막 최대 +2' },
};
export const RELIC_IDS = Object.keys(RELICS);
