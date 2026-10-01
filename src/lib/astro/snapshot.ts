import type { BirthProfile, ChartSnapshot, WesternSummary, ZiweiSummary, ChartSnapshot as Snap } from '../types';
import { resolveBirth } from './time';
import { computeWestern, transits } from './western';
import { computeZiwei, computeZiweiHoroscope, soulPalace, bodyPalace } from './ziwei';
import { ASPECT_INFO, MUTAGEN_TEXT, PLANET_INFO, SIGNS, ZIWEI_STARS, pname, signName } from '../content';

const cache = new Map<string, ChartSnapshot>();

/** 同一份出生资料同时生成两种模式的数据 */
export function buildSnapshot(profileId: string, birth: BirthProfile): ChartSnapshot {
  const key = `${profileId}|${JSON.stringify(birth)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const resolved = resolveBirth(birth);
  const western = computeWestern(resolved.utc, resolved.city.lat, resolved.city.lon, birth.timeKnown);
  const ziwei = computeZiwei(resolved.solarDate, resolved.timeIndex, birth.gender);
  const snap = { profileId, resolved, western, ziwei };
  cache.set(key, snap);
  return snap;
}

export function westernSummary(s: Snap): WesternSummary {
  const w = s.western;
  return {
    kind: 'western',
    sun: signName(w.bigThree.sun),
    moon: signName(w.bigThree.moon),
    rising: w.timeKnown ? signName(w.bigThree.rising) : null,
    placements: w.planets.map((p) => ({ planet: pname(p.key), sign: signName(p.sign), house: w.timeKnown ? p.house : null })),
    aspects: w.aspects.slice(0, 8).map((a) => `${pname(a.a)}${ASPECT_INFO[a.type].name}${pname(a.b)}`),
  };
}

export function ziweiSummary(s: Snap): ZiweiSummary {
  const z = s.ziwei;
  const soul = soulPalace(z);
  return {
    kind: 'ziwei',
    soulPalace: { branch: soul.earthlyBranch, stars: soul.majorStars.map((x) => x.name), borrowed: soul.borrowed },
    bodyPalace: bodyPalace(z).name,
    fiveElements: z.fiveElements,
    palaces: z.palaces.map((p) => ({ name: p.name, stars: p.majorStars.map((x) => x.name + (x.mutagen ? `化${x.mutagen}` : '')) })),
    natalMutagens: z.natalMutagens,
  };
}

export interface DailyReading {
  headline: string;
  body: string;
  influences: { label: string; detail: string }[];
  themes: string[];
}

function dayHash(id: string, date: Date) {
  const str = `${id}${date.getFullYear()}${date.getMonth()}${date.getDate()}`;
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
}

export function westernDaily(s: Snap, date: Date): DailyReading {
  const tr = transits(s.western, date);
  const top = tr[0];
  const influences = tr.slice(0, 4).map((t) => ({
    label: `${PLANET_INFO[t.transiting].glyph} 行运${pname(t.transiting)} ${ASPECT_INFO[t.type].name} 本命${pname(t.natal)}`,
    detail: `${PLANET_INFO[t.transiting].theme}触动你的${PLANET_INFO[t.natal as keyof typeof PLANET_INFO]?.theme ?? ''}，${ASPECT_INFO[t.type].text}。容许度 ${t.orb.toFixed(1)}°`,
  }));
  const sun = SIGNS[s.western.bigThree.sun];
  if (!top) {
    return {
      headline: '一个适合整理的平稳日',
      body: `今天没有紧密的行运相位。作为${sun.name}，你可以把精力放在${sun.trait.split('、')[0]}的事情上，节奏由你决定。`,
      influences, themes: ['整理', '节奏'],
    };
  }
  const tone = ASPECT_INFO[top.type].tone;
  const headlines = tone === 'hard'
    ? ['把摩擦当作信号', '慢一点，反而更快', '先处理最卡的那件事']
    : tone === 'soft'
      ? ['顺水推舟的一天', '适合开口和邀请', '小小的好运在路上']
      : ['力量集中的一天', '专注会被放大', '把注意力放在一处'];
  const h = headlines[dayHash(s.profileId, date) % headlines.length];
  return {
    headline: h,
    body: `行运${pname(top.transiting)}与你的本命${pname(top.natal)}形成${ASPECT_INFO[top.type].name}。${ASPECT_INFO[top.type].text}，和${PLANET_INFO[top.transiting].theme}有关的事今天更明显。你的太阳在${sun.name}，${sun.trait}，用这种方式回应它会更自然。`,
    influences,
    themes: [ASPECT_INFO[top.type].name, PLANET_INFO[top.transiting].theme.split('与')[0]],
  };
}

export function ziweiDaily(s: Snap, date: Date): DailyReading {
  const r = s.resolved;
  const h = computeZiweiHoroscope(r.solarDate, r.timeIndex, s.ziwei.gender, date);
  const daily = s.ziwei.palaces.find((p) => p.name === h.dailyPalace)!;
  const star = daily.majorStars[0]?.name;
  const t = star ? ZIWEI_STARS[star] : undefined;
  const lu = h.dailyMutagens.禄, ji = h.dailyMutagens.忌;
  return {
    headline: t ? `今日${h.dailyPalace}引动${star}：${t.keywords[0]}` : `今日走${h.dailyPalace}`,
    body: `流日落在你的${h.dailyPalace}${daily.borrowed ? '（空宫借对宫）' : ''}。${t ? t.gift + t.advice : '这一宫没有主星，适合观察而不是硬推。'}今日${lu}化禄带来顺手的机会，${ji}化忌提醒你在相关事上多留心。`,
    influences: [
      { label: `大限 · ${h.decadalPalace}`, detail: `${h.decadalRange[0]}–${h.decadalRange[1]} 岁这十年的主题，虚岁 ${h.nominalAge}` },
      { label: `流年 · ${h.yearlyPalace}`, detail: `今年四化：${(['禄', '权', '科', '忌'] as const).map((m) => h.yearlyMutagens[m] + MUTAGEN_TEXT[m].name).join('、')}` },
      { label: `流日 · ${h.dailyPalace}`, detail: `今日化禄 ${lu}，化忌 ${ji}` },
    ],
    themes: [h.dailyPalace.replace('宫', ''), ...(t ? t.keywords.slice(0, 2) : [])],
  };
}
