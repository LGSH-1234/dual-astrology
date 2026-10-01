// Mock Provider：不联网、确定性输出，按问题主题挑选命盘因子拼接回答。
// 服务端和浏览器共用这一份实现。
import type {
  InterpretationProvider, InterpretationRequest, InterpretationResponse, WesternSummary, ZiweiSummary,
} from '../types';
import { ZIWEI_STARS, MUTAGEN_TEXT, SIGNS } from '../content';
import { validateChartSummary } from './validate';

type Topic = 'love' | 'career' | 'money' | 'self' | 'energy' | 'timing' | 'relationship' | 'general';

const TOPIC_RULES: [Topic, RegExp][] = [
  ['relationship', /朋友|关系|合盘|相处|他|她|对方|同事/],
  ['love', /爱|恋|感情|桃花|伴侣|婚|对象|喜欢|分手|复合/],
  ['career', /工作|事业|职业|跳槽|老板|升职|面试|创业|项目|offer/i],
  ['money', /钱|财|投资|收入|存款|副业|理财/],
  ['energy', /累|焦虑|压力|睡|健康|情绪|疲惫|休息/],
  ['timing', /今天|明天|本周|这周|今年|最近|什么时候|时机/],
  ['self', /我是|性格|天赋|优点|缺点|自己|适合/],
];

export function detectTopic(q: string): Topic {
  return TOPIC_RULES.find(([, re]) => re.test(q))?.[0] ?? 'general';
}

const TOPIC_LABEL: Record<Topic, string> = {
  love: '感情', career: '事业', money: '财务', self: '自我', energy: '状态', timing: '时机', relationship: '关系', general: '整体',
};

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
}

const signTrait = (name: string) => SIGNS.find((s) => s.name === name)?.trait ?? '';

function westernAnswer(q: string, topic: Topic, s: WesternSummary, req: InterpretationRequest): string[] {
  const find = (p: string) => s.placements.find((x) => x.planet === p);
  const place = (p: string) => {
    const x = find(p);
    return x ? `${p}在${x.sign}${x.house ? `第 ${x.house} 宫` : ''}` : p;
  };
  const lines: string[] = [];
  const opening = `你问的是“${q}”。从你的本命盘看，太阳${s.sun}、月亮${s.moon}${s.rising ? `、上升${s.rising}` : ''}。`;
  lines.push(opening);
  switch (topic) {
    case 'love':
      lines.push(`${place('金星')}，说明你在关系里看重${signTrait(find('金星')?.sign ?? '')}的感觉；${place('月亮')}则描述你需要怎样的安全感。`);
      lines.push('与其等对方猜中你的需要，不如用一句具体的话说出来。');
      break;
    case 'career':
      lines.push(`${place('土星')}提示你的长期功课，${place('火星')}说明你推进事情的方式偏向“${signTrait(find('火星')?.sign ?? '').split('、')[0]}”。`);
      lines.push('适合先选一个能在三个月内看到结果的目标，用结果来校准方向。');
      break;
    case 'money':
      lines.push(`${place('金星')}和${place('木星')}一起描述你的价值感和机会来源。木星所在的领域，往往是你更容易“遇到好事”的地方。`);
      lines.push('涉及具体投资时请以实际信息为准，星盘只能帮你看清自己的习惯和偏好。');
      break;
    case 'energy':
      lines.push(`月亮${s.moon}的人，情绪恢复通常需要“${signTrait(s.moon).split('、').slice(-1)[0]}”的环境。${place('土星')}提醒你别把所有责任都揽在自己身上。`);
      lines.push('今天给自己留一段不被打扰的时间。如果低落持续很久，和信任的人或专业人士聊聊会更有帮助。');
      break;
    case 'timing': {
      const t = req.context.currentTransits?.slice(0, 2).join('；');
      lines.push(t ? `当前的行运：${t}。` : '当前没有特别紧密的行运相位，节奏可以由你自己掌握。');
      lines.push('行运描述的是“天气”，不是结果。适合顺着它安排事情的先后，而不是等待它替你决定。');
      break;
    }
    case 'relationship': {
      const r = req.context.relationship;
      lines.push(r ? `你和${r.friendName}的合盘得分 ${r.score}：${r.summary}` : `${place('水星')}说明你的沟通习惯，这是理解任何关系的起点。`);
      lines.push(`你的${place('水星')}，意味着你更习惯“${signTrait(find('水星')?.sign ?? '').split('、')[0]}”的表达方式，先确认对方是否接收到你的本意。`);
      break;
    }
    default:
      lines.push(`太阳${s.sun}给你${signTrait(s.sun)}的底色，月亮${s.moon}让你在私下更${signTrait(s.moon).split('、')[0]}。`);
      if (s.aspects[0]) lines.push(`盘中最紧密的相位是${s.aspects[0]}，它是你性格里最显眼的一股张力。`);
  }
  return lines;
}

