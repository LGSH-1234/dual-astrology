import { describe, expect, it } from 'vitest';
import { astro } from 'iztro';
import { hourToTimeIndex, localToUtc, resolveBirth } from '../../src/lib/astro/time';
import { computeZiwei, computeZiweiHoroscope, soulPalace, validateZiweiHoroscope, ZiweiHoroscopeError } from '../../src/lib/astro/ziwei';
import { buildSnapshot, westernDaily, ziweiDaily, ziweiSummary, westernSummary } from '../../src/lib/astro/snapshot';
import type { BirthProfile } from '../../src/lib/types';

describe('时间换算', () => {
  it('1988 年中国夏令时按 UTC+9 换算', () => {
    const { utc, offset } = localToUtc('1988-07-01', '12:00', 'Asia/Shanghai');
    expect(offset).toBe(540);
    expect(utc.toISOString()).toBe('1988-07-01T03:00:00.000Z');
    const r = resolveBirth({ date: '1988-07-01', time: '12:00', timeKnown: true, cityId: 'beijing', gender: '男' });
    expect(r.dstApplied).toBe(true);
    expect(r.notes.join()).toContain('夏令时');
  });
  it('1995 年无夏令时', () => {
    const r = resolveBirth({ date: '1995-06-15', time: '12:00', timeKnown: true, cityId: 'beijing', gender: '女' });
    expect(r.offsetMinutes).toBe(480);
    expect(r.dstApplied).toBe(false);
  });
  it('纽约夏令时', () => {
    expect(localToUtc('2000-07-04', '09:00', 'America/New_York').offset).toBe(-240);
    expect(localToUtc('2000-01-04', '09:00', 'America/New_York').offset).toBe(-300);
  });
  it('真太阳时：乌鲁木齐比北京时间晚约 2 小时', () => {
    const r = resolveBirth({ date: '2000-03-21', time: '12:00', timeKnown: true, cityId: 'urumqi', gender: '男' });
    expect(r.solarTime.startsWith('09:')).toBe(true);
    expect(r.timeIndex).toBe(5); // 巳时
  });
  it('真太阳时跨日：凌晨 0:20 在西部城市落到前一天晚子时', () => {
    const r = resolveBirth({ date: '2000-03-21', time: '00:20', timeKnown: true, cityId: 'chengdu', gender: '男' });
    expect(r.solarDate).toBe('2000-03-20');
    expect(r.timeIndex).toBe(12);
  });
  it('时辰序号', () => {
    expect(hourToTimeIndex(0)).toBe(0);
    expect(hourToTimeIndex(1)).toBe(1);
    expect(hourToTimeIndex(12)).toBe(6);
    expect(hourToTimeIndex(22)).toBe(11);
    expect(hourToTimeIndex(23)).toBe(12);
  });
});

describe('紫微命盘', () => {
  it('与 iztro 直接排盘一致', () => {
    const z = computeZiwei('1995-06-15', 6, '女');
    const raw = astro.bySolar('1995-6-15', 6, '女', true, 'zh-CN');
    expect(z.palaces).toHaveLength(12);
    expect(z.fiveElements).toBe(raw.fiveElementsClass);
    expect(soulPalace(z).earthlyBranch).toBe(raw.earthlyBranchOfSoulPalace);
    expect(z.palaces.every((p) => p.name.endsWith('宫'))).toBe(true);
    expect(z.palaces.filter((p) => p.isSoul)).toHaveLength(1);
    expect(z.palaces.filter((p) => p.isBody)).toHaveLength(1);
  });
  it('本命四化齐全', () => {
    const z = computeZiwei('1995-06-15', 6, '女');
    expect(Object.values(z.natalMutagens).every(Boolean)).toBe(true);
  });
  it('空宫借对宫主星', () => {
    const z = computeZiwei('1995-06-15', 6, '女');
    for (const p of z.palaces.filter((x) => x.borrowed)) {
      const opp = z.palaces[(p.index + 6) % 12];
      expect(p.majorStars.map((s) => s.name)).toEqual(opp.majorStars.map((s) => s.name));
    }
    expect(z.palaces.some((p) => p.borrowed)).toBe(true);
  });
  it('性别影响大限方向', () => {
    const f = computeZiwei('1995-06-15', 6, '女');
    const m = computeZiwei('1995-06-15', 6, '男');
    expect(f.palaces.map((p) => p.decadal[0])).not.toEqual(m.palaces.map((p) => p.decadal[0]));
  });
  it('运限', () => {
    const h = computeZiweiHoroscope('1995-06-15', 6, '女', new Date(2026, 9, 1));
    expect(h.decadalRange[0]).toBeLessThanOrEqual(h.nominalAge);
    expect(h.decadalRange[1]).toBeGreaterThanOrEqual(h.nominalAge);
    expect(h.yearlyMutagens.禄).toBeTruthy();
  });
  it('拒绝超出紫微运限范围的出生日期', () => {
    const today = new Date(2026, 9, 1);
    expect(() => computeZiweiHoroscope('1900-06-15', 6, '女', today)).toThrow(ZiweiHoroscopeError);
    expect(() => computeZiweiHoroscope('2100-06-15', 6, '女', today)).toThrow(ZiweiHoroscopeError);
    expect(validateZiweiHoroscope('1995-06-15', 6, '女', today)).toBeNull();
    expect(validateZiweiHoroscope('2026-10-02', 6, '女', today)).toContain('不能晚于今天');
  });
});

describe('快照', () => {
  const birth: BirthProfile = { date: '1995-06-15', time: '12:30', timeKnown: true, cityId: 'hangzhou', gender: '女' };
  it('同一份资料同时生成两种模式', () => {
    const s = buildSnapshot('me', birth);
    expect(s.western.planets).toHaveLength(10);
    expect(s.ziwei.palaces).toHaveLength(12);
    expect(westernSummary(s).sun).toBe('双子座');
    expect(ziweiSummary(s).palaces).toHaveLength(12);
    const d = new Date(2026, 9, 1);
    expect(westernDaily(s, d).headline).toBeTruthy();
    expect(ziweiDaily(s, d).influences).toHaveLength(3);
  });
});
