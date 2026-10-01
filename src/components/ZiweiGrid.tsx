import type { ReactNode } from 'react';
import type { ZiweiChart, ZiweiHoroscope, ZiweiPalace, ZiweiStar } from '../lib/types';
import { MUTAGEN_STYLE } from './ui';

// 传统排法：地支固定位置，中间 2×2 为盘心（布局参考 react-iztro，MIT）
const POS: Record<string, [number, number]> = {
  巳: [1, 1], 午: [1, 2], 未: [1, 3], 申: [1, 4],
  辰: [2, 1], 酉: [2, 4],
  卯: [3, 1], 戌: [3, 4],
  寅: [4, 1], 丑: [4, 2], 子: [4, 3], 亥: [4, 4],
};

// 三方四正连线在盘心边框上的落点（盘心坐标 0–100）
const EDGE: Record<string, [number, number]> = {
  寅: [0, 100], 卯: [0, 75], 辰: [0, 25], 巳: [0, 0], 午: [25, 0], 未: [75, 0],
  申: [100, 0], 酉: [100, 25], 戌: [100, 75], 亥: [100, 100], 子: [75, 100], 丑: [25, 100],
};

const fix = (i: number) => ((i % 12) + 12) % 12;

function Star({ s, tone }: { s: ZiweiStar; tone: string }) {
  return (
    <span className={`block whitespace-nowrap leading-[1.35] ${tone}`}>
      {s.name}
      {s.brightness && <i className="ml-px not-italic text-[0.85em] font-normal text-muted opacity-70">{s.brightness}</i>}
      {s.mutagen && <span className={`ml-px rounded-[3px] px-[2px] text-[0.85em] font-normal ${MUTAGEN_STYLE[s.mutagen]}`}>{s.mutagen}</span>}
    </span>
  );
}

type Tag = { label: string; cls: string };

function Cell({ p, state, tags, onSelect }: { p: ZiweiPalace; state: 'selected' | 'related' | 'none'; tags: Tag[]; onSelect: (i: number) => void }) {
  const [row, col] = POS[p.earthlyBranch];
  const label = `${p.name}，${p.heavenlyStem}${p.earthlyBranch}，主星${p.majorStars.map((s) => s.name).join('、') || '无'}${p.borrowed ? '（借对宫）' : ''}${p.isBody ? '，身宫' : ''}`;
  const bg = state === 'selected' ? 'bg-mode-soft' : state === 'related' ? 'bg-surface' : 'bg-paper hover:bg-surface/60';
  return (
    <button
      type="button"
      onClick={() => onSelect(p.index)}
      aria-pressed={state === 'selected'}
      aria-label={label}
      style={{ gridRow: row, gridColumn: col }}
      className={`grid min-h-[104px] min-w-0 grid-rows-[1fr_auto_auto] overflow-hidden border border-line p-[3px] text-left text-[11px] transition-colors sm:min-h-[150px] sm:text-[12px] ${bg}`}
      data-testid="ziwei-cell"
    >
      {/* 上：主星 | 辅星 | 杂曜 */}
      <div className="flex min-w-0 items-start justify-between gap-1">
        <div className="min-w-0 font-semibold sm:text-[13px]">
          {p.majorStars.map((s) => <Star key={s.name} s={s} tone={p.borrowed ? 'text-muted' : 'text-mode'} />)}
          {p.majorStars.length === 0 && <span className="font-normal text-muted">空宫</span>}
        </div>
        <div className="hidden min-w-0 sm:block">
          {p.minorStars.map((s) => <Star key={s.name} s={s} tone="text-ink" />)}
        </div>
        <div className="hidden shrink-0 text-right text-muted lg:block">
          {p.adjectiveStars.slice(0, 5).map((s) => <span key={s.name} className="block leading-[1.35]">{s.name}</span>)}
        </div>
      </div>
      {/* 中：运限标记 */}
      <div className="flex h-[16px] justify-center gap-[3px]">
        {tags.map((t) => <span key={t.label} className={`rounded-[3px] px-[3px] text-[10px] leading-[16px] ${t.cls}`}>{t.label}</span>)}
      </div>
      {/* 下：长生博士+宫名 | 小限+大限 | 岁前将前+干支 */}
      <div className="grid grid-cols-[auto_1fr_auto] items-end gap-x-1">
        <div className="min-w-0">
          <span className="hidden text-[11px] leading-tight text-[#7a7a52] sm:block">{p.changsheng12}<br />{p.boshi12}</span>
          <span className={`block whitespace-nowrap font-semibold sm:text-[13px] ${p.isSoul ? 'text-accent-ink' : 'text-mode'}`}>
            {p.name.replace(/宫$/, '')}
            {p.isBody && <span className="ml-px rounded-[3px] bg-ink px-[2px] text-[10px] font-normal text-paper">身</span>}
          </span>
        </div>
        <div className="min-w-0 text-center text-muted">
          <span className="hidden truncate text-[10px] sm:block">{p.ages.slice(0, 5).join(' ')}</span>
          <span className="block whitespace-nowrap text-[10px] font-semibold sm:text-[11px]">{p.decadal[0]}-{p.decadal[1]}</span>
        </div>
        <div className="text-right">
          <span className="hidden text-[11px] leading-tight text-[#7d4a5c] sm:block">{p.suiqian12}<br />{p.jiangqian12}</span>
          <span className="block whitespace-nowrap font-semibold text-[#4d6b3c] sm:text-[13px]">{p.heavenlyStem}{p.earthlyBranch}</span>
        </div>
      </div>
    </button>
  );
}

