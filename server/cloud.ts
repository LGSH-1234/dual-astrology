import type { InterpretationProvider } from '../src/lib/types';
import { mockInterpret } from '../src/lib/ai/mock';
import { validateRequest } from '../src/lib/ai/validate';

export interface CloudDependencies {
  allowedOrigins: string[];
  publishableKey: string;
  authenticate: (token: string) => Promise<string | null>;
  takeQuota: (subject: string) => Promise<boolean>;
  ai: InterpretationProvider | null;
}

export function cloudHandler(deps: CloudDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    if (origin && deps.allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !deps.allowedOrigins.includes(origin)) return json({ error: '无法从此页面访问解读服务。' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    try {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      let userId: string | null = null;
      if (token) {
        userId = await deps.authenticate(token);
        if (!userId) return json({ error: '登录已过期，请重新登录。' }, 401);
      } else if (request.headers.get('apikey') !== deps.publishableKey) {
        return json({ error: '请从应用页面访问解读服务。' }, 401);
      }

      const action = new URL(request.url).pathname.split('/').pop();
      if (action === 'status' && request.method === 'GET') return json({
        provider: deps.ai ? 'deepseek' : 'mock', message: deps.ai ? '解读功能已就绪。' : '当前使用演示解读。',
      });
      if (action !== 'interpret') return json({ error: '页面不存在。' }, 404);
      if (request.method !== 'POST') return json({ error: '请求方式有误。' }, 405);
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: '问题格式有误。' }, 415);
      if (Number(request.headers.get('content-length') ?? 0) > 16384) return json({ error: '问题内容过长。' }, 413);
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 16384) return json({ error: '问题内容过长。' }, 413);
      let body: unknown;
      try { body = JSON.parse(text); } catch { return json({ error: '问题格式有误。' }, 400); }
      const validation = validateRequest(body);
      if (!validation.ok) return json({ error: validation.error }, 400);
      // Persisted, atomic quota protects paid calls across all function instances.
      if (!await deps.takeQuota(userId ?? 'guest')) return json({ error: '提问较频繁，请稍后再试。' }, 429);
      if (deps.ai && userId) {
        try { return json(await deps.ai.interpret(validation.value)); }
        catch { return json({ ...mockInterpret(validation.value), notice: 'AI 解读暂时不可用，已提供演示内容。' }); }
      }
      return json({ ...mockInterpret(validation.value), ...(deps.ai ? { notice: '登录后可使用 AI 解读，当前为演示解读。' } : {}) });
    } catch {
      return json({ error: '解读服务暂时不可用，请稍后再试。' }, 503);
    }
  };
}
