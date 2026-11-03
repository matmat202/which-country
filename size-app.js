// Mercator Trap — the page. Pure logic lives in size-logic.js (and the day machinery in country-logic.js).
import * as S from './size-logic.js';
import { dayKey, streak } from './country-logic.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: play on, unsaved */ } },
};
const BOX = 184; // px of the 200-px viewBox a country may fill

let CS = null, P = null;
let game = null; // { key, day, practice, rounds, picks, showing }

function start(practice) {
  const day = dayKey();
  const key = practice ? `practice-${Date.now().toString(36)}` : day;
  game = { key, day, practice, rounds: S.roundsFor(CS, key, S.ROUNDS, P), picks: practice ? [] : store.get('wcm:' + day, []) };
  $('daily').hidden = !practice;
  render();
}

function save() {
  if (game.practice) return;
  store.set('wcm:' + game.day, game.picks);
  if (game.picks.length === game.rounds.length) {
    const days = store.get('wcm:days', []);
    if (!days.includes(game.day)) { days.push(game.day); store.set('wcm:days', days.slice(-400)); }
  }
}

const at = (k) => ({ A: CS[game.rounds[k].a], B: CS[game.rounds[k].b] });
const marks = () => game.picks.map((p, k) => { const { A, B } = at(k); return S.isRight(A.t, B.t, p); });

function render() {
  const k = game.picks.length, done = k >= game.rounds.length;
  const showing = game.showing ?? null;
  $('play').hidden = done && showing == null;
  $('end').hidden = !($('play').hidden);
  drawMarks(showing ?? k);
  if (!$('play').hidden) drawRound(showing ?? k, showing != null);
  if (!$('end').hidden) drawEnd();
}

function drawMarks(now) {
  const m = marks();
  $('marks').replaceChildren(...game.rounds.map((_, k) => {
    const li = document.createElement('li');
    if (k < m.length) { li.className = m[k] ? 'y' : 'n'; li.title = m[k] ? 'right' : 'wrong'; }
    if (k === now) li.classList.add('now');
    return li;
  }));
  $('marks').setAttribute('aria-label', `${m.filter(Boolean).length} right of ${m.length} so far`);
}

// Both outlines at one scale. The inner group carries the scale, so the reveal is a transition.
function drawShapes(A, B, honest, animate) {
  const sc = S.scales(A, B, BOX, BOX, honest);
  [...$('pick').querySelectorAll('button')].forEach((el, i) => {
    const c = [A, B][i], g = el.querySelector('g.s');
    const path = el.querySelector('path');
    if (path.dataset.code !== c.code) { path.setAttribute('d', c.d); path.dataset.code = c.code; }
    el.querySelector('g.t').setAttribute('transform', 'translate(100 100)');
    g.style.transition = animate ? '' : 'none';
    g.style.transform = `scale(${sc[i]})`;
    el.querySelector('svg').setAttribute('aria-label', `${c.name}, as ${honest ? 'it really is' : 'Mercator draws it'}`);
  });
}

function drawRound(k, answered) {
  const { A, B } = at(k);
  $('round').textContent = `${game.practice ? 'Practice · ' : ''}Round ${k + 1} of ${game.rounds.length}`;
  const big = S.biggerIndex(A.t, B.t);
  const btns = [...$('pick').querySelectorAll('button')];
  [A, B].forEach((c, i) => {
    const el = btns[i];
    el.querySelector('b').textContent = c.name;
    el.querySelector('.lat').textContent = answered ? S.fmtArea(c.t) : '';
    el.disabled = answered;
    el.classList.toggle('right', answered && big === i);
    el.classList.toggle('wrong', answered && game.picks[k] === i && !S.isRight(A.t, B.t, i));
    el.setAttribute('aria-label', answered ? `${c.name}: ${S.fmtArea(c.t)}` : c.name);
  });
  // Drawn as Mercator first; on answer, redrawn at true area (animated only when just answered).
  drawShapes(A, B, false, false);
  if (answered) {
    void $('pick').offsetWidth;
    drawShapes(A, B, true, true);
    const right = S.isRight(A.t, B.t, game.picks[k]);
    const tag = document.createElement('b');
    tag.className = right ? 'y' : 'n';
    tag.textContent = right ? 'Right. ' : 'Not quite. ';
    $('out').replaceChildren(tag, S.verdict(A, B));
    $('mode').textContent = 'Redrawn at their true size';
    $('next').hidden = false;
    $('next').textContent = k + 1 >= game.rounds.length ? 'See your score' : 'Next';
  } else {
    $('out').textContent = '';
    $('mode').textContent = 'As Mercator draws them';
    $('next').hidden = true;
  }
}

