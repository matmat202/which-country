// node site/size-logic.test.mjs — the Mercator Trap's pure logic on made-up countries, then the
// shipped shapes.json against areas published elsewhere (CIA World Factbook totals) and against
// Mercator's own formula. Exit 1 on any failure.
//   test/plant.sh   # mutates a copy of the logic; each mutant must FAIL this suite
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const S = await import(process.env.SIZE_LOGIC ? pathToFileURL(process.env.SIZE_LOGIC).href : './size-logic.js');
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// --- small pieces ----------------------------------------------------------------------
eq('areas to two figures', [S.fmtArea(16635777), S.fmtArea(2190190), S.fmtArea(593399), S.fmtArea(64123), S.fmtArea(20480)],
  ['17 million km²', '2.2 million km²', '590,000 km²', '64,000 km²', '20,000 km²']);
eq('times', [S.times(1.19), S.times(2.5), S.times(16.53), S.times(1.951)], ['19%', '2.5 times', '17 times', '2.0 times']);
eq('latitude', [S.latText(55.4), S.latText(-7.2), S.latText(0.2)], ['55°N', '7°S', '0°N']);
eq('bigger both ways', [S.biggerIndex(3, 2), S.biggerIndex(2, 3)], [0, 1]);
eq('right and wrong picks', [S.isRight(3, 2, 0), S.isRight(3, 2, 1), S.isRight(2, 3, 1)], [true, false, true]);

// Made-up countries: t is true area, m Mercator area. K and N are the trap (N drawn bigger, K bigger).
const C = (name, t, m, lat, w = 10, h = 10) => ({ name, code: name, pop: 0, t, m, lat, w, h, d: '' });
const K = C('Kenya', 590000, 594000, 1), N = C('Norway', 390000, 3700000, 68, 30, 80);
ok('a trap is a trap', S.isTrap(K, N) && S.isTrap(N, K));
ok('an honest pair is not', !S.isTrap(C('a', 2, 2, 0), C('b', 1, 1, 0)));
eq('trap verdict, either order', [S.verdict(K, N), S.verdict(N, K)].map((v) => v.slice(0, 60)),
  Array(2).fill('Kenya is 51% bigger: 590,000 km² to 390,000 km². Mercator dr'));
eq('trap verdict explains', S.verdict(N, K), 'Kenya is 51% bigger: 590,000 km² to 390,000 km². Mercator draws Norway 6.2 times bigger: at 68°N it inflates area 9.5×, and at 1°N only 1.0×.');
eq('honest verdict', S.verdict(C('Canada', 9.9e6, 4e7, 60), C('Brazil', 8.5e6, 9e6, -10)),
  'Canada is 16% bigger: 9.9 million km² to 8.5 million km². The map tells the truth this time.');
// Scales: one px/km for both, the larger box fills; honest rescales by sqrt(t/m).
const [sk, sn] = S.scales(K, N, 100, 100, false);
eq('one scale for both, fitted to the taller', [sk, sn], [100 / 80, 100 / 80]);
const [hk, hn] = S.scales(K, N, 100, 100, true);
ok('honest: drawn areas in the ratio of true areas', Math.abs((hk * hk * K.m) / (hn * hn * N.m) - K.t / N.t) < 1e-9, `${hk} ${hn}`);
ok('honest: the biggest drawn still fits', Math.max(hk * K.w, hk * K.h, hn * N.w * 1, hn * N.h) <= 100 + 1e-9 && Math.max(hk * K.h, hn * N.h, hk * K.w, hn * N.w) > 99.9);
eq('share', S.shareText('2026-11-03', [true, false, true]), 'Mercator Trap 2026-11-03: 2/3\n🟩🟥🟩');

// pairs(): the gates on gaps and latitude, on a hand-built world.
const W = [
  C('Equa', 100000, 100000, 0),     // 0
  C('Nord', 80000, 300000, 60),     // 1: trap with Equa (Equa 1.25x bigger, Nord drawn 3x bigger)
  C('Twin', 90000, 95000, 2),       // 2: Equa only 1.11x bigger, and Twin only 1.13x Nord: below TRUE_GAP
  C('Big', 200000, 600000, 55),     // 3: honest over Equa (2x, drawn bigger, 55° nearer a pole)
  C('Huge', 600000, 610000, 5),     // 4: 6x Equa, too easy to be honest; Nord is drawn smaller, so no trap
  C('Mid', 150000, 160000, 10),     // 5: Big over Mid is 1.33x, but only 45° apart and drawn 3.75x: honest
  C('Lean', 120000, 170000, 30),    // 6: honest under Big; honest over Equa and Twin (30° and 28° nearer a pole); trap under Nord
  C('Vast', 400000, 1600000, 60),   // 7: 2.7-4.4x Equa, Twin, Mid and Lean from nearer a pole: walkovers, never honest; trap under Huge
];
const P = S.pairs(W);
const key = (l) => l.map(([a, b]) => `${W[a].name}>${W[b].name}`).sort();
eq('traps', key(P.traps), ['Equa>Nord', 'Huge>Vast', 'Lean>Nord', 'Mid>Nord']);
ok('a gap under TRUE_GAP is never dealt', ![...P.traps, ...P.honest].some(([a, b]) => W[a].t / W[b].t < S.TRUE_GAP));
ok('an honest pair needs its bigger nearer a pole', P.honest.every(([a, b]) => Math.abs(W[a].lat) - Math.abs(W[b].lat) >= S.HONEST_LAT));
eq('honest', key(P.honest), ['Big>Equa', 'Big>Lean', 'Big>Mid', 'Big>Twin', 'Lean>Equa', 'Lean>Twin']);
ok('an honest pair is never a walkover', P.honest.every(([a, b]) => W[a].t / W[b].t <= S.HONEST_MAX));

