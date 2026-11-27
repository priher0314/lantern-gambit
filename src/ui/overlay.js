// HTML 오버레이 화면: 타이틀, 플레이 방법, 유물·보상 선택, 길잡이, 결과, 설정
import { CHARACTERS, CHARACTER_IDS, symbolsOf, SYMBOL_IDS, AFFINITY, RUN_LENGTH, SYMBOLS, ENEMIES, RELICS, RELIC_IDS, REACTIONS, GAME_TITLE, GAME_VERSION, FUSIONS, fusionOf, MODS, OBJ_INFO, COIN_LABEL, NIGHT_NAMES, STOPS, SHRINE_COST } from '../core/data.js';
import { rewardInfo, cantBuy, buyItem, rerollShop, shopRerollCost } from '../core/run.js';
import { drawSymbol, drawIcon, drawRelicIcon, drawMerchant } from '../render/art.js';
import { drawCoin } from '../render/scene.js';
import { tr, localize, getLang } from '../i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);

function iconCanvas(kind, size = 56) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = SYMBOLS[kind] ? SYMBOLS[kind].tint : '#3a2440';
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#d8a548';
  g.lineWidth = 2;
  g.stroke();
  if (SYMBOLS[kind]) drawSymbol(g, kind, size / 2, size / 2, size * 0.32);
  else {
    if (kind === 'coin') {
      drawCoin(g, size / 2, size / 2, size * 0.26);
      return c;
    }
    const map = { heal: ['heart', '#ff6a7a'], maxhp: ['plus', '#ff6a7a'] };
    const [ic, col] = map[kind] || ['dots', '#fff'];
    drawIcon(g, ic, size / 2, size / 2, size * 0.55, col);
  }
  return c;
}

const relicChip = (id, cls = '') => {
  const R = RELICS[id];
  return `<span class="relic-chip ${cls}" style="--c:${R.color}"><canvas class="relic-cv" data-relic="${id}" data-size="24"></canvas>${R.name}</span>`;
};

// 유물 그림 아이콘을 캔버스에 그려 넣는다
function paintRelics(root) {
  root.querySelectorAll('canvas[data-relic]').forEach((c) => {
    const size = Number(c.dataset.size) || 24;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = size * dpr;
    c.style.width = c.style.height = size + 'px';
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const R = RELICS[c.dataset.relic];
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 1.5, 0, Math.PI * 2);
    g.fillStyle = '#1d1128';
    g.fill();
    g.lineWidth = Math.max(1.5, size * 0.05);
    g.strokeStyle = R.color;
    g.stroke();
    drawRelicIcon(g, c.dataset.relic, size / 2, size / 2, size * 0.3);
  });
}

export class Overlay {
  constructor(root, hooks) {
    this.root = root;
    this.hooks = hooks;
    this.layer = document.createElement('div');
    this.layer.className = 'ov-layer';
    root.appendChild(this.layer);
  }

  fit(w, h, scale, wide = false) {
    this.root.style.width = w + 'px';
    this.root.style.height = h + 'px';
    this.root.style.setProperty('--s', scale);
    this.root.classList.toggle('wide', wide);
  }

  clear() {
    this.layer.innerHTML = '';
    this.layer.classList.remove('on');
  }

  panel(html, cls = '') {
    this.layer.innerHTML = `<div class="ov-panel ${cls}">${html}</div>`;
    this.layer.classList.add('on');
    localize(this.layer);
    paintRelics(this.layer);
    return this.layer.firstElementChild;
  }

