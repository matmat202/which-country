// node site/country-logic.test.mjs — the page's pure logic on a made-up pool, then the
// shipped pool against facts read straight out of data/*.csv by test/facts.py (not by
// build.py). Exit 1 on any failure.
//   test/plant.sh   # mutates a copy of the logic; each mutant must FAIL this suite
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const L = await import(process.env.LOGIC ? pathToFileURL(process.env.LOGIC).href : './country-logic.js');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// --- small pieces ----------------------------------------------------------------------
eq('hash is FNV-1a', [L.hash(''), L.hash('a')], [0x811c9dc5, 0xe40c292c]);
const r1 = L.rng(1), r2 = L.rng(1);
eq('rng repeats for a seed', [r1(), r1(), r1()], [r2(), r2(), r2()]);
ok('rng in [0,1)', Array.from({ length: 1000 }, L.rng(7)).every((x) => x >= 0 && x < 1));
eq('years of life', [L.fmt('life', 84.7123), L.fmt('age', 18.04)], ['84.7 years', '18.0 years']);
eq('co2 at every size', [L.fmt('co2', 41.27118), L.fmt('co2', 7.77), L.fmt('co2', 0.5837), L.fmt('co2', 0.0412)],
  ['41.3 tonnes', '7.8 tonnes', '0.58 tonnes', '0.041 tonnes']);
eq('gdp to three figures', [L.fmt('gdp', 131234.5), L.fmt('gdp', 10039.07), L.fmt('gdp', 912.4)], ['$131,000', '$10,000', '$912']);
eq('population', [L.fmt('pop', 1438069596), L.fmt('pop', 343477335), L.fmt('pop', 46164219), L.fmt('pop', 3185073)],
  ['1.44 billion', '343 million', '46.2 million', '3.2 million']);
eq('shares and children', [L.fmt('net', 84.6), L.fmt('urban', 100), L.fmt('kids', 6.0123)], ['85%', '100%', '6.01']);
eq('higher both ways', [L.higherIndex(3, 2), L.higherIndex(2, 3)], [0, 1]);
eq('right and wrong picks', [L.isRight(3, 2, 0), L.isRight(3, 2, 1), L.isRight(2, 3, 1)], [true, false, true]);
eq('a tie is right either way', [L.isRight(2, 2, 0), L.isRight(2, 2, 1)], [true, true]);
eq('times', [L.times(30, 10), L.times(11, 10), L.times(140, 10), L.times(19.4, 10), L.times(5, 0)],
  ['3.0 times as high', '10% higher', '14 times as high', '94% higher', '']);
eq('verdict names the higher first', L.verdict({ id: 'life' }, 'Nigeria', 54.46, 'Japan', 84.71),
  'Japan: 84.7 years. Nigeria: 54.5 years. 56% higher.');
eq('day key is local', L.dayKey(new Date(2026, 9, 26, 23, 30)), '2026-10-26');
eq('share', L.shareText('2026-10-26', [true, false, true]), 'Which Country? 2026-10-26: 2/3\n🟩🟥🟩');
eq('streak', [L.streak(['2026-10-24', '2026-10-25', '2026-10-26'], '2026-10-26'), L.streak(['2026-10-24', '2026-10-25'], '2026-10-26'),
  L.streak(['2026-10-23', '2026-10-25'], '2026-10-26'), L.streak([], '2026-10-26')], [3, 2, 1, 0]);
const ord = L.metricOrder(['a', 'b', 'c', 'd'], L.rng(3), 10);
eq('metric order: every metric before a repeat', [new Set(ord.slice(0, 4)).size, new Set(ord.slice(4, 8)).size, ord.length], [4, 4, 10]);
ok('metric order: never the same twice running', Array.from({ length: 200 }, (_, s) => L.metricOrder(['a', 'b', 'c'], L.rng(s), 10))
  .every((o) => o.every((x, k) => !k || x !== o[k - 1])));

// --- a made-up pool ---------------------------------------------------------------------
const N = 120;
const fake = {
  countries: Array.from({ length: N }, (_, i) => [`C${i}`, `C${i}`]),
  metrics: [{ id: 'kids', ask: '?' }, { id: 'net', ask: '?' }, { id: 'age', ask: '?' }],
  values: {
    kids: Array.from({ length: N }, (_, i) => 1 + ((i * 37) % N) / 20),
    net: Array.from({ length: N }, (_, i) => (i % 7 === 3 ? null : (i * 53) % 100)),
    age: Array.from({ length: N }, (_, i) => 15 + ((i * 11) % N) / 4),
  },
};
const R = L.ranks(fake);
eq('ranks: lowest is 0, missing is null', [R.kids.r[0], R.net.r[3], R.net.n], [0, null, N - Math.ceil((N - 3) / 7)]);
eq('ranks: ties broken by index', (() => { const t = L.ranks({ metrics: [{ id: 'x' }], values: { x: [5, 1, 5] } }); return t.x.r; })(), [1, 0, 2]);
const day = L.roundsFor(fake, '2026-10-26');
eq('ten rounds', day.length, 10);
eq('the same day gives the same ten', L.roundsFor(fake, '2026-10-26'), day);
ok('another day gives another ten', JSON.stringify(L.roundsFor(fake, '2026-10-27')) !== JSON.stringify(day));
eq('nothing twice in a day', new Set(day.flatMap((x) => [x.a, x.b])).size, 20);
eq('every pair has both values', day.every((x) => fake.values[x.m][x.a] != null && fake.values[x.m][x.b] != null), true);
const gap = (x) => Math.abs(R[x.m].r[x.a] - R[x.m].r[x.b]) / (R[x.m].n - 1);
eq('every pair is in its band', day.map((x, k) => gap(x) >= L.BANDS[k][0] && gap(x) <= L.BANDS[k][1]), Array(10).fill(true));
eq('no pair shows the same number', day.every((x) => L.fmt(x.m, fake.values[x.m][x.a]) !== L.fmt(x.m, fake.values[x.m][x.b])), true);
eq('fits at both edges', [L.fits(fake, R, 'kids', R.kids.r.indexOf(0), R.kids.r.indexOf(N - 1), [1, 1]),
  L.fits(fake, R, 'kids', R.kids.r.indexOf(0), R.kids.r.indexOf(N - 1), [0, 0.99])], [true, false]);