// --- the shipped outlines ---------------------------------------------------------------
const shapes = JSON.parse(readFileSync(here('./data/shapes.json'), 'utf8'));
const CS = shapes.countries, by = Object.fromEntries(CS.map((c) => [c.name, c]));
ok('about 150 countries', CS.length >= 140 && CS.length <= 170, CS.length);
ok('none under 20,000 km²', CS.every((c) => c.t >= 20000));
ok('most populous first', CS.every((c, k) => !k || CS[k - 1].pop >= c.pop));
// Published total areas (CIA World Factbook, km²). 1:110m outlines are coarse, so within 7%.
const PUBLISHED = { Russia: 17098242, Canada: 9984670, 'United States': 9833517, China: 9596960, Brazil: 8515770, Australia: 7741220,
  India: 3287263, Greenland: 2166086, 'DR Congo': 2344858, Kenya: 580367, France: 551500, Lithuania: 65300, Panama: 75420, Iceland: 103000 };
for (const [n, a] of Object.entries(PUBLISHED)) ok(`${n} area is about right`, by[n] && Math.abs(by[n].t / a - 1) < 0.07, by[n] && `${by[n].t} vs ${a}`);
// Mercator's own formula: a small country's area grows by sec²(latitude).
for (const n of ['Lithuania', 'Panama', 'Iceland', 'Kenya', 'Uruguay']) {
  const c = by[n], sec2 = 1 / Math.cos((c.lat * Math.PI) / 180) ** 2;
  ok(`${n} inflated by sec² of its latitude`, Math.abs(c.m / c.t / sec2 - 1) < 0.06, `${(c.m / c.t).toFixed(2)} vs ${sec2.toFixed(2)}`);
}
ok('Greenland inflated more than ten times', by.Greenland.m / by.Greenland.t > 10);
ok('every outline has a path', CS.every((c) => /^M-?\d+,-?\d+(L-?\d+,-?\d+)+Z/.test(c.d) && c.w > 0 && c.h > 0));
ok('no contested territory', !CS.some((c) => /Sahara|Falkland|Cyprus|Somaliland|Antarctic/.test(c.name)));
const SP = S.pairs(CS);
ok('a month of traps at least', SP.traps.length >= 300, SP.traps.length);
// A year of days: always seven traps and three honest pairs, nobody twice, and both sides used.
let left = 0, bad = [];
const t0 = new Date('2026-11-03T12:00:00');
for (let k = 0; k < 365; k++) {
  const day = new Date(t0.getTime() + k * 864e5).toISOString().slice(0, 10);
  const R = S.roundsFor(CS, day, S.ROUNDS, SP);
  const traps = R.filter(({ a, b }) => S.isTrap(CS[a], CS[b])).length;
  const ids = R.flatMap(({ a, b }) => [a, b]);
  if (R.length !== 10 || traps !== 7 || new Set(ids).size !== 20) bad.push([day, R.length, traps, new Set(ids).size]);
  left += R.filter(({ a, b }) => CS[a].t > CS[b].t).length;
}
eq('every day of a year: ten rounds, seven traps, twenty countries', bad.slice(0, 3), []);
ok('the bigger is on the left about half the time', left > 3650 * 0.45 && left < 3650 * 0.55, left);
eq('a day is the same ten every time', S.roundsFor(CS, '2026-11-03'), S.roundsFor(CS, '2026-11-03'));
ok('two days differ', JSON.stringify(S.roundsFor(CS, '2026-11-03')) !== JSON.stringify(S.roundsFor(CS, '2026-11-04')));
const days = Array.from({ length: 30 }, (_, k) => new Date(t0.getTime() + k * 864e5).toISOString().slice(0, 10));
const firsts = new Set(days.map((d) => { const [x] = S.roundsFor(CS, d); return [x.a, x.b].sort().join(); }));
ok('a month opens on many different pairs', firsts.size >= 20, firsts.size);
// The trap does not reduce to "pick the one nearer the equator": that rule loses every honest round.
const naive = days.flatMap((d) => S.roundsFor(CS, d)).map(({ a, b }) => {
  const pick = Math.abs(CS[a].lat) <= Math.abs(CS[b].lat) ? 0 : 1;
  return S.isRight(CS[a].t, CS[b].t, pick);
});
ok('"nearer the equator" scores at most 8 of 10', naive.filter(Boolean).length / days.length <= 8, naive.filter(Boolean).length / days.length);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