function ziweiAnswer(q: string, topic: Topic, s: ZiweiSummary, req: InterpretationRequest): string[] {
  const p = (name: string) => s.palaces.find((x) => x.name === name);
  const starsOf = (name: string) => {
    const x = p(name);
    return x && x.stars.length ? x.stars.join('、') : '无主星';
  };
  const main = s.soulPalace.stars[0]?.replace(/化./, '');
  const trait = main ? ZIWEI_STARS[main] : undefined;
  const lines: string[] = [];
  lines.push(`你问的是“${q}”。你的命宫在${s.soulPalace.branch}，坐${s.soulPalace.stars.join('、') || '空宫'}${s.soulPalace.borrowed ? '（借对宫）' : ''}，${s.fiveElements}。`);
  const focus: Record<Topic, string> = {
    love: '夫妻宫', career: '官禄宫', money: '财帛宫', energy: '疾厄宫', self: '命宫', timing: '迁移宫', relationship: '仆役宫', general: '福德宫',
  };
  const target = focus[topic];
  const targetMain = p(target)?.stars[0]?.replace(/化./, '');
  const tt = targetMain ? ZIWEI_STARS[targetMain] : undefined;
  lines.push(`这个问题主要看${target}，宫内是${starsOf(target)}。${tt ? tt.gift + '需要留意的是：' + tt.shadow : '空宫的人在这方面更受环境影响，适合多观察再决定。'}`);
  if (topic === 'relationship' && req.context.relationship) {
    lines.push(`你和${req.context.relationship.friendName}的紫微合参得分 ${req.context.relationship.score}：${req.context.relationship.summary}`);
  }
  const ji = s.natalMutagens.忌, lu = s.natalMutagens.禄;
  lines.push(`本命${lu}${MUTAGEN_TEXT.禄.name}是你的顺手之处，${ji}${MUTAGEN_TEXT.忌.name}是你一生反复练习的课题。`);
  if (topic === 'money') lines.push('具体的财务决定请以真实数据为准，命盘只用来看清你的金钱习惯。');
  else if (topic === 'energy') lines.push('身体上的不适请交给医生判断，这里只谈节奏和压力出口。');
  else lines.push(trait ? `建议：${trait.advice}` : '建议：先做一件小事，看环境怎样回应你。');
  return lines;
}

export function mockInterpret(req: InterpretationRequest): InterpretationResponse {
  const summaryError = validateChartSummary(req?.context?.chartSummary, req?.mode);
  if (summaryError) {
    return {
      answer: '命盘摘要不完整，暂时无法生成解读。请重新计算命盘后再试。',
      themes: ['数据校验'],
      confidence: 'low',
      sourceMode: req?.mode === 'western' ? 'western' : 'ziwei',
      provider: 'mock',
    };
  }
  const topic = detectTopic(req.question);
  const s = req.context.chartSummary;
  const lines = s.kind === 'western' ? westernAnswer(req.question, topic, s, req) : ziweiAnswer(req.question, topic, s, req);
  const closers = ['以上是基于命盘结构的解读，仅供娱乐和自我观察。', '把它当作一面镜子，而不是一份判决书。', '命盘描述倾向，选择始终在你手里。'];
  lines.push(closers[hash(req.question + req.profileId) % closers.length]);

  const timeKnown = s.kind === 'western' ? s.rising !== null : true;
  const themes = [TOPIC_LABEL[topic]];
  if (s.kind === 'western') themes.push(`太阳${s.sun}`, `月亮${s.moon}`);
  else themes.push(s.soulPalace.stars[0] ?? '空宫', s.fiveElements);

  return {
    answer: lines.join('\n\n'),
    themes,
    confidence: !timeKnown ? 'low' : topic === 'general' ? 'medium' : 'high',
    sourceMode: req.mode,
    provider: 'mock',
  };
}

export class MockInterpretationProvider implements InterpretationProvider {
  async interpret(req: InterpretationRequest) {
    return mockInterpret(req);
  }
}
