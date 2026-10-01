import { describe, expect, it } from 'vitest';
import * as A from 'astronomy-engine';
import { computeWestern, houseCusps, houseOf, planetLongitude, ramc, sep, norm, transits } from '../../src/lib/astro/western';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const eps = (d: Date) => A.e_tilt(A.MakeTime(d)).tobl;

function eclToEq(lon: number, e: number) {
  const l = lon * D2R, x = e * D2R;
  const ra = norm(Math.atan2(Math.sin(l) * Math.cos(x), Math.cos(l)) * R2D);
  const dec = Math.asin(Math.sin(x) * Math.sin(l)) * R2D;
  return { ra, dec };
}

describe('行星位置', () => {
  it('太阳在 6 月 15 日约为双子座 24°', () => {
    const l = planetLongitude('Sun', new Date(Date.UTC(1995, 5, 15, 4)));
    expect(l).toBeGreaterThan(83);
    expect(l).toBeLessThan(85);
  });
  it('春分时太阳黄经接近 0°', () => {
    const eq = A.Seasons(2024).mar_equinox.date;
    expect(sep(planetLongitude('Sun', eq), 0)).toBeLessThan(0.01);
  });
});

describe('宫位', () => {
  const cases = [
    { name: '北京', lat: 39.9, lon: 116.4, date: new Date(Date.UTC(1995, 5, 15, 4)) },
    { name: '悉尼', lat: -33.87, lon: 151.2, date: new Date(Date.UTC(2001, 10, 2, 21, 30)) },
    { name: '伦敦', lat: 51.5, lon: -0.13, date: new Date(Date.UTC(1988, 0, 20, 18, 45)) },
  ];

  for (const c of cases) {
    it(`${c.name}：上升点位于东方地平线`, () => {
      const { asc, mc, cusps } = houseCusps(c.date, c.lat, c.lon);
      const e = eps(c.date);
      const { ra, dec } = eclToEq(asc, e);
      const H = (ramc(c.date, c.lon) - ra) * D2R;
      const alt = Math.asin(Math.sin(c.lat * D2R) * Math.sin(dec * D2R) + Math.cos(c.lat * D2R) * Math.cos(dec * D2R) * Math.cos(H)) * R2D;
      expect(Math.abs(alt)).toBeLessThan(0.01);
      expect(Math.sin(H)).toBeLessThan(0); // 东方
      expect(cusps[0]).toBe(asc);
      expect(cusps[9]).toBe(mc);
    });

    it(`${c.name}：Placidus 宫头满足半弧三等分`, () => {
      const { cusps, system } = houseCusps(c.date, c.lat, c.lon);
      expect(system).toBe('Placidus');
      const e = eps(c.date), rm = ramc(c.date, c.lon);
      for (const [idx, frac] of [[10, 1 / 3], [11, 2 / 3]] as const) {
        const { ra, dec } = eclToEq(cusps[idx], e);
        const ad = Math.asin(Math.tan(c.lat * D2R) * Math.tan(dec * D2R)) * R2D;
        expect(sep(norm(ra - rm), frac * (90 + ad))).toBeLessThan(0.001);
      }
      for (let i = 0; i < 6; i++) expect(sep(cusps[i], cusps[i + 6])).toBeCloseTo(180, 6);
      // 宫头依次递增
      for (let i = 0; i < 12; i++) expect(norm(cusps[(i + 1) % 12] - cusps[i])).toBeLessThan(180);
    });
  }

  it('天顶在太阳上中天时与太阳重合', () => {
    const obs = new A.Observer(39.9, 116.4, 0);
    const t = A.SearchHourAngle(A.Body.Sun, obs, 0, A.MakeTime(new Date(Date.UTC(2020, 2, 1)))).time.date;
    const { mc } = houseCusps(t, 39.9, 116.4);
    expect(sep(mc, planetLongitude('Sun', t))).toBeLessThan(0.05);
  });

  it('高纬度无解时回退到 Porphyry', () => {
    const r = houseCusps(new Date(Date.UTC(2000, 5, 21, 12)), 69.6, 18.9);
    expect(['Placidus', 'Porphyry']).toContain(r.system);
    const r2 = houseCusps(new Date(Date.UTC(2000, 11, 21, 6)), 78.2, 15.6);
    expect(r2.system).toBe('Porphyry');
    for (let i = 0; i < 12; i++) expect(norm(r2.cusps[(i + 1) % 12] - r2.cusps[i])).toBeLessThan(180);
  });

  it('houseOf 能处理跨 0° 的宫', () => {
    const cusps = [350, 20, 50, 80, 110, 140, 170, 200, 230, 260, 290, 320];
    expect(houseOf(355, cusps)).toBe(1);
    expect(houseOf(5, cusps)).toBe(1);
    expect(houseOf(21, cusps)).toBe(2);
    expect(houseOf(340, cusps)).toBe(12);
  });
});

describe('本命盘', () => {
  const chart = computeWestern(new Date(Date.UTC(1995, 5, 15, 4)), 39.9, 116.4, true);
  it('包含 10 颗行星并且宫位合法', () => {
    expect(chart.planets).toHaveLength(10);
    for (const p of chart.planets) {
      expect(p.house).toBeGreaterThanOrEqual(1);
      expect(p.house).toBeLessThanOrEqual(12);
      expect(p.sign).toBe(Math.floor(p.lon / 30));
    }
    expect(chart.bigThree.sun).toBe(2); // 双子
  });
  it('相位在容许度内并按紧密程度排序', () => {
    expect(chart.aspects.length).toBeGreaterThan(0);
    for (let i = 1; i < chart.aspects.length; i++) expect(chart.aspects[i].orb).toBeGreaterThanOrEqual(chart.aspects[i - 1].orb);
  });
  it('出生时间未知时不计算上升相位', () => {
    const c = computeWestern(new Date(Date.UTC(1995, 5, 15, 4)), 39.9, 116.4, false);
    expect(c.aspects.some((a) => a.a === 'ASC' || a.b === 'ASC')).toBe(false);
  });
  it('2000 年前后检测到水星逆行', () => {
    // 2000-03-01 前后水星逆行（2/21–3/14）
    const c = computeWestern(new Date(Date.UTC(2000, 2, 1)), 0, 0, false);
    expect(c.planets.find((p) => p.key === 'Mercury')!.retrograde).toBe(true);
  });
  it('行运使用紧密容许度', () => {
    for (const t of transits(chart, new Date(Date.UTC(2026, 9, 1)))) expect(t.orb).toBeLessThanOrEqual(3.3);
  });
});
