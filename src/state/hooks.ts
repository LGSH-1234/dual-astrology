import { useEffect, useMemo, useState } from 'react';
import { useStore } from './store';
import { buildSnapshot } from '../lib/astro/snapshot';
import { resolveBirth } from '../lib/astro/time';
import { validateZiweiHoroscope } from '../lib/astro/ziwei';
import type { AstrologyMode, BirthProfile, ChartSnapshot } from '../lib/types';

export type Route = 'onboarding' | 'home' | 'chart' | 'compat' | 'ask' | 'profile' | 'login' | 'register' | 'forgot' | 'reset';
const ROUTES: Route[] = ['onboarding', 'home', 'chart', 'compat', 'ask', 'profile', 'login', 'register', 'forgot', 'reset'];

function parse(): { route: Route; params: URLSearchParams } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, q = ''] = raw.split('?');
  const route = (ROUTES as string[]).includes(path) ? (path as Route) : 'home';
  return { route, params: new URLSearchParams(q) };
}

export function useHashRoute() {
  const [loc, setLoc] = useState(parse);
  useEffect(() => {
    const on = () => setLoc(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return loc;
}

export function navigate(route: Route, params?: Record<string, string>) {
  const q = params ? `?${new URLSearchParams(params).toString()}` : '';
  window.location.hash = `#/${route}${q}`;
}

/** 当前用户的命盘快照（两种模式的数据一次算好） */
export function useMySnapshot(): ChartSnapshot | null {
  const { state } = useStore();
  const u = state.user;
  return useMemo(() => (u ? safeSnapshot(u.id, u.birth) : null), [u]);
}

export function safeSnapshot(id: string, birth: BirthProfile): ChartSnapshot | null {
  try {
    const resolved = resolveBirth(birth);
    const horoscopeError = validateZiweiHoroscope(resolved.solarDate, resolved.timeIndex, birth.gender);
    if (horoscopeError) throw new Error(horoscopeError);
    return buildSnapshot(id, birth);
  } catch (e) {
    console.error('排盘失败', e);
    return null;
  }
}

export const TERMS: Record<AstrologyMode, {
  label: string; short: string; chart: string; ask: string; askHint: string; compat: string; today: string; influences: string;
}> = {
  ziwei: {
    label: '中华玄学', short: '紫微', chart: '紫微命盘', ask: '问紫微', askHint: '以命宫、十二宫和四化为依据',
    compat: '紫微关系分析', today: '今日流日', influences: '当前运限与四化',
  },
  western: {
    label: '西方占星', short: '星盘', chart: '本命星盘', ask: '问星星', askHint: '以本命盘、宫位、相位和行运为依据',
    compat: '西方合盘', today: '今日行运', influences: '当前行星影响',
  },
};
