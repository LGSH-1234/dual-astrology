import { astro } from 'iztro';
import type { Gender, Mutagen, ZiweiChart, ZiweiHoroscope, ZiweiPalace, ZiweiStar } from '../types';

const MUTAGENS: Mutagen[] = ['禄', '权', '科', '忌'];

export class ZiweiHoroscopeError extends Error {
  readonly code = 'UNSUPPORTED_RANGE' as const;

  constructor(message = '当前紫微运限无法计算这份出生资料，请选择 1905 年以后且不晚于今天的日期。') {
    super(message);
    this.name = 'ZiweiHoroscopeError';
  }
}

/** iztro 的宫名除“命宫”外不带“宫”字，这里统一补齐 */
export function palaceName(raw: string): string {
  return raw.endsWith('宫') ? raw : `${raw}宫`;
}

type RawStar = { name: string; type: string; brightness?: string; mutagen?: string };

function toStar(s: RawStar, type: ZiweiStar['type']): ZiweiStar {
  const m = s.mutagen && MUTAGENS.includes(s.mutagen as Mutagen) ? (s.mutagen as Mutagen) : undefined;
  return { name: s.name, type, brightness: s.brightness || undefined, mutagen: m };
}

function mutagenMap(list: string[]): Record<Mutagen, string> {
  return { 禄: list[0] ?? '', 权: list[1] ?? '', 科: list[2] ?? '', 忌: list[3] ?? '' };
}

/** solarDate 为真太阳时日期 YYYY-MM-DD，timeIndex 为时辰序号 */
export function buildAstrolabe(solarDate: string, timeIndex: number, gender: Gender) {
  const [y, m, d] = solarDate.split('-').map(Number);
  return astro.bySolar(`${y}-${m}-${d}`, timeIndex, gender, true, 'zh-CN');
}

export function computeZiwei(solarDate: string, timeIndex: number, gender: Gender): ZiweiChart {
  const a = buildAstrolabe(solarDate, timeIndex, gender);
  const raw = a.palaces;

  const palaces: ZiweiPalace[] = raw.map((p) => ({
    index: p.index,
    name: palaceName(p.name),
    heavenlyStem: p.heavenlyStem,
    earthlyBranch: p.earthlyBranch,
    isSoul: p.name === '命宫',
    isBody: p.isBodyPalace,
    majorStars: (p.majorStars as RawStar[]).map((s) => toStar(s, 'major')),
    minorStars: (p.minorStars as RawStar[]).map((s) => toStar(s, 'minor')),
    adjectiveStars: (p.adjectiveStars as RawStar[]).map((s) => toStar(s, 'adjective')),
    decadal: [p.decadal.range[0], p.decadal.range[1]] as [number, number],
    borrowed: false,
    changsheng12: p.changsheng12,
    boshi12: p.boshi12,
    suiqian12: p.suiqian12,
    jiangqian12: p.jiangqian12,
    ages: p.ages,
  }));

  // 空宫借对宫主星（对宫 = 相隔 6 宫），标记 borrowed 供界面区分
  for (const p of palaces) {
    if (p.majorStars.length === 0) {
      const opp = palaces[(p.index + 6) % 12];
      if (opp.majorStars.length) {
        p.majorStars = opp.majorStars.map((s) => ({ ...s, mutagen: undefined }));
        p.borrowed = true;
      }
    }
  }

  const natal: Record<Mutagen, string> = { 禄: '', 权: '', 科: '', 忌: '' };
  for (const p of raw) {
    for (const s of [...p.majorStars, ...p.minorStars] as RawStar[]) {
      if (s.mutagen && MUTAGENS.includes(s.mutagen as Mutagen)) natal[s.mutagen as Mutagen] = s.name;
    }
  }

  return {
    palaces,
    soulBranch: a.earthlyBranchOfSoulPalace,
    bodyBranch: a.earthlyBranchOfBodyPalace,
    soulStar: a.soul,
    bodyStar: a.body,
    fiveElements: a.fiveElementsClass,
    lunarDate: a.lunarDate,
    chineseDate: a.chineseDate,
    zodiac: a.zodiac,
    timeLabel: `${a.time}（${a.timeRange}）`,
    gender,
    natalMutagens: natal,
  };
}

/** 大限、流年、流日。date 为查看日期，取当日正午避免跨日。 */
export function computeZiweiHoroscope(solarDate: string, timeIndex: number, gender: Gender, date: Date): ZiweiHoroscope {
  const targetDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (solarDate > targetDate) throw new ZiweiHoroscopeError('出生日期不能晚于当前运限日期。');
  const a = buildAstrolabe(solarDate, timeIndex, gender);
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const h = a.horoscope(noon, timeIndex);
  const palaceAt = (index: number, label: string) => {
    if (!Number.isInteger(index) || index < 0 || index >= a.palaces.length || !a.palaces[index]) {
      throw new ZiweiHoroscopeError(`当前日期超出了紫微${label}的可计算范围，请检查出生日期。`);
    }
    return a.palaces[index];
  };
  const decadalPalace = palaceAt(h.decadal.index, '大限');
  palaceAt(h.yearly.index, '流年');
  palaceAt(h.daily.index, '流日');
  if (!Number.isInteger(h.age.index) || h.age.index < 0) {
    throw new ZiweiHoroscopeError('当前日期超出了紫微年龄运限的可计算范围，请检查出生日期。');
  }
  const name = (i: number) => palaceName(palaceAt(i, '运限').name);
  const dec = decadalPalace.decadal?.range;
  if (!dec || dec.length < 2) throw new ZiweiHoroscopeError('紫微大限资料不完整，请检查出生日期。');
  return {
    decadalPalace: name(h.decadal.index),
    decadalRange: [dec[0], dec[1]],
    yearlyPalace: name(h.yearly.index),
    yearlyMutagens: mutagenMap(h.yearly.mutagen),
    dailyPalace: name(h.daily.index),
    dailyMutagens: mutagenMap(h.daily.mutagen),
    nominalAge: h.age.nominalAge,
    decadalIndex: h.decadal.index,
    yearlyIndex: h.yearly.index,
    dailyIndex: h.daily.index,
    ageIndex: h.age.index,
  };
}

/** 返回表单可直接展示的校验错误；合法资料返回 null。 */
export function validateZiweiHoroscope(solarDate: string, timeIndex: number, gender: Gender, date = new Date()): string | null {
  if (solarDate > date.toISOString().slice(0, 10)) return '出生日期不能晚于今天。';
  try {
    computeZiweiHoroscope(solarDate, timeIndex, gender, date);
    return null;
  } catch (error) {
    if (error instanceof ZiweiHoroscopeError) return error.message;
    return '当前紫微运限无法计算这份出生资料，请检查日期和出生时间。';
  }
}

export const soulPalace = (c: ZiweiChart) => c.palaces.find((p) => p.isSoul)!;
export const bodyPalace = (c: ZiweiChart) => c.palaces.find((p) => p.isBody)!;
export const palaceByName = (c: ZiweiChart, n: string) => c.palaces.find((p) => p.name === n);
/** 星曜所在宫位 */
export function palaceOfStar(c: ZiweiChart, star: string): ZiweiPalace | undefined {
  // 借来的主星不算“所在”，只看本宫原有星曜
  return c.palaces.find((p) =>
    (!p.borrowed && p.majorStars.some((s) => s.name === star)) || p.minorStars.some((s) => s.name === star));
}
