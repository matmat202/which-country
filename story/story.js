/* The scrolling story: each <section class="step"> names a layout in data-kind; as the
 * reader scrolls from one step to the next, every country's dot flies from the old layout
 * to the new one. Numbers in the prose are not typed in: a <b data-fact="..."> is filled
 * from story.json, so the text cannot drift from the chart. Modelled on which-first/story. */
import { dots, scatter, columns, metricOf, sx, sy, pct, TOP } from './layout.js';
import { createPoints } from './gl.js';

// 0 ink, 1 purple, 2 orange, 3 green, 4 blue, 5 grey
const PAL = [[0.09, 0.13, 0.16], [0.36, 0.23, 0.56], [0.76, 0.32, 0.12], [0.07, 0.48, 0.31], [0.16, 0.47, 0.84], [0.72, 0.71, 0.75]];

const fmt = (n) => n.toLocaleString('en-US');
/* rho with a real minus sign, two places. */
export const rho = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}`;
export const SHORT = { life: 'lifespan', co2: 'CO₂', gdp: 'income', pop: 'people', net: 'online', kids: 'children', urban: 'urban', age: 'age' };
export const PHRASE = { life: 'lives longer', co2: 'emits more CO₂ per person', gdp: 'is richer per person',
  net: 'has more people online', urban: 'is more urban', age: 'has the older population' };

/* "acc:life" -> "81%". Unknown names throw: a typo must not render as blank. */
export function fact(D, spec) {
  const [f, a] = spec.split(':');
  const need = (v) => { if (v === undefined || v === null) throw new Error(`fact ${spec}: no value`); return v; };
  const M = () => metricOf(D, a);
  const R = () => need(D.byround[Number(a) - 1]);
  switch (f) {
    case 'n': return fmt(D.n);
    case 'days': return fmt(D.days);
    case 'years': return fmt(Math.round(D.days / 365));
    case 'perm': return fmt(D.perm);
    case 'kidsyear': return String(D.kidsyear);
    case 'kidsmin': return D.ticks[0].toFixed(1);
    case 'kidsmax': return D.ticks[4].toFixed(1);
    case 'kidslow': return D.names[D.kids.indexOf(Math.min(...D.kids))];
    case 'kidshigh': return D.names[D.kids.indexOf(Math.max(...D.kids))];
    case 'score': return D.score.toFixed(1);
    case 'shufscore': return D.shufscore.toFixed(1);
    case 'shufscoremax': return D.shufscoremax.toFixed(1);
    case 'acc': return a ? pct(need(M().acc)) : pct(D.acc);
    case 'asked': return a ? fmt(need(M().asked)) : fmt(D.asked);
    case 'rho': return rho(need(M().rho));
    case 'have': return fmt(M().n);
    case 'missing': return fmt(D.n - M().n);
    case 'real': return pct(R().real);
    case 'shuf': return pct(R().shuf);
    case 'shufmax': return pct(R().shufmax);
    case 'roundasked': return fmt(R().asked);
    default: throw new Error(`unknown fact ${spec}`);
  }
}

/* data-kind -> layout: "scatter:<metric>" or "columns:<chart>" */
export function layoutFor(step, ds, D, aspect) {
  const [k, arg] = step.dataset.kind.split(':');
  if (k === 'scatter') return scatter(ds, D, arg);
  if (k === 'columns') return columns(ds, D, aspect, arg);
  throw new Error(`unknown step ${step.dataset.kind}`);
}

async function main() {
  const D = await (await fetch('story.json')).json();
  for (const el of document.querySelectorAll('[data-fact]')) el.textContent = fact(D, el.dataset.fact);
  const ds = dots(D);

  const steps = [...document.querySelectorAll('.step')];
  const canvas = document.getElementById('gl');
  const plot = document.getElementById('plot');
  const axes = document.getElementById('axes');

  let layouts = [];
  const relayout = () => {
    const a = plot.clientWidth / Math.max(1, plot.clientHeight);
    layouts = steps.map((s) => layoutFor(s, ds, D, a));
    window.__story = { dots: ds.length, layouts: layouts.map((l) => ({ kind: l.kind, per: l.per })) };
  };
  relayout();

  const pts = createPoints(canvas, ds.length, PAL);
  if (!pts) { document.body.classList.add('nogl'); return; }
  const dpr = Math.min(2, devicePixelRatio || 1);
  let shown = -1;
  const resize = () => {
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    relayout();
    shown = -1;
  };
  resize();
  addEventListener('resize', resize);

  const progress = () => {
    const line = innerHeight * 0.5;
    let i = 0;
    for (let k = 0; k < steps.length; k++) if (steps[k].getBoundingClientRect().top < line) i = k;
    const next = steps[i + 1];
    if (!next) return { i, t: 0 };
    const top = next.getBoundingClientRect().top;
    return { i, t: Math.min(1, Math.max(0, 1 - (top - line) / (innerHeight - line))) };
  };

  const units = {
    rounds: 'round of the day · purple: the shortcut was right',
    shuffled: 'round of the day · blue: right with the number shuffled',
    metrics: 'question · purple: the shortcut was right',
  };
  const drawAxes = (lay, kind) => {
    const html = [];
    if (lay.kind === 'columns') {
      lay.cols.forEach((c, i) => {
        const x = ((i + 0.5) / lay.K) * 100;
        const lab = lay.chart === 'metrics' ? SHORT[c.label] : c.label;
        html.push(`<span class="tick" style="left:${x}%">${lab}</span>`);
        // the value sits on its column, not at the top of an empty plot
        html.push(`<span class="val${c.colour === undefined ? '' : ' ink'}" style="left:${x}%;top:calc(${(1 - 2 * lay.half) * 100}% - 1.6em)">${c.value}</span>`);
      });
      const Y = (1 - lay.half) * 100;
      html.push(`<svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline class="pace" points="0,${Y} 100,${Y}"/></svg>`);
      html.push(`<span class="ytick half" style="top:${Y}%">½</span>`);
      html.push(`<span class="unit">${units[lay.chart]}</span>`);
    } else {
      // the scatter: children per woman under quarters of the x axis, the metric's rank up the
      // side, the median rank in each fifth of the countries, and the flat line of "no help"
      const m = metricOf(D, lay.lit), X = (v) => sx(v) * 100, Y = (v) => (1 - sy(v)) * 100;
      D.ticks.forEach((v, i) => html.push(`<span class="tick" style="left:${X(i / 4)}%">${v.toFixed(1)}</span>`));
      html.push(`<span class="ytick" style="top:${Y(1)}%">${SHORT[m.id]}<br>highest</span>`);
      html.push(`<span class="ytick" style="top:${Y(0)}%">lowest</span>`);
      const pts = m.bands.map((b) => `${X(b.x)},${Y(b.y)}`).join(' ');
      html.push(`<svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline class="pace" points="${X(0)},${Y(0.5)} ${X(1)},${Y(0.5)}"/><polyline class="med" points="${pts}"/></svg>`);
      html.push(`<span class="key"><i class="med"></i>median rank, each fifth of the countries`
        + `<br><i class="pace"></i>if children told you nothing</span>`);
      html.push(`<span class="unit">x: children per woman, fewest to most · y: rank in ${m.what.toLowerCase()}</span>`);
    }
    axes.innerHTML = html.join('');
    axes.dataset.kind = kind;
  };

  const t0 = performance.now();
  const frame = () => {
    const { i, t } = progress();
    const j = Math.min(i + 1, steps.length - 1);
    const A = layouts[i], Bl = layouts[j];
    pts.set(A.slots, Bl.slots);
    const cur = t > 0.5 ? j : i;
    if (cur !== shown) {
      shown = cur;
      drawAxes(layouts[cur], steps[cur].dataset.kind);
      document.body.dataset.step = cur;
    }
    axes.style.opacity = String(Math.abs(t - 0.5) * 2);
    const r = plot.getBoundingClientRect();
    const sz = (l) => (l.kind === 'columns' ? Math.max(2, l.cell * r.width * 0.86) : Math.max(5, r.width / 70));
    const size = sz(A) + (sz(Bl) - sz(A)) * t;
    pts.draw({ t, time: (performance.now() - t0) / 1000, size, rect: [r.left, r.top, r.width, r.height], dpr });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') main().catch((e) => {
  document.body.classList.add('failed');
  document.getElementById('err').textContent = String(e.message || e);
  console.error(e);
});

export { TOP };
