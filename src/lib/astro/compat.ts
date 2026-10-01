// 关系兼容性：两套可解释的规则，每条规则产出“优势 / 冲突 / 沟通”条目和权重。
import type { ChartSnapshot, CompatibilityItem, CompatibilityReport, PlanetKey } from '../types';
import { findAspect } from './western';
import { soulPalace, palaceByName } from './ziwei';
import { ASPECT_INFO, GROUP_STYLE, MUTAGEN_TEXT, SIGNS, STAR_GROUP, pname } from '../content';

const clamp = (n: number) => Math.max(5, Math.min(98, Math.round(n)));

// ---------- 西方合盘 ----------
const SYN_PAIRS: [PlanetKey | 'ASC', PlanetKey | 'ASC', string][] = [
  ['Sun', 'Moon', '核心认同'], ['Moon', 'Sun', '核心认同'], ['Moon', 'Moon', '情绪节奏'],
  ['Venus', 'Mars', '吸引力'], ['Mars', 'Venus', '吸引力'], ['Venus', 'Venus', '审美与价值'],
  ['Mercury', 'Mercury', '沟通方式'], ['Sun', 'Sun', '人生方向'], ['Saturn', 'Sun', '责任与压力'],
  ['Sun', 'Saturn', '责任与压力'], ['Sun', 'ASC', '第一印象'], ['ASC', 'Sun', '第一印象'],
];

const ELEMENT_FIT: Record<string, number> = {
  '火火': 1, '土土': 1, '风风': 1, '水水': 1, '火风': 1, '风火': 1, '土水': 1, '水土': 1,
  '火土': -0.5, '土火': -0.5, '风水': -0.5, '水风': -0.5, '火水': -1, '水火': -1, '土风': -0.5, '风土': -0.5,
};

function lonOf(s: ChartSnapshot, k: PlanetKey | 'ASC'): number | null {
  if (k === 'ASC') return s.western.timeKnown ? s.western.ascendant : null;
  return s.western.planets.find((p) => p.key === k)!.lon;
}

export function westernCompat(a: ChartSnapshot, b: ChartSnapshot, aName: string, bName: string): CompatibilityReport {
  const strengths: CompatibilityItem[] = [];
  const conflicts: CompatibilityItem[] = [];
  const communication: CompatibilityItem[] = [];
  let score = 55;

  for (const [pa, pb, topic] of SYN_PAIRS) {
    const la = lonOf(a, pa), lb = lonOf(b, pb);
    if (la === null || lb === null) continue;
    const hit = findAspect(la, lb, 0.75);
    if (!hit) continue;
    const info = ASPECT_INFO[hit.type];
    const tight = 1 - hit.orb / 6;
    const benefic = pa === 'Venus' || pb === 'Venus' || pa === 'Moon' || pb === 'Moon';
    const soft = info.tone === 'soft' || (info.tone === 'neutral' && benefic && pa !== 'Saturn' && pb !== 'Saturn');
    const title = `${aName}的${pname(pa)} ${info.name} ${bName}的${pname(pb)}`;
    const item = { title, detail: `${topic}：${info.text}。`, weight: Math.round(tight * 10) };
    if (topic === '沟通方式') communication.push(item);
    else if (soft) { strengths.push(item); score += 6 * tight; }
    else { conflicts.push(item); score -= 5 * tight; }
  }

  // 日月元素
  for (const [x, y, label] of [['sun', 'sun', '太阳'], ['moon', 'moon', '月亮']] as const) {
    const ea = SIGNS[a.western.bigThree[x]].element, eb = SIGNS[b.western.bigThree[y]].element;
    const fit = ELEMENT_FIT[ea + eb] ?? 0;
    score += fit * 4;
    const item = { title: `${label}元素：${ea}象 × ${eb}象`, detail: fit > 0 ? '底层气质相通，容易理解对方。' : '底色不同，需要翻译彼此的表达。', weight: 4 };
    (fit > 0 ? strengths : conflicts).push(item);
  }

  const ma = SIGNS[a.western.planets[2].sign], mb = SIGNS[b.western.planets[2].sign];
  communication.push({
    title: `水星：${ma.name} × ${mb.name}`,
    detail: ma.element === mb.element
      ? '思路相近，容易接住对方的话。'
      : `${aName}倾向“${ma.trait.split('、')[0]}”，${bName}倾向“${mb.trait.split('、')[0]}”。说清楚意图比说得漂亮更重要。`,
    weight: 5,
  });

  const final = clamp(score);
  return {
    mode: 'western', aId: a.profileId, bId: b.profileId, score: final,
    summary: final >= 70 ? '默契感明显，多数时候能自然配合。' : final >= 50 ? '有吸引也有摩擦，适合在沟通中慢慢磨合。' : '差异较大，彼此能学到很多，但需要更多耐心。',
    strengths: strengths.sort((x, y) => y.weight - x.weight).slice(0, 4),
    conflicts: conflicts.sort((x, y) => y.weight - x.weight).slice(0, 4),
    communication,
    themes: ['合盘', final >= 60 ? '默契' : '磨合', strengths[0] ? '吸引' : '成长'],
  };
}

