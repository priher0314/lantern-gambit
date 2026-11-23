// HTML 오버레이 화면: 타이틀, 플레이 방법, 유물·보상 선택, 길잡이, 결과, 설정
import { RUN_LENGTH, SYMBOLS, ENEMIES, RELICS, RELIC_IDS, REACTIONS, GAME_TITLE, GAME_VERSION, FUSIONS, fusionOf, MODS, OBJ_INFO, COIN_LABEL } from '../core/data.js';
import { rewardInfo, cantBuy, buyItem, rerollShop, shopRerollCost } from '../core/run.js';
import { drawSymbol, drawIcon, drawRelicIcon, drawMerchant } from '../render/art.js';

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

  fit(w, h, scale) {
    this.root.style.width = w + 'px';
    this.root.style.height = h + 'px';
    this.root.style.setProperty('--s', scale);
  }

  clear() {
    this.layer.innerHTML = '';
    this.layer.classList.remove('on');
  }

  panel(html, cls = '') {
    this.layer.innerHTML = `<div class="ov-panel ${cls}">${html}</div>`;
    this.layer.classList.add('on');
    paintRelics(this.layer);
    return this.layer.firstElementChild;
  }

  showTitle(meta) {
    const used = (meta.relicsUsed || []).length;
    const p = this.panel(`
      <div class="title-logo">
        <div class="logo-main">${GAME_TITLE}</div>
      </div>
      <div class="title-btns">
        <button class="btn btn-primary" data-a="start">새 게임</button>
        <button class="btn" data-a="howto">게임 방법</button>
        <button class="btn" data-a="settings">설정</button>
      </div>
      <div class="title-meta">${meta.runs ? `플레이 ${meta.runs}회 · 클리어 ${meta.wins || 0}회 · 최고 기록 ${meta.best || 0}/${RUN_LENGTH}` : '첫 플레이'}</div>
      <div class="title-meta">유물 ${used}/${RELIC_IDS.length}</div>
      <div class="title-foot">${GAME_VERSION}</div>
    `, 'title');
    p.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      this.hooks.sound('ui');
      if (a === 'start') {
        this.clear();
        this.hooks.start();
      }
      if (a === 'howto') this.showHowTo(() => this.showTitle(meta));
      if (a === 'settings') this.openSettings(() => this.showTitle(meta));
    });
  }

  howToHtml() {
    return `
      <div class="howto">
        <div class="ht"><b>레버</b><span>당기면 <em>가운데 줄</em> 3칸이 이번 턴의 공격.</span></div>
        <div class="ht"><b>연결·잭팟</b><span>가운데 줄에서 이웃 2칸이 같으면 <em>연결</em>, 3칸이면 <em>잭팟</em>.</span></div>
        <div class="ht"><b>빙고</b><span>위·아래 줄이나 대각선 3칸이 같으면 <em>보너스 기술</em>. 방어막 문양은 <em>조커</em>.</span></div>
        <div class="ht"><b>다시 돌리기</b><span>턴마다 2번. <em class="r">대가</em>는 버튼에 적혀 있고 <em>금빛 릴 +1</em>.</span></div>
        <div class="ht"><b>금빛 릴</b><span>그 칸의 공격이 피해 +1, 효과 +1.</span></div>
        <div class="ht"><b>조준</b><span>릴을 고르고 레인을 누른다(터치는 두 번).</span></div>
        <div class="ht"><b>받아치기</b><span><em class="g">금빛·주황 고리</em> → 막기 (정확하면 되치기)<br><em class="r">붉은 고리</em> → 회피 (적에게 빈틈, 피해 2배)</span></div>
        <div class="ht"><b>코인</b><span><em>연속 처치</em>, <em>퍼펙트</em>, <em>빙고</em>, 다시 돌리기를 안 쓴 턴(<em>절약</em>)에 번다. 그냥 처치하면 0.</span></div>
        <div class="ht"><b>길</b><span>밤마다 <em>순한 길</em>과 <em class="r">험한 길</em>(조건 추가, 코인 2배) 중 고른다.</span></div>
        <div class="ht"><b>유물</b><span>강화하면 <em>II</em>, II가 6번 발동하면 <em>III 진화</em>. 짝이 맞는 두 유물은 <em>융합</em>.</span></div>
        <div class="ht"><b>적 정보</b><span>적을 <em>길게 누르기</em> (마우스는 우클릭).</span></div>
        <div class="ht"><b>조작키</b><span>Space 레버·막기 / R 다시 돌리기 / Q W E 릴 / 1 2 3 레인 / K 회피 / Enter 턴 종료 / H 도움말</span></div>
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
        ${types.map((t) => `<div class="ge"><b>${ENEMIES[t].name}</b><span>${ENEMIES[t].act}</span><span class="how">공략: ${ENEMIES[t].how}</span></div>`).join('')}
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
  showPick(o, onPick) {
    let picked = null;
    const run = o.run;
    // 숫자(+1, 2턴 등)를 굵게 보여 한눈에 읽히게 한다
    const strong = (s) => s.replace(/([+\-]?\d+(?:회|턴|칸|개)?)/g, '<b>$1</b>');
    const cards = o.ids.map((id) => {
      const r = rewardInfo(id);
      const isNew = r.relic && !r.upgrade && !r.fuse && !o.used.includes(id);
      const badge = r.fuse ? '융합' : r.upgrade ? '강화' : r.relic ? r.tag : '소모품';
      let lines = r.desc.split(' · ').map((t) => `<span>${strong(t)}</span>`).join('');
      if (r.fuse) lines += `<span class="rw-hint on">${r.parts[0]} + ${r.parts[1]} · 두 효과는 유지</span>`;
      // 조합 힌트: 이 유물이 무엇과 합쳐지는지 미리 보여준다
      const fz = r.relic && !r.fuse && !r.upgrade ? fusionOf(r.relicId) : null;
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
    const p = this.panel(`
      <div class="rw-head">
        <h2>${o.title}</h2>
        <div class="rw-req">${o.req}</div>
      </div>
      ${run.relics.length ? `<div class="rw-build"><span>보유</span>${run.relics.map((id) => relicChip(id)).join('')}</div>` : ''}
      <div class="rw-cards">${cards}</div>
      <button class="btn btn-primary rw-go" disabled>${o.go}</button>
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
    });
  }

  // 상점: 코인으로 유물·강화·회복 등을 산다. 살 수 없는 물건은 접어서 아래로 내린다.
  // 상점: 보따리 도깨비가 물건 4개를 판다(유물 2 · 소모품 1 · 회복)
  showShop(run, shop, bank, onBought, onDone) {
    const strong = (s) => s.replace(/([+\-]?\d+(?:회|턴|칸|개)?)/g, '<b>$1</b>');
    let mood = 'idle';
    let say = '어서 오게. 좋은 것만 골라 왔지.';
    const render = () => {
      const cards = shop.items.map((it, i) => {
        const r = rewardInfo(it.id);
        const why = cantBuy(run, it);
        const badge = r.fuse ? '융합' : r.upgrade ? '강화' : r.relic ? r.tag : '소모품';
        let lines = r.desc.split(' · ').map((t) => `<span>${strong(t)}</span>`).join('');
        const fz = r.relic && !r.fuse && !r.upgrade ? fusionOf(r.relicId) : null;
        if (fz) {
          const other = FUSIONS[fz].a === r.relicId ? FUSIONS[fz].b : FUSIONS[fz].a;
          const have = run.relics.includes(other);
          if (have) lines += `<span class="rw-hint on">+ ${RELICS[other].name} = ${FUSIONS[fz].name} (보유 중!)</span>`;
        }
        if (r.fuse) lines += `<span class="rw-hint on">${r.parts[0]} + ${r.parts[1]}</span>`;
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
  showPaths(run, defs, onPick) {
    let picked = defs.length === 1 ? 0 : null;
    const card = (d, i) => {
      const enemies = Object.entries(d.counts).map(([t, n]) => `${ENEMIES[t].name} ${n}`).join(' · ');
      const mods = d.mods.map((m) => `<span class="mod"><b>${MODS[m].name}</b> ${MODS[m].desc}</span>`).join('');
      const kind = d.objective.type === 'hunt' ? '보스' : d.risky ? '험한 길' : '순한 길';
      const reward = d.objective.type === 'hunt' ? '' : d.risky ? `<span class="pay hot">코인 ×${d.coinMult}</span>` : '<span class="pay">코인 ×1</span>';
      return `<button class="rw-card path ${d.risky ? 'risky' : ''} ${picked === i ? 'sel' : ''}" data-i="${i}" style="--c:${d.risky ? '#ff6a5a' : '#8fe8ff'}">
        <span class="rw-top"><span class="rw-name">${d.name}</span><span class="rw-tag">${kind}</span></span>
        <span class="rw-desc"><span>목표: ${OBJ_INFO[d.objective.type].desc(d.objective)}</span><span class="foes">${enemies}</span>${mods}${reward}</span>
      </button>`;
    };
    const p = this.panel(`
      <div class="rw-head">
        <h2>${defs.length === 1 ? defs[0].night : `${defs[0].night}의 길을 고르세요`}</h2>
        <div class="rw-req">체력 ${run.hp}/${run.maxHp} · 코인 ${run.coins}</div>
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
    const p = this.panel(`
      <h2 class="${win ? 'win' : 'lose'}">${win ? '날이 밝았다' : '등불이 꺼졌다'}</h2>
      <div class="rs-sub">${win ? `${RUN_LENGTH}번의 밤을 모두 넘겼습니다.` : `${run.def.night} · ${run.def.name} (${reached}/${RUN_LENGTH})`}</div>
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
      ${hint}
      <div class="title-btns">
        <button class="btn btn-primary" data-a="again">다시 하기</button>
        <button class="btn" data-a="title">메인으로</button>
      </div>
    `, 'result');
    p.addEventListener('click', (e) => {
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
      <label class="row">배경음악 <input type="range" min="0" max="1" step="0.05" data-k="bgm" value="${s.bgm}"></label>
      <label class="row">효과음 <input type="range" min="0" max="1" step="0.05" data-k="sfx" value="${s.sfx}"></label>
      <label class="row chk"><input type="checkbox" data-k="mute" ${s.mute ? 'checked' : ''}> 전체 음소거</label>
      <label class="row chk"><input type="checkbox" data-k="shake" ${s.shake ? 'checked' : ''}> 화면 흔들림·진동</label>
      <label class="row chk"><input type="checkbox" data-k="flash" ${s.flash ? 'checked' : ''}> 번쩍임 효과</label>
      <label class="row chk"><input type="checkbox" data-k="assist" ${s.assist ? 'checked' : ''}> 쉬운 타이밍 (판정 넓게)</label>
      <div class="title-btns">
        <button class="btn btn-primary" data-a="close">닫기</button>
        ${inBattle ? '<button class="btn" data-a="howto">게임 방법</button><button class="btn btn-warn" data-a="quit">포기하고 메인으로</button>' : ''}
      </div>
    `, 'settings');
    this.hooks.pause(true);
    p.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      const val = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
      this.hooks.setSetting(k, val);
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
      if (a === 'quit') {
        this.hooks.pause(false);
        this.clear();
        this.hooks.title();
      }
    });
  }
}
