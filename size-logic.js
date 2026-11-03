// Mercator Trap — the page's pure logic. No DOM; imported by size-app.js and the test.
//
// shapes.json: countries [{name, code, pop, lat, t, m, w, h, d}], most populous first.
// t is the true area in km², m the area Mercator draws the same outline at (km² at the
// equator's scale), w/h the drawn size and d the SVG path, both in Mercator km, centred.
import { hash, rng } from './country-logic.js';

export const ROUNDS = 10;
export const HONEST = 3;          // rounds a day where the one drawn bigger really is bigger
export const TRUE_GAP = 1.15;     // the truly bigger is at least this much bigger: 1:110m can't flip it
export const TRAP_GAP = 1.3;      // a trap's truly smaller one is drawn at least this much bigger
export const HONEST_MAX = 2.5;    // an honest pair is no walkover
export const HONEST_LAT = 15;     // and its bigger one sits nearer a pole, so "pick the tropical one" loses

// Every pair worth dealing, each as [bigger, smaller] by true area, split into
// traps (the smaller is drawn bigger) and honest pairs (the bigger is drawn bigger too).
export function pairs(cs) {
  const traps = [], honest = [];
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const [a, b] = cs[i].t >= cs[j].t ? [i, j] : [j, i];
    const tr = cs[a].t / cs[b].t, mr = cs[b].m / cs[a].m;
    if (tr < TRUE_GAP) continue;
    if (mr >= TRAP_GAP) traps.push([a, b]);
    else if (mr < 1 && tr <= HONEST_MAX && Math.abs(cs[a].lat) - Math.abs(cs[b].lat) >= HONEST_LAT) honest.push([a, b]);
  }
  return { traps, honest };
}

// Lean toward the well-known: a pair's fame is its less famous country's place in the
// population order, and squaring a uniform draw puts the median pick a quarter of the way down.
const byFame = (list) => list.slice().sort((p, q) => Math.max(...p) - Math.max(...q) || p[0] - q[0] || p[1] - q[1]);
const draw = (r, n) => Math.floor(r() * r() * n);

// The day's rounds: {a, b} indexes into countries, in the order shown (either side may be
// the bigger). HONEST of them are honest pairs at seeded places; no country twice in a day.
export function roundsFor(cs, seedStr, n = ROUNDS, P = pairs(cs)) {
  const r = rng(hash('size:' + seedStr));
  const lists = { trap: byFame(P.traps), honest: byFame(P.honest) };
  const slots = Array.from({ length: n }, (_, k) => k);
  for (let k = n - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [slots[k], slots[j]] = [slots[j], slots[k]]; }
  const honestAt = new Set(slots.slice(0, Math.min(HONEST, n)));
  const used = new Set(), out = [];
  for (let k = 0; k < n; k++) {
    const list = lists[honestAt.has(k) ? 'honest' : 'trap'];
    let pair = null;
    for (let t = 0; t < 4000 && !pair; t++) {
      const p = list[draw(r, list.length)];
      if (p && !used.has(p[0]) && !used.has(p[1])) pair = p;
    }
    if (!pair) continue;
    used.add(pair[0]); used.add(pair[1]);
    out.push(r() < 0.5 ? { a: pair[0], b: pair[1] } : { a: pair[1], b: pair[0] });
  }
  return out;
}

// Which side is truly bigger: 0 (left) or 1 (right).
export function biggerIndex(ta, tb) { return ta >= tb ? 0 : 1; }
export function isRight(ta, tb, pick) { return ta === tb || biggerIndex(ta, tb) === pick; }
export const isTrap = (A, B) => (A.t - B.t) * (A.m - B.m) < 0;

const num = (v, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// Areas to two significant figures: the outline is 1:110m, so a third figure would be noise.
export function fmtArea(km2) {
  const s = Number(km2.toPrecision(2));
  return s >= 1e6 ? `${num(s / 1e6, s >= 1e7 ? 0 : 1)} million km²` : `${num(s)} km²`;
}

export function times(x) {
  return x >= 1.95 ? `${num(x, x >= 10 ? 0 : 1)} times` : `${num(Math.round((x - 1) * 100))}%`;
}

export const latText = (lat) => `${num(Math.abs(Math.round(lat)))}°${lat >= 0 ? 'N' : 'S'}`;

// The answer, and why the map says otherwise when it does.
export function verdict(A, B) {
  const [big, small] = A.t >= B.t ? [A, B] : [B, A];
  const head = `${big.name} is ${times(big.t / small.t)} bigger: ${fmtArea(big.t)} to ${fmtArea(small.t)}.`;
  if (!isTrap(A, B)) return `${head} The map tells the truth this time.`;
  return `${head} Mercator draws ${small.name} ${times(small.m / big.m)} bigger: at ${latText(small.lat)} it inflates area`
    + ` ${num(small.m / small.t, 1)}×, and at ${latText(big.lat)} only ${num(big.m / big.t, 1)}×.`;
}

// Both outlines at one scale, so that their drawn areas compare. `honest` redraws each at its
// true area (its Mercator shape, scaled by the square root of how much Mercator inflated it).
// Returns the per-country scale, in pixels per Mercator km, that fits both into a box w x h.
export function scales(A, B, w, h, honest) {
  const f = (c) => (honest ? Math.sqrt(c.t / c.m) : 1);
  const fit = Math.min(...[A, B].map((c) => Math.min(w / (c.w * f(c)), h / (c.h * f(c)))));
  return [A, B].map((c) => fit * f(c));
}

export function shareText(day, marks) {
  const score = marks.filter(Boolean).length;
  return `Mercator Trap ${day}: ${score}/${marks.length}\n${marks.map((m) => (m ? '🟩' : '🟥')).join('')}`;
}
