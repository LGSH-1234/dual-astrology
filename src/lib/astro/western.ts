import * as A from 'astronomy-engine';
import type { Aspect, AspectType, PlanetKey, PlanetPosition, Transit, WesternChart } from '../types';

export const PLANETS: PlanetKey[] = [
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
];

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
export const norm = (x: number) => ((x % 360) + 360) % 360;
/** 两个黄经之间的最小夹角 0–180 */
export const sep = (a: number, b: number) => {
  const d = Math.abs(norm(a) - norm(b));
  return d > 180 ? 360 - d : d;
};

export const ASPECTS: { type: AspectType; angle: number; orb: number }[] = [
  { type: 'conjunction', angle: 0, orb: 8 },
  { type: 'sextile', angle: 60, orb: 5 },
  { type: 'square', angle: 90, orb: 7 },
  { type: 'trine', angle: 120, orb: 7 },
  { type: 'opposition', angle: 180, orb: 8 },
];

export function findAspect(a: number, b: number, orbScale = 1): { type: AspectType; orb: number } | null {
  const s = sep(a, b);
  let best: { type: AspectType; orb: number } | null = null;
  for (const asp of ASPECTS) {
    const orb = Math.abs(s - asp.angle);
    if (orb <= asp.orb * orbScale && (!best || orb < best.orb)) best = { type: asp.type, orb };
  }
  return best;
}

/** 地心视黄经（真黄道、当日春分点） */
export function planetLongitude(key: PlanetKey, date: Date): number {
  const t = A.MakeTime(date);
  const v = A.GeoVector(key as A.Body, t, true);
  return norm(A.Ecliptic(v).elon);
}

function obliquity(date: Date): number {
  return A.e_tilt(A.MakeTime(date)).tobl;
}

/** 本地恒星时（度）= RAMC */
export function ramc(date: Date, lon: number): number {
  return norm(A.SiderealTime(A.MakeTime(date)) * 15 + lon);
}

/** 赤经 → 黄道上同赤经的点的黄经 */
function raToLon(ra: number, eps: number): number {
  return norm(Math.atan2(Math.sin(ra * D2R), Math.cos(ra * D2R) * Math.cos(eps * D2R)) * R2D);
}

export function ascendant(rm: number, lat: number, eps: number): number {
  const r = rm * D2R, e = eps * D2R, f = lat * D2R;
  return norm(Math.atan2(Math.cos(r), -(Math.sin(r) * Math.cos(e) + Math.tan(f) * Math.sin(e))) * R2D);
}

export function midheaven(rm: number, eps: number): number {
  return raToLon(rm, eps);
}

/**
 * Placidus 中间宫头。frac 为半弧比例，above=true 表示地平线上方（11、12 宫）。
 * 迭代求解：宫头所在黄道点的赤纬决定其半弧，半弧又决定赤经。
 */
function placidusCusp(rm: number, lat: number, eps: number, frac: number, above: boolean): number | null {
  const tf = Math.tan(lat * D2R);
  let lon = raToLon(above ? rm + 90 * frac : rm + 180 - 90 * frac, eps);
  for (let i = 0; i < 30; i++) {
    const dec = Math.asin(Math.sin(eps * D2R) * Math.sin(lon * D2R));
    const x = tf * Math.tan(dec);
    if (Math.abs(x) >= 1) return null;
    const ad = Math.asin(x) * R2D; // 上升差
    const ra = above ? rm + frac * (90 + ad) : rm + 180 - frac * (90 - ad);
    const next = raToLon(ra, eps);
    if (sep(next, lon) < 1e-7) return next;
    lon = next;
  }
  return lon;
}

