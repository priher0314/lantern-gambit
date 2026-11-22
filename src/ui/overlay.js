// HTML 오버레이 화면: 타이틀, 플레이 방법, 보상 선택, 결과, 설정
import { REWARDS, BATTLES, SYMBOLS } from '../core/data.js';
import { drawSymbol, drawIcon } from '../render/art.js';

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
    const map = { heal: ['heart', '#ff6a7a'], maxhp: ['plus', '#ff6a7a'], ember: ['ember', '#ffb347'], guard: ['shield', '#ffd27a'] };
    const [ic, col] = map[kind] || ['dots', '#fff'];
    drawIcon(g, ic, size / 2, size / 2, size * 0.55, col);
  }
  return c;
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
    return this.layer.firstElementChild;
  }

  showTitle(meta) {
    const p = this.panel(`
      <div class="title-logo">
        <div class="logo-en">LANTERN GAMBIT</div>
        <div class="logo-ko">등불 갬빗</div>
        <div class="logo-sub">달밤 다리의 등지기</div>
      </div>
      <div class="title-btns">
        <button class="btn btn-primary" data-a="start">행렬 막으러 가기</button>
        <button class="btn" data-a="howto">플레이 방법</button>
        <button class="btn" data-a="settings">설정</button>
      </div>
      <div class="title-meta">${meta.runs ? `도전 ${meta.runs}회 · 완주 ${meta.wins || 0}회` : '첫 번째 밤'}</div>
      <div class="title-foot">Phase 1 프로토타입 · 소리를 켜고 플레이하세요</div>
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

  showHowTo(back) {
    const p = this.panel(`
      <h2>플레이 방법</h2>
      <div class="howto">
        <div class="ht"><b>1. 돌리기</b><span>점괘 북 3개가 이번 턴의 공격이 된다. 이웃한 두 칸이 같으면 <em>연결 강화</em>, 셋이 같으면 <em>잭팟</em>.</span></div>
        <div class="ht"><b>2. 도박</b><span>마음에 안 들면 다시 굴린다. 대가(흉조)는 버튼에 미리 보인다. 대신 <em>금빛 릴</em>이 늘어 공격이 강해진다.</span></div>
        <div class="ht"><b>3. 조준</b><span>릴을 고르고 레인을 누른다(터치는 두 번). 미리보기 피해 = 실제 피해. <em>동결 후 절단 = 파쇄</em>처럼 순서가 중요!</span></div>
        <div class="ht"><b>4. 받아치기</b><span>적 공격의 고리가 원에 닿는 순간:<br><em class="g">금빛</em> → 막기 (퍼펙트면 원하는 레인으로 되치기)<br><em class="r">붉은빛</em> → 회피 (적이 노출되어 다음 피해 ×2)</span></div>
        <div class="ht"><b>적</b><span><em>우산 도깨비</em>: 체력이 가득하면 두 칸씩 뛴다 · <em>탈 방패병</em>: 정면 공격 무효, 측면/연쇄로 · <em>불씨 초롱</em>: 조준 후 발사, 동결로 끊기</span></div>
        <div class="ht"><b>조작키</b><span>Space 돌리기·막기 / R 도박 / Q W E 릴 / 1 2 3 레인 / K 회피 / Enter 턴 종료</span></div>
      </div>
      <button class="btn btn-primary" data-a="back">확인</button>
    `, 'howto-panel');
    p.addEventListener('click', (e) => {
      if (e.target.closest('[data-a="back"]')) {
        this.hooks.sound('ui');
        back();
      }
    });
  }

  showReward(ids, run, onPick) {
    let picked = null;
    const p = this.panel(`
      <div class="rw-head">
        <div class="rw-night">${BATTLES[run.stage].name} 돌파</div>
        <h2>보상을 하나 고르세요</h2>
        <div class="rw-req">필수 선택 · 체력 ${run.hp}/${run.maxHp}</div>
      </div>
      <div class="rw-cards">
        ${ids.map((id) => `<button class="rw-card" data-id="${id}"><span class="rw-ic"></span><span class="rw-name">${REWARDS[id].name}</span><span class="rw-desc">${REWARDS[id].desc}</span></button>`).join('')}
      </div>
      <button class="btn btn-primary rw-go" disabled>다음 밤으로 — ${BATTLES[run.stage + 1].name}</button>
    `, 'reward');
    p.querySelectorAll('.rw-card').forEach((el) => {
      $('.rw-ic', el).appendChild(iconCanvas(REWARDS[el.dataset.id].icon));
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

  showResult(win, run) {
    const t = run.totals;
    const p = this.panel(`
      <h2 class="${win ? 'win' : 'lose'}">${win ? '행렬을 막아냈다!' : '등불이 꺼졌다'}</h2>
      <div class="rs-sub">${win ? '세 번의 밤을 모두 지켜냈습니다.' : `${BATTLES[run.stage].name}에서 쓰러졌습니다.`}</div>
      <div class="rs-grid">
        <div><b>${t.kills}</b><span>처치</span></div>
        <div><b>${t.perfect}</b><span>퍼펙트</span></div>
        <div><b>${t.counters}</b><span>되치기</span></div>
        <div><b>${t.jackpots}</b><span>잭팟</span></div>
        <div><b>${t.shatters}</b><span>파쇄</span></div>
        <div><b>${t.turns}</b><span>턴</span></div>
      </div>
      <div class="rs-picks">${run.picks.length ? '고른 보상: ' + run.picks.map((id) => REWARDS[id].name).join(' · ') : ''}</div>
      <div class="title-btns">
        <button class="btn btn-primary" data-a="again">다시 도전</button>
        <button class="btn" data-a="title">타이틀로</button>
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
    const wasOpen = this.layer.innerHTML;
    const p = this.panel(`
      <h2>설정</h2>
      <label class="row">배경음악 <input type="range" min="0" max="1" step="0.05" data-k="bgm" value="${s.bgm}"></label>
      <label class="row">효과음 <input type="range" min="0" max="1" step="0.05" data-k="sfx" value="${s.sfx}"></label>
      <label class="row chk"><input type="checkbox" data-k="mute" ${s.mute ? 'checked' : ''}> 전체 음소거</label>
      <label class="row chk"><input type="checkbox" data-k="shake" ${s.shake ? 'checked' : ''}> 화면 흔들림</label>
      <label class="row chk"><input type="checkbox" data-k="flash" ${s.flash ? 'checked' : ''}> 강한 번쩍임</label>
      <label class="row chk"><input type="checkbox" data-k="assist" ${s.assist ? 'checked' : ''}> 타이밍 보조 (판정 넓게·예고 길게)</label>
      <div class="title-btns">
        <button class="btn btn-primary" data-a="close">닫기</button>
        ${inBattle ? '<button class="btn" data-a="howto">플레이 방법</button><button class="btn btn-warn" data-a="quit">이번 도전 포기</button>' : ''}
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
    void wasOpen;
  }
}
