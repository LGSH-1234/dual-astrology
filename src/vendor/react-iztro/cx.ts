// classnames 的最小替代，避免新增依赖
type Arg = string | undefined | null | false | Record<string, unknown>;
export default function cx(...args: Arg[]): string {
  const out: string[] = [];
  for (const a of args) {
    if (!a) continue;
    if (typeof a === 'string') out.push(a);
    else for (const [k, v] of Object.entries(a)) if (v) out.push(k);
  }
  return out.join(' ');
}
