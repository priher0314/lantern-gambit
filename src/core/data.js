// 게임 데이터 — 규칙 엔진과 연출이 함께 참조한다.

export const ROWS = 6;
export const LANES = 3;
export const FRONT = ROWS - 1; // 플레이어(결계선) 바로 앞 줄
export const GUARD_CAP = 6;
export const EMBER_CAP = 3;
export const REROLLS_PER_TURN = 2;

export const SYMBOL_IDS = ['blade', 'wave', 'frost', 'spark', 'lantern'];

export const SYMBOLS = {
  blade: { name: '절단', ink: '#3b46b0', tint: '#dfe4ff', fx: '#eef2ff', fx2: '#8fa8ff' },
  wave: { name: '파동', ink: '#0d8f74', tint: '#cff5e8', fx: '#4ff0c4', fx2: '#0fae8a' },
  frost: { name: '동결', ink: '#2b7fd0', tint: '#d6ecff', fx: '#b8e6ff', fx2: '#4aa6ff' },
  spark: { name: '전격', ink: '#7b3fd0', tint: '#fff2b0', fx: '#ffe45c', fx2: '#b77cff' },
  lantern: { name: '등불', ink: '#d0532a', tint: '#ffe2c0', fx: '#ffc266', fx2: '#ff7a3d' },
  counter: { name: '되치기', ink: '#b8860b', tint: '#fff0b0', fx: '#ffd84a', fx2: '#ff9f1a' },
};

export const SHOT_NAMES = {
  blade: ['', '절단', '쌍월참', '만월 가르기'],
  wave: ['', '파동', '해일', '종소리 해일'],
  frost: ['', '동결', '서리창', '한겨울'],
  spark: ['', '전격', '연쇄 뇌격', '번개 축제'],
  lantern: ['', '등불 수호', '밝은 수호', '등불 축제'],
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
    case 'lantern':
      if (tier === 1) return `방어막 +${s.guard}`;
      if (tier === 2) return `방어막 +${s.guard} · 체력 +${s.heal}`;
      return `방어막 +${s.guard} · 체력 +${s.heal} · 모든 적 노출`;
  }
  return '';
}

export const ENEMIES = {
  kasa: {
    name: '우산 도깨비', hp: 5, atk: 2, reach: 4,
    tip: '체력이 가득하면 두 칸씩 뛰어온다. 앞 두 줄에서 혀로 후려친다. 금빛 공격 → 막기로 되치기!',
  },
  mask: {
    name: '탈 방패병', hp: 9, atk: 4, shield: true,
    tip: '정면 공격을 탈로 막는다. 파동의 측면 피해·전격 연쇄로 우회. 붉은 내려치기는 회피 → 약점 노출!',
  },
  archer: {
    name: '불씨 초롱', hp: 4, atk: 2, post: 1,
    tip: '뒤에서 조준한 뒤 불씨를 쏜다. 동결로 조준을 끊거나 퍼펙트 막기로 되돌려라.',
  },
  elder: {
    name: '등롱 장로', hp: 32, atk: 2, boss: true,
    tip: '충전 중에는 등불 심장이 드러나 받는 피해 +2. 일제 사격을 퍼펙트로 막으면 반사된다.',
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
    id: 'b3', name: '등롱 장로', night: '셋째 밤',
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
  'blade', 'wave', 'frost', 'spark', 'lantern',
  'blade', 'wave', 'frost', 'spark',
  'blade', 'wave', 'frost', 'spark', 'lantern',
];

export const REWARDS = {
  heal: { name: '등잔 기름', desc: '체력 7 회복', icon: 'heal' },
  maxhp: { name: '질긴 심지', desc: '최대 체력 +3, 체력 3 회복', icon: 'maxhp' },
  stripBlade: { name: '절단 부적', desc: '모든 릴에 절단 문양 +1 (연결 확률↑)', icon: 'blade', sym: 'blade' },
  stripWave: { name: '파동 부적', desc: '모든 릴에 파동 문양 +1', icon: 'wave', sym: 'wave' },
  stripFrost: { name: '동결 부적', desc: '모든 릴에 동결 문양 +1', icon: 'frost', sym: 'frost' },
  stripSpark: { name: '전격 부적', desc: '모든 릴에 전격 문양 +1', icon: 'spark', sym: 'spark' },
  embers: { name: '불씨 주머니', desc: '매 전투를 불씨 2개로 시작 (첫 돌리기에 금빛 릴 2개)', icon: 'ember' },
  hat: { name: '대나무 삿갓', desc: '매 전투를 방어막 3으로 시작', icon: 'guard' },
};
