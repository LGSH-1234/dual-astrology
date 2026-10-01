import type { City } from '../lib/types';
import RAW from './regions.json';

// 全国省 / 地级市 / 区县三级地点（离线，不调用地理编码服务）。
// 名称：@aurouscia/china-areas 0.7.0（民政部国家地名信息库，2026，MIT）
// 坐标：cpca 0.5.5 adcodes.csv（MIT）；新设/更名区县按前身县区或驻地补齐。见 docs/PROVENANCE.md
export interface Region { c: string; n: string; o: [number, number]; d?: Region[] }

export const REGIONS = RAW as unknown as Region[];

const TZ: Record<string, string> = { '71': 'Asia/Taipei', '81': 'Asia/Hong_Kong', '82': 'Asia/Macau' };

const INDEX = new Map<string, City>();
for (const p of REGIONS) {
  const tz = TZ[p.c.slice(0, 2)] ?? 'Asia/Shanghai';
  const add = (r: Region, path: string[]) => {
    INDEX.set(r.c, { id: r.c, name: r.n, path, country: '中国', lon: r.o[0], lat: r.o[1], tz });
  };
  add(p, [p.n]);
  for (const c of p.d ?? []) {
    add(c, [p.n, c.n]);
    for (const k of c.d ?? []) add(k, [p.n, c.n, k.n]);
  }
}

/** 旧版数据里的城市 id → 行政区划代码，保证老资料照常排盘 */
const LEGACY: Record<string, string> = {
  beijing: '110000', shanghai: '310000', tianjin: '120000', chongqing: '500000',
  guangzhou: '440100', shenzhen: '440300', hangzhou: '330100', nanjing: '320100', suzhou: '320500',
  chengdu: '510100', wuhan: '420100', xian: '610100', changsha: '430100', zhengzhou: '410100',
  qingdao: '370200', xiamen: '350200', fuzhou: '350100', kunming: '530100', harbin: '230100',
  shenyang: '210100', urumqi: '650100', lhasa: '540100', hongkong: '810000', taipei: '710000',
};

/** 旧版可选的海外城市：界面不再提供，仅用于已保存资料的兼容 */
const FOREIGN: City[] = [
  { id: 'singapore', name: '新加坡', country: '新加坡', lat: 1.352, lon: 103.820, tz: 'Asia/Singapore' },
  { id: 'tokyo', name: '东京', country: '日本', lat: 35.676, lon: 139.650, tz: 'Asia/Tokyo' },
  { id: 'seoul', name: '首尔', country: '韩国', lat: 37.566, lon: 126.978, tz: 'Asia/Seoul' },
  { id: 'sydney', name: '悉尼', country: '澳大利亚', lat: -33.869, lon: 151.209, tz: 'Australia/Sydney' },
  { id: 'london', name: '伦敦', country: '英国', lat: 51.507, lon: -0.128, tz: 'Europe/London' },
  { id: 'paris', name: '巴黎', country: '法国', lat: 48.857, lon: 2.352, tz: 'Europe/Paris' },
  { id: 'berlin', name: '柏林', country: '德国', lat: 52.520, lon: 13.405, tz: 'Europe/Berlin' },
  { id: 'newyork', name: '纽约', country: '美国', lat: 40.713, lon: -74.006, tz: 'America/New_York' },
  { id: 'losangeles', name: '洛杉矶', country: '美国', lat: 34.052, lon: -118.244, tz: 'America/Los_Angeles' },
  { id: 'sanfrancisco', name: '旧金山', country: '美国', lat: 37.775, lon: -122.419, tz: 'America/Los_Angeles' },
  { id: 'vancouver', name: '温哥华', country: '加拿大', lat: 49.283, lon: -123.121, tz: 'America/Vancouver' },
  { id: 'toronto', name: '多伦多', country: '加拿大', lat: 43.653, lon: -79.383, tz: 'America/Toronto' },
];

/** 把旧 id 规范成行政区划代码；海外旧城市原样返回，未知返回 '' */
export function normalizeCityId(id: string | undefined): string {
  if (!id) return '';
  if (INDEX.has(id)) return id;
  if (LEGACY[id]) return LEGACY[id];
  return FOREIGN.some((c) => c.id === id) ? id : '';
}

export function findCity(id: string | undefined): City | undefined {
  const n = normalizeCityId(id);
  return INDEX.get(n) ?? FOREIGN.find((c) => c.id === n);
}

export function getCity(id: string): City {
  return findCity(id) ?? INDEX.get('110000')!;
}

/** 显示用：「浙江省 · 台州市 · 临海市」；海外旧数据显示「东京 · 日本」 */
export function cityLabel(c: City): string {
  return c.path ? c.path.join(' · ') : `${c.name} · ${c.country}`;
}

export function isChinaRegion(id: string): boolean {
  return INDEX.has(id);
}

/** 行政区划代码 → [省, 市, 区县] 节点链（不存在返回 []） */
export function regionChain(id: string): Region[] {
  for (const p of REGIONS) {
    if (p.c === id) return [p];
    if (p.c.slice(0, 2) !== id.slice(0, 2)) continue;
    for (const c of p.d ?? []) {
      if (c.c === id) return [p, c];
      const k = c.d?.find((x) => x.c === id);
      if (k) return [p, c, k];
    }
  }
  return [];
}

/** 模糊搜索：名称包含关键字，区县优先，最多 limit 条 */
export function searchRegions(q: string, limit = 8): City[] {
  const s = q.trim().replace(/\s+/g, '');
  if (!s) return [];
  const hits: City[] = [];
  for (const c of INDEX.values()) if (c.name.includes(s) || c.path!.join('').includes(s)) hits.push(c);
  const score = (c: City) => (c.name.startsWith(s) ? 0 : c.name.includes(s) ? 1 : 2) * 10 + (3 - c.path!.length);
  return hits.sort((a, b) => score(a) - score(b)).slice(0, limit);
}
