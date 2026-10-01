// Dio delle Stelle 标志：八角星 + 下方轨道弧，星的一角点亮陶土橙。
// 方向参考即梦生成稿 docs/jimeng/logo/logo-A.png（仅作参考），图形由本项目代码重绘。
export function LogoMark({ size = 20, className = '', ink = 'currentColor' }: { size?: number; className?: string; ink?: string }) {
  // 八角星：长芒 4 个（上下左右）+ 短芒 4 个（斜向）
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const r = i % 2 === 1 ? 2.6 : i % 4 === 0 ? 11 : 6.2;
    pts.push(`${(16 + r * Math.cos(a)).toFixed(2)},${(15 + r * Math.sin(a)).toFixed(2)}`);
  }
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <polygon points={pts.join(' ')} fill={ink} />
      {/* 上方长芒点亮 */}
      <polygon points="16,4 17.0,12.6 16,13.2 15.0,12.6" fill="#d97757" />
      <path d="M5 23.5 Q16 31 27 23.5" fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="27" cy="23.5" r="1.6" fill="#d97757" />
    </svg>
  );
}

export const BRAND = { name: 'Dio delle Stelle', zh: '星神' } as const;