export function ZiweiGrid({ chart, selected, onSelect, center, horoscope }: {
  chart: ZiweiChart; selected: number; onSelect: (i: number) => void; center: ReactNode; horoscope?: ZiweiHoroscope;
}) {
  const related = new Set([fix(selected + 4), fix(selected - 4), fix(selected + 6)]);
  const tagsOf = (i: number): Tag[] => {
    if (!horoscope) return [];
    const t: Tag[] = [];
    if (horoscope.decadalIndex === i) t.push({ label: '大限', cls: 'bg-mode text-paper' });
    if (horoscope.yearlyIndex === i) t.push({ label: '流年', cls: 'bg-accent text-ink' });
    if (horoscope.dailyIndex === i) t.push({ label: '流日', cls: 'border border-line bg-paper text-muted' });
    if (horoscope.ageIndex === i && t.length < 3) t.push({ label: '小限', cls: 'text-muted' });
    return t;
  };
  const sel = chart.palaces[selected];
  const pt = (i: number) => EDGE[chart.palaces[fix(i)].earthlyBranch];
  const [a, b, c, d] = [pt(selected), pt(selected + 6), pt(selected + 4), pt(selected - 4)];

  return (
    <div className="grid grid-cols-4 grid-rows-4 gap-[3px]" role="group" aria-label="紫微十二宫命盘" data-testid="ziwei-grid">
      {chart.palaces.map((p) => (
        <Cell key={p.index} p={p} tags={tagsOf(p.index)} onSelect={onSelect}
          state={p.index === selected ? 'selected' : related.has(p.index) ? 'related' : 'none'} />
      ))}
      <div style={{ gridRow: '2 / 4', gridColumn: '2 / 4' }} className="relative min-w-0 border border-line bg-paper">
        {/* 三方四正：本宫连对宫、三合两宫 */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
          <path d={`M${b[0]} ${b[1]} L${a[0]} ${a[1]} L${c[0]} ${c[1]} L${d[0]} ${d[1]} L${a[0]} ${a[1]}`} fill="none" stroke="var(--accent)" strokeOpacity=".55" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="relative h-full" aria-label={`当前选中${sel.name}`}>{center}</div>
      </div>
    </div>
  );
}