function pick(i) {
  if (!game || game.showing != null || game.picks.length >= game.rounds.length) return;
  game.showing = game.picks.length;
  game.picks.push(i);
  save();
  render();
  $('next').focus({ preventScroll: true });
}

function next() {
  if (game.showing == null) return;
  game.showing = null;
  render();
  if (!$('play').hidden) $('pick').querySelector('button').focus({ preventScroll: true }); else $('share').focus({ preventScroll: true });
}

function drawEnd() {
  const m = marks(), score = m.filter(Boolean).length;
  $('endday').textContent = game.practice ? 'Practice ten' : `Today's ten · ${game.day}`;
  $('score').textContent = `${score} / ${m.length}`;
  const s = streak(store.get('wcm:days', []), game.day);
  $('streak').textContent = game.practice ? 'Practice rounds do not count toward your streak.'
    : `${s === 1 ? 'First day of a streak' : `${s}-day streak`}. A new ten tomorrow.`;
  const traps = game.rounds.map((_, k) => at(k)).filter(({ A, B }) => S.isTrap(A, B)).length;
  const fell = game.rounds.filter((_, k) => { const { A, B } = at(k); return S.isTrap(A, B) && !m[k]; }).length;
  $('traps').textContent = `${traps} of the ${m.length} were traps; you fell into ${fell}.`;
  $('share').hidden = game.practice;
  $('copied').textContent = '';
  $('recap').replaceChildren(...game.rounds.map((_, k) => {
    const { A, B } = at(k);
    const li = document.createElement('li');
    const mk = document.createElement('span'); mk.className = 'm ' + (m[k] ? 'y' : 'n'); mk.textContent = m[k] ? '✓' : '✗';
    mk.setAttribute('aria-label', m[k] ? 'right' : 'wrong');
    const [h, l] = S.biggerIndex(A.t, B.t) === 0 ? [A, B] : [B, A];
    const t = document.createElement('span'); t.className = 't'; t.textContent = `${h.name} over ${l.name}${S.isTrap(A, B) ? ' (trap)' : ''}`;
    const d = document.createElement('span'); d.className = 'd'; d.textContent = `${S.fmtArea(h.t)} vs ${S.fmtArea(l.t)}`;
    li.append(mk, t, d);
    return li;
  }));
}

async function share() {
  const text = S.shareText(game.day, marks()) + '\nhttps://matmat202.github.io/which-country/size.html';
  try { await navigator.clipboard.writeText(text); $('copied').textContent = 'Copied.'; }
  catch { $('copied').textContent = text; }
}

$('pick').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pick(Number(b.dataset.i)); });
$('next').addEventListener('click', next);
$('share').addEventListener('click', share);
$('practice').addEventListener('click', () => start(true));
$('daily').addEventListener('click', () => start(false));
document.addEventListener('keydown', (e) => {
  if (!game || e.metaKey || e.ctrlKey || e.altKey) return;
  if (game.showing == null && !$('play').hidden) {
    if (e.key === 'ArrowLeft' || e.key === '1') { e.preventDefault(); pick(0); }
    else if (e.key === 'ArrowRight' || e.key === '2') { e.preventDefault(); pick(1); }
  } else if (game.showing != null && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault(); next();
  }
});

fetch('data/shapes.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => {
  CS = d.countries; P = S.pairs(CS);
  $('count').textContent = CS.length.toLocaleString('en-US');
  start(false);
}).catch((e) => {
  $('round').textContent = '';
  $('out').textContent = `Could not load the outlines (${e.message}). Reload to try again.`;
});
