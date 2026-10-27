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

// --- exact edges -------------------------------------------------------------------------
eq('rng(1), pinned', (() => { const r = L.rng(1); return [r(), r(), r()]; })(), [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
eq('metric order, pinned (the shuffle and the no-repeat rotation)', [L.metricOrder(['a', 'b', 'c', 'd', 'e'], L.rng(3), 12), L.metricOrder(['a', 'b'], L.rng(9), 5)],
  [['c', 'e', 'b', 'a', 'd', 'c', 'a', 'e', 'b', 'd', 'e', 'd'], ['b', 'a', 'b', 'a', 'b']]);
eq('the bands, as designed', L.BANDS, [[0.5, 1], [0.4, 0.8], [0.3, 0.6], [0.24, 0.48], [0.18, 0.38], [0.12, 0.3], [0.08, 0.22], [0.05, 0.16], [0.03, 0.11], [0.012, 0.07]]);
eq('pop: a billion is the first "billion"', [L.fmt('pop', 1e9), L.fmt('pop', 999.4e6), L.fmt('pop', 1e8), L.fmt('pop', 99.94e6)], ['1.00 billion', '999 million', '100 million', '99.9 million']);
eq('a tie: the first named is "higher"', [L.higherIndex(5, 5), L.verdict({ id: 'net' }, 'A', 5, 'B', 5)], [0, 'A: 5%. B: 5%. 0% higher.']);
eq('times: 1.95 is the first "times as high", and lo = 1 is not zero', [L.times(19.5, 10), L.times(19.49, 10), L.times(5, 1)], ['2.0 times as high', '95% higher', '5.0 times as high']);
eq('missedDay reaches FIRST_DAY itself, and no further', [L.missedDay('2026-10-27', () => false), L.missedDay('2026-10-27', (d) => d !== '2026-10-26'), L.missedDay('2026-10-26', () => false)],
  ['2026-10-26', '2026-10-26', null]);

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
eq('more rounds than bands: the rest use the last band', L.roundsFor(fake, 'n', 12).length, 12);
// A sparse pool, where few countries have each number and the draws lean away from them, so
// bands exhaust and widen. An exhausted loop draws the same stream whatever the band, so a
// try more or less, or a different widening, only shows when the fitting draw sits on the
// boundary. Each seed was searched for: it tells one widening or try-count change apart.
const sparse = { countries: Array.from({ length: N }, (_, i) => [`C${i}`, `C${i}`]), metrics: [{ id: 'kids' }, { id: 'net' }],
  values: { kids: Array.from({ length: N }, (_, i) => (i > 70 ? 1 + i / 50 : null)), net: Array.from({ length: N }, (_, i) => (i % 9 ? null : i)) } };
eq('widening and try counts, pinned on searched seeds', Object.fromEntries(['w0', 'w1', 'w8', 'w15', 'w92', 'w127', 'w242'].map((s) => [s, L.roundsFor(sparse, s).map((x) => [x.m[0], x.a, x.b])])),
  {'w0': [['n', 72, 0], ['k', 89, 109], ['n', 81, 45], ['k', 93, 77], ['n', 63, 27], ['k', 92, 86], ['n', 36, 18], ['k', 90, 85], ['n', 54, 9], ['k', 73, 74]], 'w1': [['k', 110, 82], ['n', 72, 0], ['k', 93, 75], ['n', 9, 45], ['k', 88, 79], ['n', 27, 36], ['k', 80, 84], ['n', 54, 18], ['k', 92, 90], ['n', 81, 63]], 'w8': [['n', 0, 72], ['k', 110, 80], ['n', 54, 9], ['k', 75, 87], ['n', 63, 36], ['k', 77, 83], ['n', 18, 45], ['k', 85, 90], ['n', 108, 99], ['k', 73, 71]], 'w15': [['n', 0, 63], ['k', 73, 100], ['n', 54, 9], ['k', 102, 82], ['n', 45, 18], ['k', 106, 93], ['n', 36, 27], ['k', 90, 86], ['k', 76, 78]], 'w92': [['n', 0, 108], ['k', 74, 97], ['n', 9, 45], ['k', 88, 107], ['n', 36, 81], ['k', 92, 82], ['n', 99, 72], ['k', 85, 79], ['n', 18, 27], ['k', 73, 75]], 'w127': [['n', 81, 18], ['k', 87, 111], ['n', 36, 0], ['k', 92, 72], ['n', 27, 54], ['k', 94, 82], ['n', 9, 45], ['k', 75, 71], ['k', 88, 90]], 'w242': [['n', 72, 0], ['k', 73, 104], ['n', 63, 18], ['k', 96, 81], ['n', 45, 9], ['k', 79, 71], ['n', 54, 36], ['k', 78, 74], ['k', 75, 76]]});

// --- earlier days (?day=) ----------------------------------------------------------------
eq('prevDay crosses a month', [L.prevDay('2026-11-01'), L.prevDay('2027-01-01')], ['2026-10-31', '2026-12-31']);
eq('pastDay takes an earlier real day', L.pastDay('2026-10-27', '2026-10-30'), '2026-10-27');
eq('pastDay takes the first day', L.pastDay(L.FIRST_DAY, '2026-10-30'), L.FIRST_DAY);
eq('pastDay refuses before the first day', L.pastDay('2026-10-25', '2026-10-30'), null);
eq('pastDay refuses today and later', [L.pastDay('2026-10-30', '2026-10-30'), L.pastDay('2026-10-31', '2026-10-30')], [null, null]);
eq('pastDay refuses non-dates', ['2026-11-31', '2027-02-29', '2026-13-01', '26-10-27', '', null, '2026-10-27x'].map((p) => L.pastDay(p, '2027-06-01')), [null, null, null, null, null, null, null]);
const played = new Set(['2026-10-29', '2026-10-28']);
eq('missedDay skips played days', L.missedDay('2026-10-30', (d) => played.has(d)), '2026-10-27');
eq('missedDay is yesterday when unplayed', L.missedDay('2026-10-30', () => false), '2026-10-29');
eq('missedDay stops at the first day', [L.missedDay('2026-10-30', () => true), L.missedDay(L.FIRST_DAY, () => false)], [null, null]);

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
  // The two days actually served (pool.json and the dealing code unchanged since launch), pinned
  // by metric, country and side. "The same day gives the same ten" compares a day with itself,
  // which every rng, hash, shuffle and band constant satisfies; a stored pick is a side.
  const served = (d) => L.roundsFor(P, d).map((x) => [x.m, P.countries[x.a][1], P.countries[x.b][1]]);
  eq('shipped: 2026-10-26 as served', served('2026-10-26'), [['pop', 'BIH', 'DZA'], ['gdp', 'SWE', 'LKA'], ['urban', 'MOZ', 'AGO'], ['life', 'FIN', 'IND'],
    ['net', 'PHL', 'IRN'], ['age', 'UKR', 'BRA'], ['co2', 'SLV', 'DOM'], ['kids', 'UGA', 'CAF'], ['co2', 'COL', 'BOL'], ['urban', 'USA', 'DEU']]);
  eq('shipped: 2026-10-27 as served', served('2026-10-27'), [['gdp', 'IRL', 'SLV'], ['kids', 'COD', 'IND'], ['urban', 'ARM', 'PAK'], ['net', 'TGO', 'IRN'],
    ['pop', 'TZA', 'CHL'], ['co2', 'CMR', 'ETH'], ['life', 'KEN', 'ZMB'], ['age', 'FRA', 'GBR'], ['urban', 'CHN', 'ITA'], ['life', 'BLR', 'ROU']]);
} else ok('shipped: site/data/pool.json and test/facts.json exist (run build.py, test/facts.py)', false);

console.log(`${fail ? 'FAILED' : 'ok'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
