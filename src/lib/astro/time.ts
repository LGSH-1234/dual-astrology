import type { BirthProfile, ResolvedBirth } from '../types';
import { getCity } from '../../data/cities';

const TIME_LABELS = [
  '早子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时',
  '未时', '申时', '酉时', '戌时', '亥时', '晚子时',
];

export function timeIndexLabel(i: number): string {
  return TIME_LABELS[i] ?? '';
}

/** 某一 UTC 时刻在 tz 时区相对 UTC 的分钟偏移（含历史夏令时，依赖 ICU 时区库） */
export function tzOffsetMinutes(tz: string, utcMs: number): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24; // 部分实现会输出 24
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, hour, +parts.minute, +parts.second);
  return Math.round((wall - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** 当地墙上时间 → UTC。两次迭代即可处理夏令时边界。 */
export function localToUtc(date: string, time: string, tz: string): { utc: Date; offset: number } {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let offset = tzOffsetMinutes(tz, wall);
  offset = tzOffsetMinutes(tz, wall - offset * 60000);
  return { utc: new Date(wall - offset * 60000), offset };
}

/** 均时差（分钟），常用近似式，误差约 ±1 分钟 */
export function equationOfTime(utc: Date): number {
  const start = Date.UTC(utc.getUTCFullYear(), 0, 0);
  const n = Math.floor((utc.getTime() - start) / 86400000);
  const b = ((2 * Math.PI) / 365) * (n - 81);
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/** 小时 → iztro 时辰序号：23 点为晚子时(12)，0 点为早子时(0) */
export function hourToTimeIndex(hour: number): number {
  if (hour >= 23) return 12;
  if (hour < 1) return 0;
  return Math.floor((hour + 1) / 2);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar dates must not shift when the browser is ahead of UTC. */
export function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isValidCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function resolveBirth(birth: BirthProfile): ResolvedBirth {
  const city = getCity(birth.cityId);
  const time = birth.timeKnown ? birth.time : '12:00';
  const { utc, offset } = localToUtc(birth.date, time, city.tz);

  const year = utc.getUTCFullYear();
  const standard = Math.min(
    tzOffsetMinutes(city.tz, Date.UTC(year, 0, 15)),
    tzOffsetMinutes(city.tz, Date.UTC(year, 6, 15)),
  );
  const dstApplied = offset > standard;

  // 真太阳时 = UTC + 经度×4 分钟 + 均时差
  const solarMs = utc.getTime() + (city.lon * 4 + equationOfTime(utc)) * 60000;
  const s = new Date(solarMs);
  const solarDate = `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
  const solarTime = `${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`;
  const timeIndex = hourToTimeIndex(s.getUTCHours());

  const notes: string[] = [];
  if (dstApplied) notes.push(`出生时刻 ${city.name} 实行夏令时，已按 UTC${fmtOffset(offset)} 换算。`);
  const diff = Math.round((solarMs - (utc.getTime() + offset * 60000)) / 60000);
  if (Math.abs(diff) >= 1) notes.push(`真太阳时比钟表时间${diff > 0 ? '快' : '慢'} ${Math.abs(diff)} 分钟，紫微排盘使用 ${solarTime}（${timeIndexLabel(timeIndex)}）。`);
  if (!birth.timeKnown) notes.push('出生时间未知，按正午排盘；上升点、宫位和命宫仅供参考。');

  return { utc, city, offsetMinutes: offset, dstApplied, solarDate, solarTime, timeIndex, notes };
}

export function fmtOffset(min: number): string {
  const sign = min >= 0 ? '+' : '-';
  const a = Math.abs(min);
  return `${sign}${Math.floor(a / 60)}${a % 60 ? ':' + pad(a % 60) : ''}`;
}
