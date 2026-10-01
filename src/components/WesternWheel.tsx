import type { WesternChart } from '../lib/types';
import { ASPECT_INFO, PLANET_INFO, SIGNS, fmtDeg, pname, signName } from '../lib/content';
import { norm } from '../lib/astro/western';

const C = 200;
const R_OUT = 190, R_SIGN = 160, R_HOUSE = 128, R_PLANET = 108, R_ASPECT = 84;

/** 上升点固定在左侧（9 点钟方向），黄经逆时针增加 */
function pt(lon: number, asc: number, r: number) {
  const a = ((180 + lon - asc) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C - r * Math.sin(a) };
}

/** 让相邻行星符号至少相隔 minGap 度 */
function spread(lons: number[], minGap = 9): number[] {
  const idx = lons.map((l, i) => ({ l, i })).sort((a, b) => a.l - b.l);
  const out = idx.map((x) => x.l);
  for (let pass = 0; pass < 6; pass++) {
    for (let k = 0; k < out.length; k++) {
      const n = (k + 1) % out.length;
      const gap = norm(out[n] - out[k]);
      if (gap < minGap && out.length > 1) {
        const push = (minGap - gap) / 2;
        out[k] = norm(out[k] - push);
        out[n] = norm(out[n] + push);
      }
    }
  }
  const res = new Array<number>(lons.length);
  idx.forEach((x, k) => { res[x.i] = out[k]; });
  return res;
}

export function WesternWheel({ chart, size = 400, compact = false }: { chart: WesternChart; size?: number; compact?: boolean }) {
  const asc = chart.timeKnown ? chart.ascendant : 0;
  const shown = spread(chart.planets.map((p) => p.lon));
  const lonOf = (k: string) => (k === 'ASC' ? chart.ascendant : k === 'MC' ? chart.midheaven : chart.planets.find((p) => p.key === k)?.lon ?? 0);
  const desc = `本命盘：太阳${signName(chart.bigThree.sun)}，月亮${signName(chart.bigThree.moon)}${chart.timeKnown ? `，上升${signName(chart.bigThree.rising)}` : ''}。`;

  return (
    <svg viewBox="0 0 400 400" width={size} height={size} role="img" aria-label={desc} className="h-auto max-w-full" data-testid="western-wheel">
      <title>{desc}</title>
      <circle cx={C} cy={C} r={R_OUT} fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.2" />
      <circle cx={C} cy={C} r={R_SIGN} fill="none" stroke="var(--line)" />
      <circle cx={C} cy={C} r={R_HOUSE} fill="none" stroke="var(--line)" />
      <circle cx={C} cy={C} r={R_ASPECT} fill="var(--paper)" stroke="var(--line)" />

      {/* 星座环 */}
      {SIGNS.map((s, i) => {
        const a = pt(i * 30, asc, R_OUT), b = pt(i * 30, asc, R_SIGN);
        const g = pt(i * 30 + 15, asc, (R_OUT + R_SIGN) / 2);
        return (
          <g key={s.name}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--line)" />
            <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize="15" className="glyph" fill={['火', '土'].includes(s.element) ? 'var(--accent-ink)' : 'var(--muted)'}>
              {s.glyph}{'︎'}
            </text>
          </g>
        );
      })}

      {/* 宫位线 */}
      {chart.timeKnown && chart.cusps.map((c, i) => {
        const a = pt(c, asc, R_SIGN), b = pt(c, asc, R_ASPECT);
        const axis = i === 0 || i === 3 || i === 6 || i === 9;
        const mid = pt(c + norm(chart.cusps[(i + 1) % 12] - c) / 2, asc, R_ASPECT + 10);
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={axis ? 'var(--ink)' : 'var(--line)'} strokeWidth={axis ? 1.2 : 1} />
            {!compact && <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" fontSize="8" fill="var(--muted)">{i + 1}</text>}
          </g>
        );
      })}

      {/* 相位线 */}
      {chart.aspects.filter((x) => x.a !== 'MC' && x.b !== 'MC').slice(0, compact ? 8 : 18).map((x, i) => {
        const a = pt(lonOf(x.a), asc, R_ASPECT), b = pt(lonOf(x.b), asc, R_ASPECT);
        const tone = ASPECT_INFO[x.type].tone;
        if (x.type === 'conjunction') return null;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth="0.9" stroke={tone === 'hard' ? '#8a2f2a' : '#c8623e'} strokeDasharray={tone === 'hard' ? '' : '3 2'} opacity={0.8 - x.orb * 0.06} />;
      })}

      {/* 行星 */}
      {chart.planets.map((p, i) => {
        const tick = pt(p.lon, asc, R_HOUSE), tick2 = pt(p.lon, asc, R_HOUSE - 6);
        const g = pt(shown[i], asc, R_PLANET);
        return (
          <g key={p.key}>
            <line x1={tick.x} y1={tick.y} x2={tick2.x} y2={tick2.y} stroke="var(--ink)" />
            <circle cx={g.x} cy={g.y} r="9" fill="var(--surface)" />
            <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize="13" className="glyph" fill={p.key === 'Sun' || p.key === 'Moon' ? 'var(--accent-ink)' : 'var(--ink)'}>
              <title>{`${pname(p.key)} ${SIGNS[p.sign].name} ${fmtDeg(p.degree)}${p.retrograde ? ' 逆行' : ''}`}</title>
              {PLANET_INFO[p.key].glyph}{'︎'}
            </text>
          </g>
        );
      })}

      {chart.timeKnown && (() => {
        const l = pt(chart.ascendant, asc, R_OUT + 1);
        const m = pt(chart.midheaven, asc, R_OUT + 1);
        return (
          <g fontSize="9" fontWeight="600" fill="var(--ink)">
            <text x={l.x + 4} y={l.y - 6}>AC</text>
            <text x={m.x + 4} y={m.y + 12}>MC</text>
          </g>
        );
      })()}
    </svg>
  );
}