const look = { countries: [['a', 'A'], ['b', 'B'], ['c', 'C']], metrics: [{ id: 'net' }], values: { net: [84.6, 85.2, 10] } };
eq('fits refuses two that show the same number', [L.fits(look, L.ranks(look), 'net', 0, 1, [0, 1]), L.fits(look, L.ranks(look), 'net', 0, 2, [0, 1])], [false, true]);
eq('fits refuses a missing value', L.fits(fake, R, 'net', 3, 4, [0, 1]), false);
const many = Array.from({ length: 30 }, (_, k) => L.roundsFor(fake, `s${k}`)).flat();
const sides = many.map((x) => L.higherIndex(fake.values[x.m][x.a], fake.values[x.m][x.b]));
ok('the higher one is on either side', sides.filter((s) => s === 0).length > 100 && sides.filter((s) => s === 1).length > 100, sides.filter((s) => s === 0).length);
eq('every metric gets asked', new Set(many.map((x) => x.m)).size, 3);
const picks = many.flatMap((x) => [x.a, x.b]);
const median = picks.slice().sort((a, b) => a - b)[picks.length >> 1];
ok('picks lean populous (median in the top 40%)', median < N * 0.4, median);
ok('but reach the tail', Math.max(...picks) > N * 0.8, Math.max(...picks));
const tiny = { countries: [['a', 'A'], ['b', 'B'], ['c', 'C']], metrics: [{ id: 'kids' }], values: { kids: [1, 2, 3] } };
eq('a pool too small for ten gives what it can', L.roundsFor(tiny, 'x').length, 1);

// --- the shipped pool ---------------------------------------------------------------------
// facts.json sits in test/ here and beside this file in the published copy.
const poolFile = here('./data/pool.json'), factFile = existsSync(here('./facts.json')) ? here('./facts.json') : here('../test/facts.json');
if (existsSync(poolFile) && existsSync(factFile)) {
  const P = JSON.parse(readFileSync(poolFile, 'utf8'));
  const F = JSON.parse(readFileSync(factFile, 'utf8'));
  const at = Object.fromEntries(P.countries.map(([, c], i) => [c, i]));
  eq('shipped: every country with a million people', P.countries.length, F.big);
  eq('shipped: each country once', new Set(P.countries.map((c) => c[1])).size, P.countries.length);
  eq('shipped: most populous first', P.values.pop.every((v, i) => !i || P.values.pop[i - 1] >= v), true);
  eq('shipped: eight metrics, each formatted', P.metrics.map((m) => m.id), ['life', 'co2', 'gdp', 'pop', 'net', 'kids', 'urban', 'age']);
  eq('shipped: the years', Object.fromEntries(P.metrics.map((m) => [m.id, m.year])), F.year);
  for (const m of P.metrics) {
    const v = P.values[m.id];
    eq(`shipped ${m.id}: one value per country`, v.length, P.countries.length);
    ok(`shipped ${m.id}: nine in ten countries have it`, v.filter((x) => x != null).length >= 0.9 * P.countries.length);
    for (const [c, want] of Object.entries(F.values[m.id])) {
      ok(`shipped ${m.id}: ${c} is ${want}`, Math.abs(v[at[c]] - want) <= Math.abs(want) * 1e-4, v[at[c]]);
      eq(`shipped ${m.id}: ${c} shows as the source rounds`, L.fmt(m.id, v[at[c]]), L.fmt(m.id, want));
    }
    eq(`shipped ${m.id}: the highest is ${F.top[m.id]}`, Math.max(...v.filter((x) => x != null)), v[at[F.top[m.id]]]);
    ok(`shipped ${m.id}: a question and a source`, /\?$/.test(m.ask) && m.source && /^https:\/\/ourworldindata\.org\/grapher\//.test(m.url), JSON.stringify(m));
  }
  eq('shipped: names from the source', ['JPN', 'NGA', 'USA'].map((c) => P.countries[at[c]][0]), ['JPN', 'NGA', 'USA'].map((c) => F.names[c]));
  // Read off ourworldindata.org by eye, 2026-10-26.
  ok('shipped: Japan outlives Nigeria, India outnumbers the US, Qatar out-emits Niger',
    P.values.life[at.JPN] > P.values.life[at.NGA] && P.values.pop[at.IND] > P.values.pop[at.USA] && P.values.co2[at.QAT] > 100 * P.values.co2[at.NER]);
  const days = Array.from({ length: 120 }, (_, k) => L.roundsFor(P, `2026-11-${k}`));
  eq('shipped: 120 days of full tens', days.every((d) => d.length === 10), true);
  eq('shipped: no pair shows the same number', days.flat().filter((x) => L.fmt(x.m, P.values[x.m][x.a]) === L.fmt(x.m, P.values[x.m][x.b])).length, 0);
  eq('shipped: no day asks one metric three times', days.every((d) => Object.values(d.reduce((a, x) => ({ ...a, [x.m]: (a[x.m] || 0) + 1 }), {})).every((n) => n <= 2)), true);
} else ok('shipped: site/data/pool.json and test/facts.json exist (run build.py, test/facts.py)', false);

console.log(`${fail ? 'FAILED' : 'ok'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
