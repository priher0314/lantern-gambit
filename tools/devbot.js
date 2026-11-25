// 개발용 자동 플레이(브라우저 콘솔에서 사용).  await (await import('/tools/devbot.js')).play(400)
// 화면이 숨겨져 있어도 window.__tick 으로 프레임을 직접 넘기며 실제 게임 흐름을 그대로 탄다.
import * as B from '/src/core/battle.js';
import { untranslated } from '/src/i18n.js';

export async function play(iters = 300, opt = {}) {
  const g = window.__game;
  const risky = opt.risky ?? true;
  const log = [];
  for (let n = 0; n < iters; n++) {
    const shopBtn = document.querySelector('.shop [data-a="leave"]');
    if (shopBtn) {
      if (opt.buy) for (const c of document.querySelectorAll('.shop-item:not(.cant):not(.sold)')) c.click();
      (document.querySelector('.shop [data-a="leave"]') || shopBtn).click();
      log.push('shop');
      continue;
    }
    // 갈림길(상점·쉼터·사당): opt.stop 으로 고를 곳을 정한다. opt.until === 'stop' 이면 여기서 멈춘다
    const stops = document.querySelectorAll('.rw-card.stop');
    if (stops.length) {
      if (opt.until === 'stop') break;
      (document.querySelector(`.rw-card.stop[data-k="${opt.stop || ''}"]`) || stops[0]).click();
      document.querySelector('.rw-go').click();
      log.push('stop:' + document.querySelectorAll('.rw-card.stop').length);
      continue;
    }
    const paths = document.querySelectorAll('.rw-card.path');
    if (paths.length) {
      paths[risky && paths.length > 1 ? 1 : 0].click();
      document.querySelector('.rw-go').click();
      log.push('path' + g.run.stage);
      continue;
    }
    const start = document.querySelector('.rw-card:not(.path):not(.shop-item)');
    if (start && g.mode === 'reward') {
      (document.querySelector(`.rw-card[data-id="${opt.pick || ''}"]`) || start).click();
      document.querySelector('.rw-go').click();
      continue;
    }
    if (g.mode === 'result' || g.mode === 'title') break;
    if (g.card) g.closeCard();
    const ui = g.ui;
    const st = g.st;
    if (ui.phase === 'spin' && !g.busy) g.pullLever();
    else if (ui.phase === 'aim' && !g.busy && ui.sel != null && st.shots[ui.sel] && !st.shots[ui.sel].used) {
      let best = -1;
      let lane = 1;
      for (let l = 0; l < 3; l++) {
        const per = Object.values(B.previewShot(st, ui.sel, l).summary.per);
        const s = per.reduce((a, p) => a + p.dmg + (p.killed ? 3 : 0) + (p.frozen ? 2 : 0) + (p.poison || 0) + (p.blocked ? 1 : 0), 0);
        if (s > best) { best = s; lane = l; }
      }
      g.fire(lane);
    } else if (ui.phase === 'react' && ui.react && !ui.react.input) {
      const r = ui.react;
      if (g.now() >= r.impact - 12) g.reactInput(r.attack.style === 'heavy' ? 'dodge' : opt.noGuard ? null : 'guard');
    }
    await window.__tick(ui.phase === 'react' ? 1 : 6);
  }
  return {
    mode: g.mode, stage: g.run && g.run.stage, turn: g.st && g.st.turn, phase: g.ui.phase, hp: g.st && g.st.player.hp,
    coins: g.run && g.run.coins, result: g.st && g.st.result, types: g.st ? [...new Set(g.st.enemies.map((e) => e.type + (e.elite ? '*' : '')))] : [],
    errs: window.__errs || [], log: log.join(','), untr: [...untranslated],
  };
}