  showTitle(meta) {
    const used = (meta.relicsUsed || []).length;
    const saved = this.hooks.getSaved ? this.hooks.getSaved() : null;
    let sure = false;
    const p = this.panel(`
      <div class="title-emblem"><svg viewBox="0 0 120 120" aria-hidden="true">
        <defs><radialGradient id="tg"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>
        <circle cx="60" cy="60" r="58" fill="url(#tg)" opacity="0.32"/>
        <path d="M74 14 A46 46 0 1 0 106 76 A36 36 0 0 1 74 14 Z" fill="#ffe08a" stroke="#170d22" stroke-width="3" stroke-linejoin="round"/>
        <line x1="60" y1="36" x2="60" y2="52" stroke="#8a5a1a" stroke-width="2.5"/>
        <rect x="51" y="51" width="18" height="5" rx="2" fill="#3a2418" stroke="#170d22" stroke-width="2"/>
        <rect x="47" y="56" width="26" height="28" rx="10" fill="#e2453c" stroke="#170d22" stroke-width="3"/>
        <rect x="54" y="62" width="12" height="16" rx="5" fill="#ffe9a8"/>
        <rect x="53" y="84" width="14" height="4" rx="2" fill="#3a2418" stroke="#170d22" stroke-width="2"/>
        <line x1="60" y1="88" x2="60" y2="98" stroke="#d8a548" stroke-width="2.5" stroke-linecap="round"/>
      </svg></div>
      <div class="title-logo">
        <div class="logo-main">${GAME_TITLE}</div>
        <div class="logo-tag"><i></i><span>새벽이 올 때까지, 돌려라</span><i></i></div>
      </div>
      <div class="title-btns">
        ${saved ? `<button class="btn btn-primary" data-a="resume">이어하기 <small>${NIGHT_NAMES[saved.run.stage]}</small></button>` : ''}
        <button class="btn ${saved ? '' : 'btn-primary'}" data-a="start">새 게임</button>
        <button class="btn" data-a="howto">게임 방법</button>
        <button class="btn" data-a="settings">설정</button>
        ${window.desktop ? '<button class="btn" data-a="exit">게임 종료</button>' : ''}
      </div>
      <div class="title-stats">
        <div class="title-meta">${meta.runs ? `플레이 ${meta.runs}회 · 클리어 ${meta.wins || 0}회 · 최고 기록 ${meta.best || 0}/${RUN_LENGTH}` : '첫 플레이'}</div>
        <div class="title-meta">유물 ${used}/${RELIC_IDS.length}</div>
      </div>
      ${meta.tier || (meta.guideDone && meta.heirloom && RELICS[meta.heirloom]) ? `<div class="title-tier">${meta.tier ? `<b>${meta.tier + 1}단계</b>` : ''}${meta.guideDone && meta.heirloom && RELICS[meta.heirloom] ? `<span>물려받은 유물</span>${relicChip(meta.heirloom)}` : ''}</div>` : ''}
      <div class="title-foot">${GAME_VERSION}</div>
    `, 'title');
    p.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      this.hooks.sound('ui');
      if (a === 'start') {
        // 저장된 판이 있으면 한 번 더 묻는다
        if (saved && !sure) {
          sure = true;
          e.target.closest('[data-a]').textContent = tr('저장된 판을 지우고 새로 시작');
          return;
        }
        this.clear();
        this.hooks.start();
      }
      if (a === 'resume') {
        this.clear();
        this.hooks.resume();
      }
      if (a === 'howto') this.showHowTo(() => this.showTitle(meta));
      if (a === 'settings') this.openSettings(() => this.showTitle(meta));
      if (a === 'exit' && window.desktop) window.desktop.quit();
      if (a === 'lang') {
        this.hooks.setSetting('lang', getLang() === 'en' ? 'ko' : 'en');
        this.showTitle(meta);
      }
    });
  }

  howToHtml() {
    if (getLang() === 'en') {
      return `
      <div class="howto">
        <div class="ht"><b>Lever</b><span>Pull it: the 3 cells of the <em>middle row</em> are this turn's attacks.</span></div>
        <div class="ht"><b>Link · Jackpot</b><span>Two matching neighbors on the middle row make a <em>Link</em>, three make a <em>Jackpot</em>.</span></div>
        <div class="ht"><b>Bingo</b><span>Three matching on the top row, bottom row or a diagonal give a <em>bonus skill</em>. Guard symbols are <em>wild</em>.</span></div>
        <div class="ht"><b>Reroll</b><span>Twice per turn. <em>The first is free</em>. The second has the <em class="r">cost</em> written on the button and gives <em>+1 Gilded reel</em>.</span></div>
        <div class="ht"><b>Gilded reel</b><span>That reel's attack gets +1 damage and +1 effect.</span></div>
        <div class="ht"><b>Aim</b><span>Pick a reel, then click a lane.</span></div>
        <div class="ht"><b>Snipe</b><span>Once per turn, <em>click an enemy in the back</em> to skip the front enemy and hit it. (F key)</span></div>
        <div class="ht"><b>Matchups</b><span>Each enemy has a <em>weakness</em> (+2 damage) and a <em class="r">resistance</em> (-1 direct damage). Pick a skill to see the marks on enemies.</span></div>
        <div class="ht"><b>Roles</b><span>Slash = pierce / Wave = <em>pushes back</em> the front row / Bomb = lands at the back, <em>round blast</em> / Frost = cancel actions / Spark = chain / Poison = damage over time</span></div>
        <div class="ht"><b>Combos</b><span>Frost → Slash/Wave = <em>Shatter</em> / Frost → Spark = <em>Conduct</em> / Wave (Wet) → Spark = <em>Surge +2</em> / Wave (Wet) → Frost = <em>Deep freeze +1 turn</em> / Poison → Spark = <em>Detonate</em> / Poison → Wave = <em>Spread</em> / Poison → Slash = <em>Poison +2</em></span></div>
        <div class="ht"><b>Stamina</b><span>Block costs 1, Dodge 2. <em class="r">Without enough, you get hit.</em> A perfect dodge costs 1. +1 each turn; Guard symbols restore more.</span></div>
        <div class="ht"><b>Training</b><span>Train a symbol in the shop to strengthen that skill for the whole run.</span></div>
        <div class="ht"><b>Characters</b><span>The <em>Swordhand</em> has Slash (pierces from the front); the <em>Bombardier</em> has Bomb (lands on the rearmost enemy, bursts around it, ignores shields). The other symbols are shared.</span></div>
        <div class="ht"><b>Parry</b><span><em class="g">Gold or orange ring</em> → Block (precise = counter)<br><em class="r">Red ring</em> → Dodge (enemy exposed, double damage)</span></div>
        <div class="ht"><b>Coins</b><span>Earned from <em>combos</em> (3rd kill in a turn onward), <em>perfects</em>, <em>bingos</em> and the <em>clear</em> bonus for surviving a night. A plain kill pays 0.</span></div>
        <div class="ht"><b>Crossroads</b><span>After each night, two of <em>Shop</em>, <em>Rest</em> and <em>Shrine</em> are open and you visit <em>only one</em>. The shrine trades HP for a relic.</span></div>
        <div class="ht"><b>Roads</b><span>Each night, choose a <em>Safe Road</em> or a <em class="r">Rough Road</em> (extra condition, double coins).</span></div>
        <div class="ht"><b>Relics</b><span>Upgrade to <em>II</em>; a II relic that triggers 6 times <em>evolves to III</em>. Matching pairs can be <em>fused</em>.</span></div>
        <div class="ht"><b>Enemy info</b><span><em>Right-click</em> an enemy (or press and hold).</span></div>
        <div class="ht"><b>Keys</b><span>Space lever·block / R reroll / Q W E reels / 1 2 3 lanes / K dodge / Enter end turn / H help / Esc settings<br>Choice screens: 1-4 pick / Enter confirm</span></div>
        <div class="ht"><b>Gamepad</b><span>A lever·fire·block / B dodge / X reroll / Y end turn / LB RB reels / D-pad or stick: lanes / Start settings / Back help</span></div>
      </div>`;
    }
    return `
      <div class="howto">
        <div class="ht"><b>레버</b><span>당기면 <em>가운데 줄</em> 3칸이 이번 턴의 공격.</span></div>
        <div class="ht"><b>연결·잭팟</b><span>가운데 줄에서 이웃 2칸이 같으면 <em>연결</em>, 3칸이면 <em>잭팟</em>.</span></div>
        <div class="ht"><b>빙고</b><span>위·아래 줄이나 대각선 3칸이 같으면 <em>보너스 기술</em>. 방어막 문양은 <em>조커</em>.</span></div>
        <div class="ht"><b>다시 돌리기</b><span>턴마다 2번. <em>첫 번째는 대가 없음</em>. 두 번째는 버튼에 적힌 <em class="r">대가</em>가 따르고 <em>금빛 릴 +1</em>.</span></div>
        <div class="ht"><b>금빛 릴</b><span>그 칸의 공격이 피해 +1, 효과 +1.</span></div>
        <div class="ht"><b>조준</b><span>슬롯의 문양을 고르고 레인을 누른다.</span></div>
        <div class="ht"><b>저격</b><span>턴마다 1번, <em>뒤에 있는 적을 직접 눌러</em> 맨 앞 적을 건너뛰고 맞힌다. (F 키)</span></div>
        <div class="ht"><b>상성</b><span>적마다 <em>약점</em>(피해 +2)과 <em class="r">저항</em>(직격 피해 -1)이 있다. 기술을 고르면 적 옆에 표시된다.</span></div>
        <div class="ht"><b>역할</b><span>절단 = 관통 / 파동 = 맨 앞 가로줄을 <em>밀어내기</em> / 폭탄 = 맨 뒤에 떨어져 <em>둥글게 폭발</em> / 동결 = 행동 취소 / 전격 = 연쇄 / 중독 = 지속 피해</span></div>
        <div class="ht"><b>조합</b><span>동결 → 절단·파동 = <em>파쇄</em> / 동결 → 전격 = <em>초전도</em> / 파동(젖음) → 전격 = <em>감전 +2</em> / 파동(젖음) → 동결 = <em>꽁꽁 +1턴</em> / 중독 → 전격 = <em>감전 폭발</em> / 중독 → 파동 = <em>독 확산</em> / 중독 → 절단 = <em>중독 +2</em></span></div>
        <div class="ht"><b>기력</b><span>막기 1, 회피 2. <em class="r">모자라면 맞는다.</em> 퍼펙트 회피는 1. 매 턴 +1, 등불을 쓰면 더 찬다.</span></div>
        <div class="ht"><b>수련</b><span>상점에서 문양을 단련하면 그 기술이 이번 판 내내 강해진다.</span></div>
        <div class="ht"><b>캐릭터</b><span><em>칼잡이</em>는 절단(앞부터 관통), <em>폭탄꾼</em>은 폭탄(맨 뒤 적에게 떨어져 주변까지, 방패 무시). 나머지 문양은 같다.</span></div>
        <div class="ht"><b>받아치기</b><span><em class="g">금빛·주황 고리</em> → 막기 (정확하면 되치기)<br><em class="r">붉은 고리</em> → 회피 (적에게 빈틈, 피해 2배)</span></div>
        <div class="ht"><b>코인</b><span><em>연속 처치</em>(한 턴 3마리째부터), <em>퍼펙트</em>, <em>빙고</em>, 밤을 넘긴 <em>클리어</em> 보너스로 번다. 그냥 처치하면 0.</span></div>
        <div class="ht"><b>갈림길</b><span>밤을 넘기면 <em>상점</em>·<em>쉼터</em>·<em>사당</em> 중 열린 두 곳에서 <em>한 곳만</em> 들른다. 사당은 체력을 바치고 유물을 받는다.</span></div>
        <div class="ht"><b>길</b><span>밤마다 <em>순한 길</em>과 <em class="r">험한 길</em>(조건 추가, 코인 2배) 중 고른다.</span></div>
        <div class="ht"><b>유물</b><span>강화하면 <em>II</em>, II가 6번 발동하면 <em>III 진화</em>. 짝이 맞는 두 유물은 <em>융합</em>.</span></div>
        <div class="ht"><b>적 정보</b><span>적을 <em>우클릭</em> (터치는 길게 누르기).</span></div>
        <div class="ht"><b>조작키</b><span>Space 레버·막기 / R 다시 돌리기 / Q W E 릴 / 1 2 3 레인 / K 회피 / Enter 턴 종료 / H 도움말 / Esc 설정<br>선택 화면: 1~4 고르기 / Enter 확인</span></div>
        <div class="ht"><b>게임패드</b><span>A 레버·쏘기·막기 / B 회피 / X 다시 돌리기 / Y 턴 종료 / LB RB 릴 / 십자키·스틱 레인 / Start 설정 / Back 도움말</span></div>
      </div>`;
  }

  showHowTo(back) {
    const p = this.panel(`<h2>게임 방법</h2>${this.howToHtml()}<button class="btn btn-primary" data-a="back">확인</button>`, 'howto-panel');
    p.addEventListener('click', (e) => {
      if (e.target.closest('[data-a="back"]')) {
        this.hooks.sound('ui');
        back();
      }
    });
  }

  // 전투 중 길잡이: 예고 읽는 법 + 지금 전투의 적 + 내 유물
  showGuide({ types, relics }) {
    const legend = [
      ['#d9e2ff', 'N칸 전진', '이번 차례에 그만큼 다가온다'],
      ['#ffcc33', '공격 N', '금빛 고리 — 막기로 받고 되치기'],
      ['#ff4d5e', '강타 준비 / 강타 N', '준비 다음 차례에 붉은 고리 — 회피'],
      ['#ff9a3d', '조준 중 / 발사 N', '조준 다음 차례에 주황 고리 — 막기'],
      ['#ffe08a', '사격 준비', '왕초롱 충전 — 그동안 받는 피해 +2'],
      ['#50f0be', '방패 N', '정면 공격을 N번 막는다 — 치면 깎인다'],
      ['#a6f04a', '독 N', '턴이 끝날 때 N 피해, 그 뒤 1 감소'],
      ['#9fdcff', '얼음', '행동 불가 — 절단·파동으로 치면 파쇄'],
    ];
    const p = this.panel(`
      <h2>도움말</h2>
      <div class="guide">
        <h3>적 머리 위 표시</h3>
        ${legend.map(([c, a, b]) => `<div class="gl"><b style="color:${c}">${a}</b><span>${b}</span></div>`).join('')}
        <h3>이 전투의 적</h3>
        ${types.map((t) => `<div class="ge"><b>${ENEMIES[t].name}</b><span>${ENEMIES[t].act}</span><span class="how">공략: ${ENEMIES[t].how}</span>${AFFINITY[t] ? `<span class="aff">${AFFINITY[t].weak ? `약점: ${SYMBOLS[AFFINITY[t].weak].name}` : ''}${AFFINITY[t].weak && AFFINITY[t].resist ? ' · ' : ''}${AFFINITY[t].resist ? `저항: ${SYMBOLS[AFFINITY[t].resist].name}` : ''}</span>` : ''}</div>`).join('')}
        <h3>반응 (순서가 중요)</h3>
        ${REACTIONS.map(([a, n, d]) => `<div class="gl"><b style="color:#8fffe2">${a}</b><span><em>${n}</em> — ${d}</span></div>`).join('')}
        <h3>내 유물</h3>
        ${relics.length ? relics.map((id) => `<div class="ge">${relicChip(id)}<span>${RELICS[id].desc}</span></div>`).join('') : '<div class="ge"><span>아직 없음</span></div>'}
        <h3>기본 규칙</h3>
        ${this.howToHtml()}
      </div>
      <button class="btn btn-primary" data-a="close">닫기</button>
    `, 'guide-panel');
    this.hooks.pause(true);
    p.addEventListener('click', (e) => {
      if (e.target.closest('[data-a="close"]')) {
        this.hooks.sound('ui');
        this.hooks.pause(false);
        this.clear();
      }
    });
  }

  // 유물/보상 고르기(필수 선택). o: { title, req, ids, go, run, used }
  // 캐릭터 고르기: 문양 다섯 가지는 같고 고유 기술 하나가 다르다
  showCharacters(cur, onPick) {
    let picked = CHARACTERS[cur] ? cur : 'blade';
    const cards = CHARACTER_IDS.map((id) => {
      const c = CHARACTERS[id];
      return `<button class="rw-card ${id === picked ? 'sel' : ''}" data-id="${id}" style="--c:${c.color}">
        <span class="rw-ic"></span>
        <span class="rw-top"><span class="rw-name">${c.name}</span><span class="rw-tag">${SYMBOLS[c.sig].name}</span></span>
        <span class="rw-desc">${c.desc.split(' · ').map((t) => `<span>${t}</span>`).join('')}</span>
      </button>`;
    }).join('');
    const p = this.panel(`
      <div class="rw-head">
        <h2>누구로 떠날까요?</h2>
        <div class="rw-req">문양 다섯 가지는 같고, 고유 기술 하나가 다르다</div>
      </div>
      <div class="rw-cards">${cards}</div>
      <button class="btn btn-primary rw-go">이 캐릭터로</button>
      <button class="btn" data-a="back">뒤로</button>
    `, 'reward');
    p.querySelectorAll('.rw-card').forEach((el) => $('.rw-ic', el).appendChild(iconCanvas(CHARACTERS[el.dataset.id].sig, 52)));
    p.addEventListener('click', (e) => {
      const card = e.target.closest('.rw-card');
      if (card) {
        picked = card.dataset.id;
        p.querySelectorAll('.rw-card').forEach((c) => c.classList.toggle('sel', c === card));
        this.hooks.sound('select');
      }
      if (e.target.closest('.rw-go')) {
        this.clear();
        onPick(picked);
      }
      if (e.target.closest('[data-a="back"]')) {
        this.hooks.sound('ui');
        this.hooks.title();
      }
    });
  }

  showPick(o, onPick) {
    let picked = null;
    const run = o.run;
    // 숫자(+1, 2턴 등)를 굵게 보여 한눈에 읽히게 한다
    const strong = (s) => s.replace(/([+\-]?\d+(?:회|턴|칸|개)?)/g, '<b>$1</b>');
    const cards = o.ids.map((id) => {
      const r = rewardInfo(id);
      const isNew = !o.plain && r.relic && !r.upgrade && !r.fuse && !o.used.includes(id);
      const badge = r.fuse ? '융합' : r.upgrade ? '강화' : r.relic ? r.tag : '소모품';
      let lines = tr(r.desc).split(' · ').map((t) => `<span>${strong(t)}</span>`).join('');
      if (r.fuse) lines += `<span class="rw-hint on">${r.parts[0]} + ${r.parts[1]} · 두 효과는 유지</span>`;
      // 조합 힌트: 이 유물이 무엇과 합쳐지는지 미리 보여준다
      const fz = !o.plain && r.relic && !r.fuse && !r.upgrade ? fusionOf(r.relicId) : null;
      if (fz) {
        const other = FUSIONS[fz].a === r.relicId ? FUSIONS[fz].b : FUSIONS[fz].a;
        const have = run.relics.includes(other);
        lines += `<span class="rw-hint ${have ? 'on' : ''}">+ ${RELICS[other].name} = ${FUSIONS[fz].name}${have ? ' (보유 중!)' : ''}</span>`;
      }
      return `<button class="rw-card ${r.relic ? 'is-relic' : ''}" data-id="${id}" style="--c:${r.relic ? r.color : '#d8a548'}">
        <span class="rw-ic">${r.relic ? `<canvas class="relic-cv" data-relic="${r.relicId}" data-size="52"></canvas>` : ''}</span>
        <span class="rw-top"><span class="rw-name">${r.name}</span><span class="rw-tag">${badge}</span>${isNew ? '<em class="new">NEW</em>' : ''}</span>
        <span class="rw-desc">${lines}</span>
      </button>`;
    }).join('');
    // 지난 클리어에서 물려받은 유물은 따로 밝힌다(왜 이미 가지고 있는지 알 수 있게)
    const heirId = run.heirloom && run.relics.includes(run.heirloom) ? run.heirloom : null;
    const owned = run.relics.filter((id) => id !== heirId);
    const p = this.panel(`
      <div class="rw-head">
        <h2>${o.title}</h2>
        <div class="rw-req">${o.req}</div>
      </div>
      ${heirId ? `<div class="rw-build heir-note"><span>물려받은 유물</span>${relicChip(heirId)}<small>지난번 클리어 때 고른 유물 · 이번 판을 가지고 시작한다</small></div>` : ''}
      ${owned.length ? `<div class="rw-build"><span>보유</span>${owned.map((id) => relicChip(id)).join('')}</div>` : ''}
      <div class="rw-cards">${cards}</div>
      <button class="btn btn-primary rw-go" disabled>${o.go}</button>
      ${o.skip ? `<button class="btn" data-a="skip">${o.skip}</button>` : ''}
    `, 'reward');
    p.querySelectorAll('.rw-card:not(.is-relic)').forEach((el) => {
      $('.rw-ic', el).appendChild(iconCanvas(rewardInfo(el.dataset.id).icon, 52));
    });
    const go = $('.rw-go', p);
    p.addEventListener('click', (e) => {
      const card = e.target.closest('.rw-card');
      if (card) {
        picked = card.dataset.id;
        p.querySelectorAll('.rw-card').forEach((c) => c.classList.toggle('sel', c === card));
        go.disabled = false;
        this.hooks.sound('select');
      }
      if (e.target.closest('.rw-go') && picked) {
        go.disabled = true;
        this.clear();
        onPick(picked);
      }
      if (e.target.closest('[data-a="skip"]')) {
        this.hooks.sound('ui');
        this.clear();
        onPick(null);
      }
    });
  }

  // 갈림길: 열린 곳 중 한 곳만 들른다
  showStops(run, kinds, bank, onPick) {
    let picked = null;
    const strong = (s) => s.replace(/([+\-]?\d+(?:회|턴|칸|개)?)/g, '<b>$1</b>');
    const now = {
      shop: `<span class="pay">가진 코인 ${run.coins}</span>`,
      rest: `<span class="pay">체력 ${run.hp}/${run.maxHp}</span>`,
      shrine: `<span class="pay hot">체력 ${run.hp} → ${run.hp - Math.min(SHRINE_COST, Math.max(0, run.hp - 1))}</span>`,
    };
    const cards = kinds.map((k) => {
      const s = STOPS[k];
      const lines = s.desc.split(' · ').map((t) => `<span>${strong(t)}</span>`).join('');
      return `<button class="rw-card path stop" data-k="${k}" style="--c:${s.color}">
        <span class="rw-ic"><i data-ic="${s.icon}" data-sz="48"></i></span>
        <span class="rw-top"><span class="rw-name">${s.name}</span><span class="rw-tag">${s.tag}</span></span>
        <span class="rw-desc">${lines}${now[k]}</span>
      </button>`;
    }).join('');
    const by = bank ? Object.entries(bank.by).filter(([, n]) => n > 0).map(([k, n]) => `${COIN_LABEL[k] || k} ${n}`).join(' · ') : '';
    const p = this.panel(`
      ${bank ? `<div class="shop-earn">이번 밤에 번 코인 <b>+${bank.gained}</b>${bank.mult > 1 ? ` (험한 길 ×${bank.mult})` : ''}<small>${by || ''}</small></div>` : ''}
      <div class="rw-head">
        <h2>어디에 들를까요?</h2>
        <div class="rw-req">한 곳만 들를 수 있다</div>
      </div>
      <div class="rw-cards">${cards}</div>
      <button class="btn btn-primary rw-go" disabled>들어간다</button>
    `, 'reward paths');
    p.querySelectorAll('i[data-ic]').forEach((el) => el.replaceWith(iconCanvas(el.dataset.ic, Number(el.dataset.sz))));
    const go = $('.rw-go', p);
    p.addEventListener('click', (e) => {
      const c = e.target.closest('.stop');
      if (c) {
        picked = c.dataset.k;
        p.querySelectorAll('.stop').forEach((x) => x.classList.toggle('sel', x === c));
        go.disabled = false;
        this.hooks.sound('select');
      }
      if (e.target.closest('.rw-go') && picked) {
        go.disabled = true;
        this.clear();
        onPick(picked);
      }
    });
  }

  // 상점: 코인으로 유물·강화·회복 등을 산다. 살 수 없는 물건은 접어서 아래로 내린다.
  // 상점: 보따리 도깨비가 물건 4개를 판다(유물 2 · 소모품 1 · 회복)
  showShop(run, shop, bank, onBought, onDone, hello) {
    const strong = (s) => s.replace(/([+\-]?\d+(?:회|턴|칸|개)?)/g, '<b>$1</b>');
    let mood = 'idle';
    let say = hello || '어서 오게. 좋은 것만 골라 왔지.';
    const render = () => {
      const cards = shop.items.map((it, i) => {
        const r = rewardInfo(it.id);
        const why = cantBuy(run, it);
        const badge = r.fuse ? '융합' : r.upgrade ? '강화' : r.relic ? r.tag : '소모품';
        let lines = tr(r.desc).split(' · ').map((t) => `<span>${strong(t)}</span>`).join('');
        const fz = r.relic && !r.fuse && !r.upgrade ? fusionOf(r.relicId) : null;
        if (fz) {
          const other = FUSIONS[fz].a === r.relicId ? FUSIONS[fz].b : FUSIONS[fz].a;
          const have = run.relics.includes(other);
          if (have) lines += `<span class="rw-hint on">+ ${RELICS[other].name} = ${FUSIONS[fz].name} (보유 중!)</span>`;
        }
        if (r.fuse) lines += `<span class="rw-hint on">${r.parts[0]} + ${r.parts[1]}</span>`;
        if (r.upgrade) lines += '<span class="rw-hint on">이미 가진 유물을 더 세게</span>';
        const price = it.sold ? '구매함' : why === '체력 가득' ? why : `<i class="coin"></i>${it.price}`;
        return `<button class="rw-card shop-item ${r.relic ? 'is-relic' : ''} ${why ? 'cant' : ''} ${it.sold ? 'sold' : ''}" data-i="${i}" style="--c:${r.relic ? r.color : '#d8a548'}">
          <span class="rw-ic">${r.relic ? `<canvas class="relic-cv" data-relic="${r.relicId}" data-size="48"></canvas>` : `<i data-ic="${r.icon}" data-sz="48"></i>`}</span>
          <span class="rw-top"><span class="rw-name">${r.name}</span><span class="rw-tag">${badge}</span><span class="price ${why ? 'no' : ''}">${price}</span></span>
          <span class="rw-desc">${lines}</span>
        </button>`;
      }).join('');
      const by = bank ? Object.entries(bank.by).filter(([, n]) => n > 0).map(([k, n]) => `${COIN_LABEL[k] || k} ${n}`).join(' · ') : '';
      const cost = shopRerollCost(shop);
      const p = this.panel(`
        <div class="shop-head">
          <canvas class="merchant" width="220" height="220"></canvas>
          <div class="shop-talk">
            <div class="shop-title">보따리 상점</div>
            <div class="bubble">${say}</div>
            <div class="shop-wallet"><i class="coin"></i><b>${run.coins}</b><span>체력 ${run.hp}/${run.maxHp}</span></div>
            <div class="deck">${symbolsOf(run.char).map((s) => `<span class="dk" style="--c:${SYMBOLS[s].fx}"><b>${SYMBOLS[s].name}</b>×${run.strips[0].filter((x) => x === s).length}${run.symLv && run.symLv[s] ? `<em>+${run.symLv[s]}</em>` : ''}</span>`).join('')}</div>
          </div>
        </div>
        ${bank ? `<div class="shop-earn">이번 밤에 번 코인 <b>+${bank.gained}</b>${bank.mult > 1 ? ` (험한 길 ×${bank.mult})` : ''}<small>${by || ''}</small></div>` : ''}
        <div class="rw-cards">${cards}</div>
        <div class="shop-foot">
          <button class="btn btn-small" data-a="reroll" ${run.coins < cost ? 'disabled' : ''}>다른 물건 보기 <i class="coin"></i>${cost}</button>
          <button class="btn btn-primary" data-a="leave">나가기</button>
        </div>
      `, 'reward shop');
      p.querySelectorAll('i[data-ic]').forEach((el) => el.replaceWith(iconCanvas(el.dataset.ic, Number(el.dataset.sz))));
      const mc = p.querySelector('.merchant');
      const mg = mc.getContext('2d');
      mg.setTransform(2, 0, 0, 2, 0, 0);
      drawMerchant(mg, 52, 108, 0.92, mood, 0);
      p.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'leave') {
          this.hooks.sound('ui');
          this.clear();
          onDone();
          return;
        }
        if (a === 'reroll') {
          if (rerollShop(run, shop)) {
            this.hooks.sound('select');
            mood = 'idle';
            say = '그럼 이건 어떤가?';
            render();
          } else this.hooks.sound('deny');
          return;
        }
        const card = e.target.closest('.shop-item');
        if (!card) return;
        const i = Number(card.dataset.i);
        const it = shop.items[i];
        const why = cantBuy(run, it);
        if (buyItem(run, shop, i)) {
          this.hooks.sound('buy');
          onBought(it.id);
          mood = 'happy';
          say = '좋은 눈이야! 잘 쓰게.';
        } else {
          this.hooks.sound('deny');
          mood = 'sorry';
          say = why === '코인 부족' ? '코인이 모자라는군.' : why === '체력 가득' ? '자넨 멀쩡해 보이는데?' : '그건 이미 가져갔잖나.';
        }
        render();
      });
    };
    render();
  }

  // 길 선택: 다음 밤의 목표·적 구성·조건·보상을 보고 고른다
  showPaths(run, defs, onPick, hint) {
    let picked = defs.length === 1 ? 0 : null;
    const card = (d, i) => {
      const enemies = d.elites ? `정예 ${d.elites}` : '';
      const mods = d.mods.map((m) => `<span class="mod"><b>${MODS[m].name}</b> ${MODS[m].desc}</span>`).join('');
      const kind = d.objective.type === 'hunt' ? '보스' : d.risky ? '험한 길' : '순한 길';
      const reward = d.objective.type === 'hunt' ? '' : d.risky ? `<span class="pay hot">코인 ×${d.coinMult}</span>` : '<span class="pay">코인 ×1</span>';
      return `<button class="rw-card path ${d.risky ? 'risky' : ''} ${picked === i ? 'sel' : ''}" data-i="${i}" style="--c:${d.risky ? '#ff6a5a' : '#8fe8ff'}">
        <span class="rw-top"><span class="rw-name">${d.name}</span><span class="rw-tag">${kind}</span></span>
        <span class="rw-desc"><span>목표: ${OBJ_INFO[d.objective.type].desc(d.objective)}</span>${enemies ? `<span class="foes">${enemies}</span>` : ''}${mods}${reward}</span>
      </button>`;
    };
    // 진행 지도: 지나온 밤 · 다음 밤 · 남은 밤 · 보스
    const nextStage = defs[0].stage;
    const map = Array.from({ length: RUN_LENGTH }, (_, i) => {
      const boss = i === RUN_LENGTH - 1;
      const cls = i < nextStage ? 'done' : i === nextStage ? 'next' : '';
      return `<span class="mn ${cls} ${boss ? 'boss' : ''}"><i>${i < nextStage ? '✓' : boss ? '★' : i + 1}</i><em>${i === nextStage ? '다음' : boss ? '보스' : ''}</em></span>`;
    }).join('<span class="ml"></span>');
    const p = this.panel(`
      <div class="map-wrap"><div class="map-title">${run.tier ? `${run.tier + 1}단계 · ` : ''}${RUN_LENGTH}번의 밤 중 ${nextStage}번을 넘겼다</div><div class="map">${map}</div></div>
      <div class="rw-head">
        <h2>${defs.length === 1 ? defs[0].night : `${defs[0].night}의 길을 고르세요`}</h2>
        <div class="rw-req">체력 ${run.hp}/${run.maxHp} · 코인 ${run.coins}</div>
        ${hint ? `<div class="first-hint">${hint}</div>` : ''}
      </div>
      <div class="rw-cards">${defs.map(card).join('')}</div>
      <button class="btn btn-primary rw-go" ${picked == null ? 'disabled' : ''}>출발</button>
    `, 'reward paths');
    const go = $('.rw-go', p);
    p.addEventListener('click', (e) => {
      const c = e.target.closest('.path');
      if (c) {
        picked = Number(c.dataset.i);
        p.querySelectorAll('.path').forEach((x) => x.classList.toggle('sel', x === c));
        go.disabled = false;
        this.hooks.sound('select');
      }
      if (e.target.closest('.rw-go') && picked != null) {
        go.disabled = true;
        this.clear();
        onPick(defs[picked]);
      }
    });
  }
  showResult(win, run, meta) {
    const t = run.totals;
    const used = meta.relicsUsed || [];
    const unseen = RELIC_IDS.filter((id) => !used.includes(id));
    const reached = win ? RUN_LENGTH : run.stage;
    const hint = unseen.length
      ? `<div class="rs-next"><b>아직 안 써본 유물 ${unseen.length}개</b><div>${unseen.slice(0, 3).map((id) => relicChip(id, 'dim')).join('')}</div></div>`
      : '';
    const keep = win ? run.relics.filter((id) => !FUSIONS[id]) : [];
    let heir = keep.includes(meta.heirloom) ? meta.heirloom : keep[0] || null;
    if (win && heir) this.hooks.setHeirloom(heir);
    const carry = win && keep.length
      ? `<div class="rs-next carry"><b>${run.unlocked ? `${(run.tier || 0) + 2}단계가 열렸다` : '유물 물려주기'}</b><span>${run.unlocked ? '적이 더 강해집니다. ' : ''}다음 판을 가지고 시작할 유물 하나를 고르세요</span><div>${keep.map((id) => `<button class="heir ${id === heir ? 'sel' : ''}" data-heir="${id}">${relicChip(id)}</button>`).join('')}</div></div>`
      : '';
    const p = this.panel(`
      <h2 class="${win ? 'win' : 'lose'}">${win ? '날이 밝았다' : '등불이 꺼졌다'}</h2>
      <div class="rs-sub">${win ? `${RUN_LENGTH}번의 밤을 모두 넘겼습니다.` : `${run.def.night} · ${run.def.name} (${reached}/${RUN_LENGTH})`}</div>
      ${run.guided ? `<div class="first-hint">${meta.guideDone ? '입문을 마쳤습니다. 다음 판부터 캐릭터와 시작 유물을 고르고, 모든 문양으로 시작합니다.' : '입문 판입니다. 넷째 밤을 넘기면 캐릭터 선택과 모든 문양이 열립니다.'}</div>` : ''}
      <div class="rs-build"><span>유물</span>${run.relics.length ? run.relics.map((id) => relicChip(id)).join('') : '없음'}</div>
      <div class="rs-grid">
        <div><b>${t.kills}</b><span>처치</span></div>
        <div><b>${t.perfect}</b><span>퍼펙트</span></div>
        <div><b>${t.counters}</b><span>되치기</span></div>
        <div><b>${t.jackpots + t.bingos}</b><span>잭팟·빙고</span></div>
        <div><b>${t.shatters}</b><span>파쇄</span></div>
        <div><b>${t.turns}</b><span>턴</span></div>
      </div>
      <div class="rs-score"><b>${t.score.toLocaleString()}</b>점 ${t.score >= (meta.bestScore || 0) ? '<em>최고 기록!</em>' : `<span>최고 ${(meta.bestScore || 0).toLocaleString()}</span>`}</div>
      <div class="rs-dex">유물 ${used.length}/${RELIC_IDS.length} · 플레이 ${meta.runs || 1}회 · 클리어 ${meta.wins || 0}회</div>
      ${carry || hint}
      <div class="title-btns">
        <button class="btn btn-primary" data-a="again">${win && run.unlocked ? '다음 단계 도전' : '다시 하기'}</button>
        <button class="btn" data-a="title">메인으로</button>
      </div>
    `, 'result');
    p.addEventListener('click', (e) => {
      const h = e.target.closest('[data-heir]');
      if (h) {
        heir = h.dataset.heir;
        this.hooks.setHeirloom(heir);
        this.hooks.sound('select');
        p.querySelectorAll('.heir').forEach((x) => x.classList.toggle('sel', x === h));
        return;
      }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      this.hooks.sound('ui');
      this.clear();
      if (a === 'again') this.hooks.start();
      if (a === 'title') this.hooks.title();
    });
  }

  openSettings(back) {
    const s = this.hooks.getSettings();
    const inBattle = !back;
    const p = this.panel(`
      <h2>설정</h2>
      <h3 class="set-sec">소리</h3>
      <label class="row">배경음악 <input type="range" min="0" max="1" step="0.05" data-k="bgm" value="${s.bgm}"></label>
      <label class="row">효과음 <input type="range" min="0" max="1" step="0.05" data-k="sfx" value="${s.sfx}"></label>
      <label class="row chk"><input type="checkbox" data-k="mute" ${s.mute ? 'checked' : ''}> 전체 음소거</label>
      <h3 class="set-sec">화면</h3>
      <label class="row">화면 방향 <select data-k="layout"><option value="auto" ${s.layout !== 'wide' && s.layout !== 'portrait' ? 'selected' : ''}>자동</option><option value="wide" ${s.layout === 'wide' ? 'selected' : ''}>가로</option><option value="portrait" ${s.layout === 'portrait' ? 'selected' : ''}>세로</option></select></label>
      <label class="row chk"><input type="checkbox" data-k="fullscreen" ${s.fullscreen ? 'checked' : ''}> 전체 화면 <small class="keyhint">Alt+Enter</small></label>
      ${window.desktop ? `<label class="row">창 크기 <select data-k="winSize" ${s.fullscreen ? 'disabled' : ''}>${['1280x720', '1600x900', '1920x1080', '2560x1440'].map((v) => `<option value="${v}" ${s.winSize === v ? 'selected' : ''}>${v.replace('x', ' × ')}</option>`).join('')}</select></label>` : ''}
      <label class="row chk"><input type="checkbox" data-k="shake" ${s.shake ? 'checked' : ''}> 화면 흔들림·진동</label>
      <label class="row chk"><input type="checkbox" data-k="flash" ${s.flash ? 'checked' : ''}> 번쩍임 효과</label>
      <label class="row chk"><input type="checkbox" data-k="assist" ${s.assist ? 'checked' : ''}> 쉬운 타이밍 (판정 넓게)</label>
      <h3 class="set-sec">언어</h3>
      <label class="row">언어 <select data-k="lang"><option value="ko" ${s.lang !== 'en' ? 'selected' : ''}>한국어</option><option value="en" ${s.lang === 'en' ? 'selected' : ''}>English</option></select></label>
      <div class="title-btns">
        <button class="btn btn-primary" data-a="close">닫기</button>
        ${inBattle ? '<button class="btn" data-a="howto">게임 방법</button><button class="btn" data-a="leave">저장하고 메인으로</button><button class="btn btn-warn" data-a="quit">이 판 포기</button>' : '<button class="btn" data-a="tutorial">입문 판 다시 하기</button>'}
      </div>
    `, 'settings');
    this.hooks.pause(true);
    p.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.tagName === 'SELECT' ? e.target.value : Number(e.target.value);
      this.hooks.setSetting(k, val);
      if (k === 'lang' || k === 'fullscreen') this.openSettings(back); // 바뀐 상태로 다시 그린다
    });
    p.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      this.hooks.sound('ui');
      if (a === 'close') {
        this.hooks.pause(false);
        if (back) back();
        else this.clear();
      }
      if (a === 'howto') this.showHowTo(() => this.openSettings());
      if (a === 'quit' || a === 'leave') {
        if (a === 'quit') this.hooks.abandon();
        this.hooks.pause(false);
        this.clear();
        this.hooks.title();
      }
      if (a === 'tutorial') {
        this.hooks.replayTutorial();
        e.target.closest('[data-a]').textContent = tr('다음 새 게임에서 다시 나옵니다');
      }
    });
  }
}
