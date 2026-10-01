// 出生地点：省 / 地级市 / 区县三级联动 + 关键字搜索（只含中国）。
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { REGIONS, cityLabel, findCity, regionChain, searchRegions } from '../data/cities';

export function LocationPicker({ id, value, onChange }: { id: string; value: string; onChange: (code: string) => void }) {
  const chain = regionChain(value);
  const [p, c, k] = [chain[0]?.c ?? '', chain[1]?.c ?? '', chain[2]?.c ?? ''];
  const prov = REGIONS.find((x) => x.c === p);
  const city = prov?.d?.find((x) => x.c === c);
  const legacy = value && !chain.length ? findCity(value) : undefined;

  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchRegions(q, 8), [q]);

  const pick = (code: string) => { onChange(code); setQ(''); setOpen(false); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || !hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % hits.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + hits.length) % hits.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(hits[hi].id); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <fieldset className="grid gap-2" data-testid="location-picker">
      <legend className="label">出生地点（中国，选到区县更准）</legend>

      <div className="relative">
        <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input ref={boxRef} id={`${id}-loc-q`} className="input pl-8" placeholder="搜索地名，如“临海”" value={q} autoComplete="off"
          role="combobox" aria-expanded={open && hits.length > 0} aria-controls={`${id}-loc-list`} aria-label="搜索出生地点"
          aria-activedescendant={open && hits[hi] ? `${id}-loc-${hits[hi].id}` : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={onKey} data-testid="loc-search" />
        {open && q.trim() && (
          <ul id={`${id}-loc-list`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-[4px] border border-line bg-paper py-1 shadow-lg">
            {hits.length === 0 && <li className="px-3 py-2 text-xs text-muted">没有找到，可以用下方的选择框逐级选</li>}
            {hits.map((h, i) => (
              <li key={h.id} id={`${id}-loc-${h.id}`} role="option" aria-selected={i === hi}
                onMouseDown={(e) => { e.preventDefault(); pick(h.id); }} onMouseEnter={() => setHi(i)}
                className={`cursor-pointer px-3 py-1.5 text-sm ${i === hi ? 'bg-surface' : ''}`} data-testid="loc-option">
                <span className="font-medium">{h.name}</span>
                <span className="ml-2 text-xs text-muted">{h.path!.slice(0, -1).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <label className="sr-only" htmlFor={`${id}-prov`}>省份</label>
          <select id={`${id}-prov`} className="input" value={p} onChange={(e) => onChange(e.target.value)} data-testid="loc-prov">
            <option value="">选择省份</option>
            {REGIONS.map((x) => <option key={x.c} value={x.c}>{x.n}</option>)}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor={`${id}-city`}>城市</label>
          <select id={`${id}-city`} className="input" value={c} disabled={!prov?.d?.length}
            onChange={(e) => onChange(e.target.value || p)} data-testid="loc-city">
            <option value="">{prov && !prov.d?.length ? '—' : '选择城市 / 区县'}</option>
            {prov?.d?.map((x) => <option key={x.c} value={x.c}>{x.n}</option>)}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor={`${id}-county`}>区县</label>
          <select id={`${id}-county`} className="input" value={k} disabled={!city?.d?.length}
            onChange={(e) => onChange(e.target.value || c)} data-testid="loc-county">
            <option value="">{city?.d?.length ? '不确定区县（按市中心）' : '—'}</option>
            {city?.d?.map((x) => <option key={x.c} value={x.c}>{x.n}</option>)}
          </select>
        </div>
      </div>

      {legacy && !legacy.path && (
        <p className="text-xs text-[#8a2f2a]">原来保存的地点「{cityLabel(legacy)}」已不在可选范围，请重新选择中国境内的出生地点。</p>
      )}
    </fieldset>
  );
}