export function houseCusps(date: Date, lat: number, lon: number): { cusps: number[]; system: 'Placidus' | 'Porphyry'; asc: number; mc: number } {
  const eps = obliquity(date);
  const rm = ramc(date, lon);
  const asc = ascendant(rm, lat, eps);
  const mc = midheaven(rm, eps);

  const c11 = placidusCusp(rm, lat, eps, 1 / 3, true);
  const c12 = placidusCusp(rm, lat, eps, 2 / 3, true);
  const c2 = placidusCusp(rm, lat, eps, 2 / 3, false);
  const c3 = placidusCusp(rm, lat, eps, 1 / 3, false);

  if (c11 !== null && c12 !== null && c2 !== null && c3 !== null) {
    const cusps = [asc, c2, c3, norm(mc + 180), norm(c11 + 180), norm(c12 + 180),
      norm(asc + 180), norm(c2 + 180), norm(c3 + 180), mc, c11, c12];
    return { cusps, system: 'Placidus', asc, mc };
  }
  // 高纬度 Placidus 无解时改用 Porphyry（象限三等分）
  const q1 = norm(asc - mc); // MC→ASC 弧
  const q2 = norm(norm(mc + 180) - asc); // ASC→IC 弧
  const cusps = new Array<number>(12);
  cusps[0] = asc; cusps[9] = mc;
  cusps[10] = norm(mc + q1 / 3); cusps[11] = norm(mc + (2 * q1) / 3);
  cusps[1] = norm(asc + q2 / 3); cusps[2] = norm(asc + (2 * q2) / 3);
  for (let i = 0; i < 6; i++) if (cusps[i + 6] === undefined) cusps[i + 6] = norm(cusps[i] + 180);
  cusps[3] = norm(mc + 180); cusps[4] = norm(cusps[10] + 180); cusps[5] = norm(cusps[11] + 180);
  return { cusps, system: 'Porphyry', asc, mc };
}

export function houseOf(lon: number, cusps: number[]): number {
  for (let i = 0; i < 12; i++) {
    const start = cusps[i];
    const end = cusps[(i + 1) % 12];
    const span = norm(end - start);
    if (norm(lon - start) < span) return i + 1;
  }
  return 1;
}

export function computeWestern(utc: Date, lat: number, lon: number, timeKnown: boolean): WesternChart {
  const { cusps, system, asc, mc } = houseCusps(utc, lat, lon);
  const next = new Date(utc.getTime() + 86400000);
  const planets: PlanetPosition[] = PLANETS.map((key) => {
    const l = planetLongitude(key, utc);
    const l2 = planetLongitude(key, next);
    const motion = ((l2 - l + 540) % 360) - 180;
    return {
      key,
      lon: l,
      sign: Math.floor(l / 30),
      degree: l % 30,
      house: houseOf(l, cusps),
      retrograde: key !== 'Sun' && key !== 'Moon' && motion < 0,
    };
  });

  const points: { name: string; lon: number }[] = planets.map((p) => ({ name: p.key, lon: p.lon }));
  if (timeKnown) points.push({ name: 'ASC', lon: asc }, { name: 'MC', lon: mc });

  const aspects: Aspect[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (points[i].name === 'ASC' && points[j].name === 'MC') continue;
      const hit = findAspect(points[i].lon, points[j].lon);
      if (hit) aspects.push({ a: points[i].name, b: points[j].name, type: hit.type, orb: hit.orb });
    }
  }
  aspects.sort((x, y) => x.orb - y.orb);

  return {
    planets,
    ascendant: asc,
    midheaven: mc,
    cusps,
    houseSystem: system,
    aspects,
    bigThree: { sun: planets[0].sign, moon: planets[1].sign, rising: Math.floor(asc / 30) },
    timeKnown,
  };
}

/** 当前天空：行星实时位置 */
export function currentSky(date: Date): { key: PlanetKey; lon: number; sign: number }[] {
  return PLANETS.map((key) => {
    const lon = planetLongitude(key, date);
    return { key, lon, sign: Math.floor(lon / 30) };
  });
}

/** 行运：当前行星对本命行星/上升形成的紧密相位 */
export function transits(natal: WesternChart, date: Date): Transit[] {
  const sky = currentSky(date);
  const targets = natal.planets.map((p) => ({ name: p.key as string, lon: p.lon }));
  if (natal.timeKnown) targets.push({ name: 'ASC', lon: natal.ascendant }, { name: 'MC', lon: natal.midheaven });
  const out: Transit[] = [];
  for (const s of sky) {
    const scale = s.key === 'Moon' ? 0.4 : 0.3; // 约 2–3° 容许度
    for (const t of targets) {
      const hit = findAspect(s.lon, t.lon, scale);
      if (hit) out.push({ transiting: s.key, natal: t.name, type: hit.type, orb: hit.orb });
    }
  }
  // 慢速行星的行运更有分量，月亮最快，排在后面
  const weight = (k: PlanetKey) => (k === 'Moon' ? 3 : k === 'Sun' || k === 'Mercury' || k === 'Venus' ? 1.5 : 1);
  return out.sort((a, b) => a.orb * weight(a.transiting) - b.orb * weight(b.transiting));
}
