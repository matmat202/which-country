/* Pure logic for "One number": story.json -> per-chapter particle slots. No DOM, no GL,
 * so node can test it (test/story.test.mjs). Modelled on which-first/site/story/layout.js.
 *
 * One dot is one country in the Which Country? pool, the same dot in every chapter. A
 * scatter chapter puts every country at its percentile: x by children per woman (fewest 0,
 * most 1), y by the lit metric (lowest 0, highest 1). A columns chapter is a waffle: each
 * column holds the same number of dots, and the purple share of it is the share of rounds
 * the shortcut gets right. A layout is N slots of [x, y, colour, alpha] in plot space: x, y
 * in 0..1, y up. Every number the prose prints is computed by build_story.py. */

export function dots(D) {
  if (D.x.length !== D.n) throw new Error(`${D.x.length} x positions for ${D.n} countries`);
  return D.x.map((x, i) => {
    if (!(x >= 0 && x <= 1)) throw new Error(`dot ${i}: percentile ${x} outside 0..1`);
    return { i, x, name: D.names[i] };
  });
}

/* Colours are palette indices (story.js): 0 ink, 1 purple, 2 orange, 3 green, 4 blue, 5 grey. */
export const C = { ink: 0, purple: 1, orange: 2, green: 3, blue: 4, grey: 5 };

export const TOP = 0.9; // the plot's top tenth is left for the value labels

export const jit = (i, k) => (((i * 2654435761 + k * 40503) >>> 0) % 1000) / 1000 - 0.5;

export const PAD = { l: 0.08, r: 0.03, b: 0.04, t: 0.03 };
export const sx = (x) => PAD.l + x * (1 - PAD.l - PAD.r);
export const sy = (y) => PAD.b + y * (TOP - PAD.b - PAD.t);

export const metricOf = (D, id) => {
  const m = D.metrics.find((r) => r.id === id);
  if (!m) throw new Error(`no metric ${id}`);
  return m;
};

/* A scatter chapter (data-kind="scatter:life"). A country the metric lacks is hidden. */
export function scatter(ds, D, id) {
  const m = metricOf(D, id);
  if (!m.bands) throw new Error(`no scatter for ${id}`);
  const slots = new Float32Array(ds.length * 4);
  for (const d of ds) {
    const y = m.y[d.i];
    if (y !== null && !(y >= 0 && y <= 1)) throw new Error(`dot ${d.i}: ${id} percentile ${y} outside 0..1`);
    slots.set(y === null ? [sx(d.x), sy(0), C.grey, 0]
      : [sx(d.x + jit(d.i, 1) * 0.004), sy(y + jit(d.i, 2) * 0.004), C.purple, 0.9], d.i * 4);
  }
  return { kind: 'scatter', lit: id, slots, hidden: m.y.filter((y) => y === null).length };
}

/* The columns charts. Each is a list of {label, share, colour}: share 0..1 of the column's
 * dots go purple (or the column's own colour), the rest grey. */
export const pct = (v) => `${Math.round(v * 100)}%`;
export const COLS = {
  rounds: (D) => D.byround.map((r, k) => ({ label: `${k + 1}`, share: r.real, value: pct(r.real) })),
  shuffled: (D) => D.byround.map((r, k) => ({ label: `${k + 1}`, share: r.shuf, value: pct(r.shuf), colour: C.blue })),
  metrics: (D) => D.metrics.map((m) => (m.id === 'kids' ? { label: m.id, share: 1, value: 'knows', colour: C.green }
    : m.id === 'pop' ? { label: m.id, share: 0.5, value: 'coin', colour: C.blue }
      : { label: m.id, share: m.acc, value: pct(m.acc) })),
};

/* The fewest dots a row (so the biggest dots) that still fit a column of maxN under TOP,
 * with square cells in a plot of aspect a. */
export function perRow(maxN, K, a, top = TOP) {
  const barW = (1 / K) * 0.8;
  for (let k = 1; k <= 200; k++) if (Math.ceil(maxN / k) * (barW / k) * a <= top) return k;
  throw new Error(`no row width fits ${maxN} dots`);
}

export function columns(ds, D, a, name) {
  const spec = COLS[name];
  if (!spec) throw new Error(`unknown columns ${name}`);
  const cols = spec(D), K = cols.length;
  if (ds.length % K) throw new Error(`${ds.length} dots do not split into ${K} equal columns`);
  const each = ds.length / K;
  const on = cols.map((c) => {
    if (!(c.share >= 0 && c.share <= 1)) throw new Error(`${name} ${c.label}: share ${c.share}`);
    return Math.round(c.share * each);
  });
  const per = perRow(each, K, a), colW = 1 / K, barW = colW * 0.8, cw = barW / per, chh = cw * a;
  const slots = new Float32Array(ds.length * 4);
  for (const d of ds) {
    const k = d.i % K, j = Math.floor(d.i / K), r = Math.floor(j / per), c = j % per;
    const colour = j < on[k] ? (cols[k].colour ?? C.purple) : C.grey;
    slots.set([k * colW + (colW - barW) / 2 + (c + 0.5) * cw, (r + 0.5) * chh, colour, 1], d.i * 4);
  }
  return { kind: 'columns', chart: name, slots, per, cell: cw, K, each, on, cols,
    half: ((Math.ceil(each / per) * chh) / 2) };
}
