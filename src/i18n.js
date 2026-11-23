// 언어 전환. 게임 코드는 한국어 문장을 그대로 쓰고, 화면에 그리기 직전에 여기서 영어로 바꾼다.
//  - 캔버스: Renderer가 fillText/measureText를 tr()로 감싼다.
//  - HTML 화면: Overlay.panel()이 localize()로 글자 노드를 바꾼다.
// 사전은 i18n/en.js 한 파일에 모여 있다(숫자 자리는 #, 순서를 바꿀 땐 {0} {1}).
import { EN, EN_SUFFIX } from './i18n/en.js';
import {
  RELICS, FUSIONS, REWARDS, SHOT_NAMES, SHOT_NAMES_EN, SYMBOLS, SYMBOL_EN, ENEMIES, ENEMY_EN, OBJ_INFO, MODS, NIGHT_NAMES,
} from './core/data.js';

const HANGUL = /[가-힣]/;
let lang = 'ko';
const exact = new Map();
const norm = new Map();
let greedy = null;
const cache = new Map();
export const untranslated = new Set(); // 개발용: 영어로 못 바꾼 문장

const NIGHT_EN = ['Night 1', 'Night 2', 'Night 3', 'Night 4', 'Night 5', 'Final Night'];

function add(ko, en) {
  if (!ko || en == null) return;
  exact.set(ko, en);
  if (/#|\{\d\}/.test(en)) norm.set(ko.replace(/\d+/g, '#'), en);
}

function build() {
  for (const [k, v] of Object.entries(EN)) add(k, v);
  for (const r of Object.values(RELICS)) {
    add(r.name, r.en);
    add(r.desc, r.enDesc);
  }
  for (const f of Object.values(FUSIONS)) {
    add(f.name, f.en);
    add(f.desc, f.enDesc);
  }
  for (const r of Object.values(REWARDS)) add(r.name, r.en);
  for (const s of Object.keys(SHOT_NAMES)) SHOT_NAMES[s].forEach((n, i) => add(n, SHOT_NAMES_EN[s][i]));
  for (const s of Object.keys(SYMBOL_EN)) {
    const ko = SYMBOLS[s].name;
    add(ko, SYMBOL_EN[s]);
    add(`${ko} 문양이 더 자주 나옴`, `${SYMBOL_EN[s]} symbols appear more often`);
    add(`${ko} 문양이 덜 나옴`, `${SYMBOL_EN[s]} symbols appear less often`);
    add(`${ko} 덜기`, `Fewer ${SYMBOL_EN[s]}`);
  }
  add('방어막', 'Guard'); // 등불 문양의 기술 이름이 우선
  for (const k of Object.keys(ENEMY_EN)) add(ENEMIES[k].name, ENEMY_EN[k]);
  for (const o of Object.values(OBJ_INFO)) add(o.name, o.en);
  for (const m of Object.values(MODS)) add(m.name, m.en);
  NIGHT_NAMES.forEach((n, i) => add(n, NIGHT_EN[i]));
  // 문장 속에 섞인 낱말을 찾기 위한 목록(긴 것부터)
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  greedy = [...exact.entries()]
    .filter(([k]) => HANGUL.test(k) && k.length >= 2)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([k, v]) => ({ re: new RegExp(esc(k).replace(/\d+|#/g, '(\\d+)'), 'g'), v, vars: /#|\{\d\}/.test(v) }));
}

function fill(en, nums) {
  if (/\{\d\}/.test(en)) return en.replace(/\{(\d)\}/g, (_, i) => nums[Number(i)] ?? '');
  let i = 0;
  return en.replace(/#/g, () => nums[i++] ?? '');
}

function lookup(s) {
  if (exact.has(s)) return exact.get(s);
  const n = s.replace(/\d+/g, '#');
  if (norm.has(n)) return fill(norm.get(n), s.match(/\d+/g) || []);
  return null;
}

// 구분 기호로 나눠 조각마다 옮긴다(공백은 그대로 둔다)
function bySplit(s, re, next) {
  const parts = s.split(re);
  if (parts.length === 1) return next(s);
  return parts.map((p, i) => (i % 2 ? p : piece(p, next))).join('');
}

function piece(p, next) {
  if (!HANGUL.test(p)) return p;
  const m = p.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const hit = lookup(m[2]);
  return m[1] + (hit != null ? hit : next(m[2])) + m[3];
}

function words(s) {
  let out = s;
  for (const g of greedy) {
    if (!HANGUL.test(out)) break;
    out = out.replace(g.re, (...a) => (g.vars ? fill(g.v, a.slice(1, -2)) : g.v));
  }
  if (HANGUL.test(out)) {
    for (const [k, v] of Object.entries(EN_SUFFIX)) out = out.split(k).join(v);
  }
  if (HANGUL.test(out)) untranslated.add(s);
  return out;
}

export function tr(s) {
  if (lang === 'ko' || typeof s !== 'string' || !HANGUL.test(s)) return s;
  let v = cache.get(s);
  if (v !== undefined) return v;
  v = piece(s, (a0) => bySplit(a0, /(\s+▶\s+)/, (a) => bySplit(a, /(\s+·\s+|\n)/, (b) => bySplit(b, /(\s*(?:: |—|→|=|\+|,|\(|\)|\/|▶|·|!|\[|\])\s*)/, words))));
  if (cache.size > 4000) cache.clear();
  cache.set(s, v);
  return v;
}

export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'en' ? 'en' : 'ko';
  if (!greedy) build();
  cache.clear();
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
export const defaultLang = () => (typeof navigator !== 'undefined' && !/^ko/i.test(navigator.language || 'ko') ? 'en' : 'ko');

// HTML 조각 안의 글자를 옮긴다
export function localize(root) {
  if (lang === 'ko') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) if (HANGUL.test(n.nodeValue)) n.nodeValue = tr(n.nodeValue);
}

// 캔버스에 그리는 글자를 옮긴다
export function localizeCanvas(ctx) {
  const ft = ctx.fillText.bind(ctx);
  const st = ctx.strokeText.bind(ctx);
  const mt = ctx.measureText.bind(ctx);
  ctx.fillText = (s, ...a) => ft(tr(s), ...a);
  ctx.strokeText = (s, ...a) => st(tr(s), ...a);
  ctx.measureText = (s) => mt(tr(s));
}
