// DeepSeek Provider：仅在服务端运行，密钥只从环境变量读取，不返回给前端。
import type { InterpretationProvider, InterpretationRequest, InterpretationResponse } from '../src/lib/types';

const SYSTEM: Record<'ziwei' | 'western', string> = {
  ziwei: '你是一位温和、克制的紫微斗数解读者。只根据用户提供的命盘上下文作答，使用紫微术语（宫位、主星、四化）。',
  western: '你是一位温和、克制的西方占星解读者。只根据用户提供的本命盘和行运上下文作答，使用行星、星座、宫位和相位术语。',
};

const RULES = `规则：
1. 内容定位为娱乐与自我探索，不做命定式断言，不预测死亡、疾病或灾祸。
2. 不提供医疗、法律、投资建议；涉及这些话题时提醒用户咨询专业人士。
3. 回答 150–350 字，简体中文，分 2–4 段。
4. 只输出 JSON：{"answer": string, "themes": string[] (2–4 个短词), "confidence": "low"|"medium"|"high"}。`;

export interface DeepSeekOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class DeepSeekInterpretationProvider implements InterpretationProvider {
  constructor(private opts: DeepSeekOptions) {}

  async interpret(req: InterpretationRequest): Promise<InterpretationResponse> {
    const { apiKey, model = 'deepseek-chat', baseUrl = 'https://api.deepseek.com', timeoutMs = 20000 } = this.opts;
    const f = this.opts.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await f(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: `${SYSTEM[req.mode]}\n${RULES}` },
            { role: 'user', content: JSON.stringify({ question: req.question, context: req.context }) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = data.choices?.[0]?.message?.content;
      if (!raw) throw new Error('DeepSeek 返回为空');
      const parsed = JSON.parse(raw) as Partial<InterpretationResponse>;
      if (typeof parsed.answer !== 'string' || !parsed.answer.trim()) throw new Error('DeepSeek 返回格式错误');
      const conf = parsed.confidence;
      return {
        answer: parsed.answer.trim(),
        themes: Array.isArray(parsed.themes) ? parsed.themes.filter((t) => typeof t === 'string').slice(0, 4) : [],
        confidence: conf === 'low' || conf === 'medium' || conf === 'high' ? conf : 'medium',
        sourceMode: req.mode,
        provider: 'deepseek',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
