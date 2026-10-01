// 服务端入参校验：只接受形状正确、体积有限的请求。
import type { InterpretationRequest, Mutagen } from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown, max = 200) => typeof value === 'string' && value.length <= max;
const isStringArray = (value: unknown, max = 32): value is string[] => Array.isArray(value) && value.length <= max && value.every((x) => isString(x));
const isFiniteNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

const MUTAGENS: Mutagen[] = ['禄', '权', '科', '忌'];

export function validateChartSummary(summary: unknown, mode: 'ziwei' | 'western'): string | null {
  if (!isRecord(summary)) return '缺少命盘上下文';
  if (summary.kind !== mode) return '命盘上下文与模式不一致';
  if (mode === 'western') {
    if (!isString(summary.sun, 40) || !isString(summary.moon, 40)) return '西方星盘缺少太阳或月亮';
    if (summary.rising !== null && !isString(summary.rising, 40)) return '西方星盘 rising 无效';
    if (!Array.isArray(summary.placements) || summary.placements.length === 0 || summary.placements.length > 20) return '西方星盘 placements 无效';
    if (!summary.placements.every((item) => isRecord(item) && isString(item.planet, 40) && isString(item.sign, 40) && (item.house === null || (Number.isInteger(item.house) && Number(item.house) >= 1 && Number(item.house) <= 12)))) return '西方星盘 placements 无效';
    if (!isStringArray(summary.aspects, 32)) return '西方星盘 aspects 无效';
    return null;
  }

  const soul = summary.soulPalace;
  if (!isRecord(soul) || !isString(soul.branch, 40) || !isStringArray(soul.stars, 20) || typeof soul.borrowed !== 'boolean') return '紫微命盘 soulPalace 无效';
  if (!isString(summary.bodyPalace, 40) || !isString(summary.fiveElements, 80)) return '紫微命盘基础字段无效';
  if (!Array.isArray(summary.palaces) || summary.palaces.length !== 12 || !summary.palaces.every((item) => isRecord(item) && isString(item.name, 40) && isStringArray(item.stars, 20))) return '紫微命盘 palaces 无效';
  const natalMutagens = summary.natalMutagens;
  if (!isRecord(natalMutagens) || !MUTAGENS.every((key) => isString(natalMutagens[key], 40))) return '紫微命盘 natalMutagens 无效';
  return null;
}

export function validateRequest(body: unknown): { ok: true; value: InterpretationRequest } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: '请求体必须是 JSON 对象' };
  const b = body;
  if (b.mode !== 'ziwei' && b.mode !== 'western') return { ok: false, error: 'mode 必须是 ziwei 或 western' };
  const mode = b.mode;
  if (typeof b.question !== 'string' || !b.question.trim()) return { ok: false, error: '问题不能为空' };
  if (b.question.length > 500) return { ok: false, error: '问题请控制在 500 字以内' };
  if (typeof b.profileId !== 'string' || !b.profileId.trim() || b.profileId.length > 64) return { ok: false, error: 'profileId 无效' };
  if (!isRecord(b.context)) return { ok: false, error: '缺少命盘上下文' };
  const context = b.context;
  const summaryError = validateChartSummary(context.chartSummary, mode);
  if (summaryError) return { ok: false, error: summaryError };
  if (context.name !== undefined && !isString(context.name, 100)) return { ok: false, error: 'context.name 无效' };
  if (context.currentTransits !== undefined && !isStringArray(context.currentTransits, 20)) return { ok: false, error: 'currentTransits 必须是字符串数组' };
  if (context.relationship !== undefined) {
    const relationship = context.relationship;
    const score = isRecord(relationship) ? relationship.score : undefined;
    if (!isRecord(relationship) || !isString(relationship.friendName, 100) || !isFiniteNumber(score) || (score as number) < 0 || (score as number) > 100 || !isString(relationship.summary, 500) || !isStringArray(relationship.themes, 20)) {
      return { ok: false, error: 'relationship 无效' };
    }
  }
  return { ok: true, value: { ...b, mode, question: b.question.trim(), profileId: b.profileId.trim(), context } as unknown as InterpretationRequest };
}
