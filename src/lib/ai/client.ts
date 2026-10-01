// 解读请求客户端：服务异常时提供连续、可理解的演示结果。
import type { InterpretationRequest, InterpretationResponse } from '../types';
import { mockInterpret } from './mock';
import { cloudEndpoint, cloudHeaders, supabase } from '../supabase';

export class InterpretError extends Error {}

export interface ServiceStatus {
  reachable: boolean;
  provider: 'mock' | 'deepseek' | 'local-mock';
  message: string;
}

async function withTimeout(input: string, init: RequestInit = {}, ms = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(input, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

export async function interpret(req: InterpretationRequest): Promise<InterpretationResponse> {
  let res: Response;
  try {
    res = await withTimeout(supabase ? cloudEndpoint('interpret') : '/api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...await cloudHeaders() },
      body: JSON.stringify(req),
    });
  } catch {
    return { ...mockInterpret(req), provider: 'local-mock', notice: '解读服务暂时不可用，已提供演示内容。' };
  }
  if (res.status === 429) throw new InterpretError('提问有点频繁，休息一分钟再问吧。');
  if (res.status === 401 && supabase) throw new InterpretError('登录已过期，请重新登录后提问。');
  if (res.status === 400 || res.status === 413) {
    const j = await res.json().catch(() => ({}));
    throw new InterpretError((j as { error?: string }).error ?? '问题格式有误，请换个说法。');
  }
  if (!res.ok) {
    return { ...mockInterpret(req), provider: 'local-mock', notice: '解读服务暂时不可用，已提供演示内容。' };
  }
  try {
    return (await res.json()) as InterpretationResponse;
  } catch {
    return { ...mockInterpret(req), provider: 'local-mock', notice: '解读服务返回异常，已提供演示内容。' };
  }
}

export async function fetchStatus(): Promise<ServiceStatus> {
  try {
    const res = await withTimeout(supabase ? cloudEndpoint('status') : '/api/status', { headers: await cloudHeaders() }, 5000);
    if (!res.ok) throw new Error();
    const j = await res.json();
    return { reachable: true, provider: j.provider, message: j.message };
  } catch {
    return { reachable: false, provider: 'local-mock', message: '解读功能暂时不可用，稍后可继续尝试。' };
  }
}
