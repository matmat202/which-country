// Which Country? — the page. Pure logic lives in country-logic.js.
import * as L from './country-logic.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: play on, unsaved */ } },
};

let POOL = null, M = {};
let game = null; // { key, day, practice, rounds, picks, showing }

// `past` is an earlier day's ten (from ?day=): saved, shareable, outside the streak.
function start(practice, past = null) {
  const day = past || L.dayKey();
  const key = practice ? `practice-${Date.now().toString(36)}` : day;
  game = { key, day, practice, past: !!past && !practice, rounds: L.roundsFor(POOL, key), picks: practice ? [] : store.get('wc:' + day, []) };
  $('daily').hidden = !practice && !game.past;
  render();
}

function save() {
  if (game.practice) return;
  store.set('wc:' + game.day, game.picks);
  if (game.picks.length === game.rounds.length && !game.past) {
    const days = store.get('wc:days', []);
    if (!days.includes(game.day)) { days.push(game.day); store.set('wc:days', days.slice(-400)); }
  }
}

// One round as the page needs it: the metric, and both sides' names and values.
const at = (k) => {
  const x = game.rounds[k], m = M[x.m], v = POOL.values[x.m];
  return { m, a: { name: POOL.countries[x.a][0], v: v[x.a] }, b: { name: POOL.countries[x.b][0], v: v[x.b] } };
};
const marks = () => game.picks.map((p, k) => { const { a, b } = at(k); return L.isRight(a.v, b.v, p); });

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

function drawRound(k, answered) {
  const { m, a, b } = at(k);
  $('round').textContent = `${game.practice ? 'Practice · ' : game.past ? `${game.day} · ` : ''}Round ${k + 1} of ${game.rounds.length}`;
  $('ask').textContent = m.ask;
  $('what').textContent = `${m.what}, ${m.year}`;
  const hi = L.higherIndex(a.v, b.v);
  const btns = [...$('pick').querySelectorAll('button')];
  [a, b].forEach((c, i) => {
    const el = btns[i];
    el.querySelector('b').textContent = c.name;
    el.querySelector('.lat').textContent = answered ? L.fmt(m.id, c.v) : '';
    el.disabled = answered;
    el.classList.toggle('right', answered && hi === i);
    el.classList.toggle('wrong', answered && game.picks[k] === i && !L.isRight(a.v, b.v, i));
    el.setAttribute('aria-label', answered ? `${c.name}: ${L.fmt(m.id, c.v)}` : c.name);
  });
  if (answered) {
    const right = L.isRight(a.v, b.v, game.picks[k]);
    $('out').replaceChildren();
    const tag = document.createElement('b');
    tag.className = right ? 'y' : 'n';
    tag.textContent = right ? 'Right. ' : 'Not quite. ';
    $('out').append(tag, L.verdict(m, a.name, a.v, b.name, b.v));
    drawBars(m, a, b);
    $('bars').hidden = false;
    $('next').hidden = false;
    $('next').textContent = k + 1 >= game.rounds.length ? 'See your score' : 'Next';
  } else {
    $('out').textContent = '';
    $('bars').hidden = true;
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

// The answer as two bars from zero, so "twice as high" is something seen.
function drawBars(m, a, b) {
  const top = Math.max(a.v, b.v) || 1;
  const rows = [a, b].map((c, i) => {
    const row = document.createElement('div'); row.className = `row ${i ? 'b' : 'a'}`;
    const n = document.createElement('span'); n.textContent = c.name;
    const t = document.createElement('div'); t.className = 'track';
    const f = document.createElement('div'); f.className = 'fill'; f.style.width = `${Math.max(1, (100 * c.v) / top)}%`;
    t.append(f); row.append(n, t);
    return row;
  });
  const note = document.createElement('p'); note.className = 'note';
  note.append(`${m.what}, ${m.year}. Source: ${m.source}, via `);
  const link = document.createElement('a'); link.href = m.url; link.textContent = 'Our World in Data';
  note.append(link, '.');
  $('bars').replaceChildren(...rows, note);
}

function drawEnd() {
  const m = marks(), score = m.filter(Boolean).length;
  $('endday').textContent = game.practice ? 'Practice ten' : `${game.past ? 'Earlier' : 'Today\'s'} ten · ${game.day}`;
  $('score').textContent = `${score} / ${m.length}`;
  const s = L.streak(store.get('wc:days', []), game.day);
  $('streak').textContent = game.practice ? 'Practice rounds do not count toward your streak.'
    : game.past ? 'Earlier days do not count toward your streak.'
    : `${s === 1 ? 'First day of a streak' : `${s}-day streak`}. A new ten tomorrow.`;
  $('share').hidden = game.practice;
  const miss = game.practice ? null : L.missedDay(game.day, (k) => store.get('wc:' + k, []).length >= game.rounds.length);
  $('earlier').hidden = !miss;
  if (miss) { $('earlier').href = `?day=${miss}`; $('earlier').textContent = miss === L.prevDay(L.dayKey()) ? "Missed yesterday? Play yesterday's ten" : `Play the ten from ${miss}`; }
  $('copied').textContent = '';
  $('recap').replaceChildren(...game.rounds.map((_, k) => {
    const { m: met, a, b } = at(k);
    const li = document.createElement('li');
    const mk = document.createElement('span'); mk.className = 'm ' + (m[k] ? 'y' : 'n'); mk.textContent = m[k] ? '✓' : '✗';
    mk.setAttribute('aria-label', m[k] ? 'right' : 'wrong');
    const [h, l] = L.higherIndex(a.v, b.v) === 0 ? [a, b] : [b, a];
    const t = document.createElement('span'); t.className = 't'; t.textContent = `${met.what}: ${h.name} over ${l.name}`;
    const d = document.createElement('span'); d.className = 'd'; d.textContent = `${L.fmt(met.id, h.v)} vs ${L.fmt(met.id, l.v)}`;
    li.append(mk, t, d);
    return li;
  }));
}

async function share() {
  const text = L.shareText(game.day, marks()) + '\nhttps://matmat202.github.io/which-country/';
  try { await navigator.clipboard.writeText(text); $('copied').textContent = 'Copied.'; }
  catch { $('copied').textContent = text; }
}

$('pick').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pick(Number(b.dataset.i)); });
$('next').addEventListener('click', next);
$('share').addEventListener('click', share);
$('practice').addEventListener('click', () => start(true));
$('daily').addEventListener('click', () => { if (location.search) history.replaceState(null, '', location.pathname); start(false); });
document.addEventListener('keydown', (e) => {
  if (!game || e.metaKey || e.ctrlKey || e.altKey) return;
  if (game.showing == null && !$('play').hidden) {
    if (e.key === 'ArrowLeft' || e.key === '1') { e.preventDefault(); pick(0); }
    else if (e.key === 'ArrowRight' || e.key === '2') { e.preventDefault(); pick(1); }
  } else if (game.showing != null && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault(); next();
  }
});

fetch('data/pool.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((p) => {
  POOL = p; M = Object.fromEntries(p.metrics.map((m) => [m.id, m]));
  $('count').textContent = p.countries.length.toLocaleString('en-US');
  start(false, L.pastDay(new URLSearchParams(location.search).get('day'), L.dayKey()));
}).catch((e) => {
  $('round').textContent = '';
  $('out').textContent = `Could not load the numbers (${e.message}). Reload to try again.`;
});
