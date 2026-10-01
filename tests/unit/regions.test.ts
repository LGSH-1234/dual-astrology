import { describe, expect, it } from 'vitest';
import { REGIONS, cityLabel, findCity, getCity, normalizeCityId, regionChain, searchRegions } from '../../src/data/cities';
import { resolveBirth } from '../../src/lib/astro/time';

describe('三级地点', () => {
  it('只包含中国，34 个省级单位，3000+ 个地点且都有坐标', () => {
    expect(REGIONS).toHaveLength(34);
    let n = 0;
    const walk = (r: typeof REGIONS) => r.forEach((x) => {
      n++;
      expect(x.o[0]).toBeGreaterThan(73); expect(x.o[0]).toBeLessThan(136);
      expect(x.o[1]).toBeGreaterThan(3); expect(x.o[1]).toBeLessThan(54);
      if (x.d) walk(x.d);
    });
    walk(REGIONS);
    expect(n).toBeGreaterThan(3000);
  });
  it('浙江省 · 台州市 · 临海市', () => {
    const c = getCity('331082');
    expect(cityLabel(c)).toBe('浙江省 · 台州市 · 临海市');
    expect(c.lon).toBeCloseTo(121.14, 1);
    expect(regionChain('331082').map((x) => x.n)).toEqual(['浙江省', '台州市', '临海市']);
  });
  it('直辖市两级、港澳台用各自时区', () => {
    expect(cityLabel(getCity('110108'))).toBe('北京市 · 海淀区');
    expect(getCity('810000').tz).toBe('Asia/Hong_Kong');
    expect(getCity('710000').tz).toBe('Asia/Taipei');
    expect(getCity('820000').tz).toBe('Asia/Macau');
  });
  it('搜索：区县优先', () => {
    const r = searchRegions('临海');
    expect(r[0].id).toBe('331082');
    expect(searchRegions('')).toEqual([]);
  });
  it('旧版城市 id 兼容', () => {
    expect(normalizeCityId('hangzhou')).toBe('330100');
    expect(cityLabel(getCity('beijing'))).toBe('北京市');
    expect(findCity('tokyo')?.tz).toBe('Asia/Tokyo');
    expect(normalizeCityId('nowhere')).toBe('');
  });
  it('区县经度影响真太阳时：喀什比乌鲁木齐更晚', () => {
    const b = { date: '2000-03-21', time: '12:00', timeKnown: true, gender: '男' as const };
    const urumqi = resolveBirth({ ...b, cityId: '650102' });
    const kashi = resolveBirth({ ...b, cityId: '653101' });
    expect(kashi.solarTime < urumqi.solarTime).toBe(true);
  });
});