// ---------- 紫微关系分析 ----------
const LIUHE: Record<string, string> = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' };
const SANHE = ['申子辰', '亥卯未', '寅午戌', '巳酉丑'];
const CHONG: Record<string, string> = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };

function branchRelation(x: string, y: string): '六合' | '三合' | '六冲' | '同宫' | null {
  if (x === y) return '同宫';
  if (LIUHE[x] === y) return '六合';
  if (CHONG[x] === y) return '六冲';
  if (SANHE.some((g) => g.includes(x) && g.includes(y))) return '三合';
  return null;
}

const yearBranch = (s: ChartSnapshot) => s.ziwei.chineseDate.split(' ')[0]?.[1] ?? '';

export function ziweiCompat(a: ChartSnapshot, b: ChartSnapshot, aName: string, bName: string): CompatibilityReport {
  const strengths: CompatibilityItem[] = [];
  const conflicts: CompatibilityItem[] = [];
  const communication: CompatibilityItem[] = [];
  let score = 55;
  const sa = soulPalace(a.ziwei), sb = soulPalace(b.ziwei);
  const starsA = sa.majorStars.map((s) => s.name), starsB = sb.majorStars.map((s) => s.name);

  // 规则 1：命宫主星组别
  const ga = STAR_GROUP[starsA[0]], gb = STAR_GROUP[starsB[0]];
  if (ga && gb) {
    const item = { title: `命宫星系：${ga} × ${gb}`, detail: ga === gb ? `同属${GROUP_STYLE[ga]}，节奏接近。` : `${aName}偏${GROUP_STYLE[ga]}，${bName}偏${GROUP_STYLE[gb]}。`, weight: 6 };
    if (ga === gb || (ga === '紫府廉武相' && gb === '机月同梁') || (gb === '紫府廉武相' && ga === '机月同梁')) { strengths.push(item); score += 7; }
    else if ((ga === '杀破狼' && gb === '机月同梁') || (gb === '杀破狼' && ga === '机月同梁')) { conflicts.push(item); score -= 6; }
    else communication.push(item);
  }

  // 规则 2：夫妻宫映照对方命宫
  for (const [x, y, xn, yn] of [[a, b, aName, bName], [b, a, bName, aName]] as const) {
    const spouse = palaceByName(x.ziwei, '夫妻宫')!.majorStars.map((s) => s.name);
    const other = soulPalace(y.ziwei).majorStars.map((s) => s.name);
    const overlap = spouse.filter((s) => other.includes(s));
    if (overlap.length) {
      strengths.push({ title: `${xn}的夫妻宫与${yn}的命宫同见${overlap.join('、')}`, detail: `${yn}的气质接近${xn}心中理想伴侣的样子。`, weight: 8 });
      score += 8;
    }
  }

  // 规则 3：四化交叉——我的禄/忌星落在你的命宫
  for (const [x, y, xn, yn] of [[a, b, aName, bName], [b, a, bName, aName]] as const) {
    const ySoul = soulPalace(y.ziwei);
    const yStars = [...ySoul.majorStars, ...ySoul.minorStars].map((s) => s.name);
    for (const m of ['禄', '忌'] as const) {
      const star = x.ziwei.natalMutagens[m];
      if (star && yStars.includes(star)) {
        const item = { title: `${xn}的${star}${MUTAGEN_TEXT[m].name}入${yn}命宫`, detail: m === '禄' ? `${xn}容易给${yn}带来资源和好心情。` : `${xn}的执念容易投射到${yn}身上，需要留出空间。`, weight: 7 };
        if (m === '禄') { strengths.push(item); score += 7; } else { conflicts.push(item); score -= 6; }
      }
    }
  }

  // 规则 4：命宫地支关系
  const rel = branchRelation(sa.earthlyBranch, sb.earthlyBranch);
  if (rel) {
    const item = { title: `命宫地支 ${sa.earthlyBranch} × ${sb.earthlyBranch}：${rel}`, detail: rel === '六冲' ? '彼此的出发点正好相对，容易争论，也容易互补。' : rel === '同宫' ? '看世界的角度很像，默契高但也容易一起钻牛角尖。' : '天然相合，相处有默契。', weight: 6 };
    if (rel === '六冲') { conflicts.push(item); score -= 5; } else { strengths.push(item); score += rel === '六合' ? 7 : 5; }
  }

  // 规则 5：生年地支（生肖）
  const ya = yearBranch(a), yb = yearBranch(b);
  const yrel = ya && yb ? branchRelation(ya, yb) : null;
  if (yrel === '六合' || yrel === '三合') { strengths.push({ title: `生年 ${ya} × ${yb}：${yrel}`, detail: '生活习惯和价值观容易对上。', weight: 4 }); score += 4; }
  if (yrel === '六冲') { conflicts.push({ title: `生年 ${ya} × ${yb}：六冲`, detail: '日常节奏不同，需要约定规则。', weight: 4 }); score -= 4; }

  // 规则 6：沟通看兄弟宫与巨门、天机、文昌文曲
  const talk = (s: ChartSnapshot) => {
    const p = soulPalace(s.ziwei);
    const names = [...p.majorStars, ...p.minorStars].map((x) => x.name);
    if (names.includes('巨门')) return '直说型，重逻辑和是非';
    if (names.includes('天机')) return '分析型，喜欢讨论方案';
    if (names.some((n) => n === '文昌' || n === '文曲')) return '表达型，措辞讲究';
    if (names.includes('七杀') || names.includes('破军')) return '行动型，先做后说';
    return '观察型，先感受气氛再开口';
  };
  communication.push({ title: '沟通风格', detail: `${aName}：${talk(a)}；${bName}：${talk(b)}。`, weight: 5 });
  const lua = a.ziwei.natalMutagens.禄, lub = b.ziwei.natalMutagens.禄;
  communication.push({ title: '彼此的“禄”', detail: `${aName}在${lua}相关的事上最放松，${bName}在${lub}相关的事上最放松，聊这些话题更容易打开。`, weight: 3 });

  const final = clamp(score);
  return {
    mode: 'ziwei', aId: a.profileId, bId: b.profileId, score: final,
    summary: final >= 70 ? '命盘相合处多，缘分感强。' : final >= 50 ? '有相合也有相冲，关系需要经营。' : '课题较多，适合作为互相成长的关系。',
    strengths: strengths.sort((x, y) => y.weight - x.weight).slice(0, 4),
    conflicts: conflicts.sort((x, y) => y.weight - x.weight).slice(0, 4),
    communication,
    themes: ['紫微合参', rel ?? '星系', final >= 60 ? '相合' : '磨合'],
  };
}

export function compatibility(mode: 'ziwei' | 'western', a: ChartSnapshot, b: ChartSnapshot, aName: string, bName: string) {
  return mode === 'ziwei' ? ziweiCompat(a, b, aName, bName) : westernCompat(a, b, aName, bName);
}
