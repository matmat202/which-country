// Which Country? — the page's pure logic. No DOM; imported by app.js and the test.
//
// pool.json: countries [[name, code]] most populous first; metrics [{id, ask, what, year}];
// values {metricId: [number | null, one per country]}.

export const ROUNDS = 10;
// How far apart the two countries sit in that metric's ranking, as a share of the
// countries that have it: half the world apart first, a few places apart last.
export const BANDS = [
  [0.5, 1], [0.4, 0.8], [0.3, 0.6], [0.24, 0.48], [0.18, 0.38], [0.12, 0.3], [0.08, 0.22], [0.05, 0.16], [0.03, 0.11], [0.012, 0.07],
];

// FNV-1a: a date string to a 32-bit seed.
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// mulberry32: small, fast, and the same sequence in every browser.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sig = (v, n) => Number(v.toPrecision(n));
const num = (v, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// The number as the page shows it. Two countries that show the same number are never paired.
export function fmt(id, v) {
  switch (id) {
    case 'life': case 'age': return `${num(v, 1)} years`;
    case 'co2': return `${v >= 10 ? num(v, 1) : v >= 0.1 ? num(sig(v, 2), v >= 1 ? 1 : 2) : num(v, 3)} tonnes`;
    case 'gdp': return `$${num(sig(v, 3))}`;
    case 'pop': return v >= 1e9 ? `${num(v / 1e9, 2)} billion` : `${num(sig(v / 1e6, 3), v >= 1e8 ? 0 : 1)} million`;
    case 'net': case 'urban': return `${num(v)}%`;
    case 'kids': return num(v, 2);
    default: return String(v);
  }
}

// Each metric's values ranked: rank[id][country] is 0 for the lowest, null if missing.
export function ranks(pool) {
  const out = {};
  for (const m of pool.metrics) {
    const v = pool.values[m.id];
    const have = v.map((x, i) => i).filter((i) => v[i] != null).sort((a, b) => v[a] - v[b] || a - b);
    const r = v.map(() => null);
    have.forEach((i, k) => { r[i] = k; });
    out[m.id] = { r, n: have.length };
  }
  return out;
}

export function fits(pool, R, id, i, j, [lo, hi]) {
  const v = pool.values[id], { r, n } = R[id];
  if (v[i] == null || v[j] == null) return false;
  const d = Math.abs(r[i] - r[j]) / (n - 1);
  return d >= lo && d <= hi && fmt(id, v[i]) !== fmt(id, v[j]);
}

// The pool is most populous first. Squaring a uniform draw leans every pick toward the
// well-known without ruling out the rest: the median pick sits a quarter of the way down.
const draw = (r, n) => Math.floor(r() * r() * n);

// Ten metrics for a day: every metric before any repeats, in a seeded order.
export function metricOrder(ids, r, n = ROUNDS) {
  const out = [];
  while (out.length < n) {
    const deck = ids.slice();
    for (let k = deck.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [deck[k], deck[j]] = [deck[j], deck[k]]; }
    if (out.length && deck[0] === out[out.length - 1]) deck.push(deck.shift());
    out.push(...deck);
  }
  return out.slice(0, n);
}

// The day's rounds: {m, a, b} with a and b indexes into pool.countries, in the order shown.
// No country appears twice in a day. A band nothing fits widens until something does.
export function roundsFor(pool, seedStr, n = ROUNDS) {
  const r = rng(hash(seedStr));
  const R = ranks(pool);
  const N = pool.countries.length;
  const order = metricOrder(pool.metrics.map((m) => m.id), r, n);
  const used = new Set();
  const out = [];
  for (let k = 0; k < n; k++) {
    const id = order[k];
    let [lo, hi] = BANDS[Math.min(k, BANDS.length - 1)];
    let pair = null;
    for (let widen = 0; !pair && widen < 6; widen++) {
      for (let t = 0; t < 4000 && !pair; t++) {
        const i = draw(r, N), j = draw(r, N);
        if (i === j || used.has(i) || used.has(j)) continue;
        if (fits(pool, R, id, i, j, [lo, hi])) pair = r() < 0.5 ? [i, j] : [j, i];
      }
      lo /= 2; hi = Math.min(1, hi * 2);
    }
    if (!pair) continue;
    used.add(pair[0]); used.add(pair[1]);
    out.push({ m: id, a: pair[0], b: pair[1] });
  }
  return out;
}

// Which side is higher: 0 (left) or 1 (right). A tie never gets picked, but counts as right.
export function higherIndex(va, vb) { return va >= vb ? 0 : 1; }
export function isRight(va, vb, pick) { return va === vb || higherIndex(va, vb) === pick; }

export function times(hi, lo) {
  if (lo <= 0) return '';
  const x = hi / lo;
  if (x >= 1.95) return `${num(x, x >= 10 ? 0 : 1)} times as high`;
  return `${num(Math.round((x - 1) * 100))}% higher`;
}

export function verdict(metric, an, av, bn, bv) {
  const [hn, hv, ln, lv] = higherIndex(av, bv) === 0 ? [an, av, bn, bv] : [bn, bv, an, av];
  const t = times(hv, lv);
  return `${hn}: ${fmt(metric.id, hv)}. ${ln}: ${fmt(metric.id, lv)}.${t ? ` ${t[0].toUpperCase()}${t.slice(1)}.` : ''}`;
}

// Local calendar date, so "today's ten" turns over at the player's midnight.
export function dayKey(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The first day a daily ten was served. ?day= plays any day from here up to yesterday.
export const FIRST_DAY = '2026-10-26';

export function prevDay(key) {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

// A ?day= worth honouring: a real calendar date, FIRST_DAY or later and before `today`.
// Anything else is null, and the page plays today's ten.
export function pastDay(param, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param || '')) return null;
  const d = new Date(param + 'T12:00:00');
  if (Number.isNaN(d.getTime()) || dayKey(d) !== param) return null;
  return param >= FIRST_DAY && param < today ? param : null;
}

// The latest day before `from` whose ten is unfinished, back to FIRST_DAY; null if none.
// `done(day)` says whether that day's ten was played to the end.
export function missedDay(from, done) {
  for (let d = prevDay(from); d >= FIRST_DAY; d = prevDay(d)) if (!done(d)) return d;
  return null;
}

export function shareText(day, marks) {
  const score = marks.filter(Boolean).length;
  return `Which Country? ${day}: ${score}/${marks.length}\n${marks.map((m) => (m ? '🟩' : '🟥')).join('')}`;
}

// Consecutive days played, ending today or yesterday. `days` is a list of dayKeys.
export function streak(days, today) {
  const have = new Set(days);
  const d = new Date(today + 'T12:00:00');
  if (!have.has(today)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (have.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
