// 核心数据模型。模式切换只影响计算引擎、图表、术语、Prompt 和主题标签，
// 用户资料、好友和历史记录在两种模式之间共享。

export type AstrologyMode = 'ziwei' | 'western';
export type Gender = '男' | '女';

export interface BirthProfile {
  /** 当地出生日期 YYYY-MM-DD */
  date: string;
  /** 当地出生时间 HH:mm；timeKnown=false 时按 12:00 处理 */
  time: string;
  timeKnown: boolean;
  cityId: string;
  gender: Gender;
}

export interface UserProfile {
  id: string;
  name: string;
  birth: BirthProfile;
  defaultMode: AstrologyMode;
  /** “同时查看两种解读” */
  dualView: boolean;
  createdAt: string;
}

export interface FriendProfile {
  id: string;
  name: string;
  relation: string;
  birth: BirthProfile;
}

export interface City {
  id: string;
  name: string;
  country: string;
  /** 中国地点的完整层级，如 ['浙江省', '台州市', '临海市']；旧版海外城市没有 */
  path?: string[];
  lat: number;
  lon: number;
  tz: string;
}

/** 由出生资料解析出的时间信息 */
export interface ResolvedBirth {
  utc: Date;
  city: City;
  /** 出生时刻该时区相对 UTC 的分钟偏移（已含夏令时） */
  offsetMinutes: number;
  dstApplied: boolean;
  /** 真太阳时 YYYY-MM-DD 与 HH:mm（用于紫微排盘） */
  solarDate: string;
  solarTime: string;
  /** iztro 时辰序号 0–12（0 早子时，12 晚子时） */
  timeIndex: number;
  notes: string[];
}

// ---------- 西方占星 ----------
export type PlanetKey =
  | 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars'
  | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune' | 'Pluto';

export type AspectType = 'conjunction' | 'sextile' | 'square' | 'trine' | 'opposition';

export interface PlanetPosition {
  key: PlanetKey;
  lon: number;
  sign: number; // 0 = 白羊
  degree: number; // 星座内度数
  house: number; // 1–12
  retrograde: boolean;
}

export interface Aspect {
  a: string;
  b: string;
  type: AspectType;
  orb: number;
}

export interface WesternChart {
  planets: PlanetPosition[];
  ascendant: number;
  midheaven: number;
  cusps: number[]; // 12 个宫头黄经
  houseSystem: 'Placidus' | 'Porphyry';
  aspects: Aspect[];
  bigThree: { sun: number; moon: number; rising: number };
  timeKnown: boolean;
}

export interface Transit {
  transiting: PlanetKey;
  natal: string;
  type: AspectType;
  orb: number;
}

// ---------- 紫微斗数 ----------
export type Mutagen = '禄' | '权' | '科' | '忌';

export interface ZiweiStar {
  name: string;
  type: 'major' | 'minor' | 'adjective';
  brightness?: string;
  mutagen?: Mutagen;
}

export interface ZiweiPalace {
  index: number;
  name: string; // 统一带“宫”字，例如 “命宫”“夫妻宫”
  heavenlyStem: string;
  earthlyBranch: string;
  isSoul: boolean;
  isBody: boolean;
  majorStars: ZiweiStar[];
  minorStars: ZiweiStar[];
  adjectiveStars: ZiweiStar[];
  decadal: [number, number];
  /** 空宫时借对宫主星 */
  borrowed: boolean;
  /** 长生十二神、博士十二神、岁前十二神、将前十二神 */
  changsheng12: string;
  boshi12: string;
  suiqian12: string;
  jiangqian12: string;
  /** 小限岁数 */
  ages: number[];
}

export interface ZiweiChart {
  palaces: ZiweiPalace[];
  soulBranch: string;
  bodyBranch: string;
  soulStar: string; // 命主
  bodyStar: string; // 身主
  fiveElements: string;
  lunarDate: string;
  chineseDate: string;
  zodiac: string;
  timeLabel: string;
  gender: Gender;
  /** 本命四化：禄权科忌 → 星名 */
  natalMutagens: Record<Mutagen, string>;
}

export interface ZiweiHoroscope {
  decadalPalace: string;
  decadalRange: [number, number];
  yearlyPalace: string;
  yearlyMutagens: Record<Mutagen, string>;
  dailyPalace: string;
  dailyMutagens: Record<Mutagen, string>;
  nominalAge: number;
  /** 各运限所在宫位序号，用于在命盘上标注 */
  decadalIndex: number;
  yearlyIndex: number;
  dailyIndex: number;
  ageIndex: number;
}

// ---------- 快照与关系 ----------
export interface ChartSnapshot {
  profileId: string;
  resolved: ResolvedBirth;
  western: WesternChart;
  ziwei: ZiweiChart;
}

export interface CompatibilityItem {
  title: string;
  detail: string;
  weight: number;
}

export interface CompatibilityReport {
  mode: AstrologyMode;
  aId: string;
  bId: string;
  score: number; // 0–100
  summary: string;
  strengths: CompatibilityItem[];
  conflicts: CompatibilityItem[];
  communication: CompatibilityItem[];
  themes: string[];
}

// ---------- AI ----------
export interface WesternSummary {
  kind: 'western';
  sun: string;
  moon: string;
  rising: string | null;
  placements: { planet: string; sign: string; house: number | null }[];
  aspects: string[];
}

export interface ZiweiSummary {
  kind: 'ziwei';
  soulPalace: { branch: string; stars: string[]; borrowed: boolean };
  bodyPalace: string;
  fiveElements: string;
  palaces: { name: string; stars: string[] }[];
  natalMutagens: Record<Mutagen, string>;
}

export type ChartSummary = WesternSummary | ZiweiSummary;

export interface InterpretationRequest {
  mode: AstrologyMode;
  question: string;
  profileId: string;
  context: {
    name?: string;
    chartSummary: ChartSummary;
    relationship?: { friendName: string; score: number; summary: string; themes: string[] };
    currentTransits?: string[];
  };
}

export interface InterpretationResponse {
  answer: string;
  themes: string[];
  confidence?: 'low' | 'medium' | 'high';
  sourceMode: AstrologyMode;
  provider?: 'mock' | 'deepseek' | 'local-mock';
  /** 降级说明，例如服务端不可达改用本地演示 */
  notice?: string;
}

export interface InterpretationProvider {
  interpret(request: InterpretationRequest): Promise<InterpretationResponse>;
}

export interface InterpretationEntry {
  id: string;
  question: string;
  response?: InterpretationResponse;
  error?: string;
  /** 用户点了“停止生成”，answer 只保留已显示的部分 */
  stopped?: boolean;
  createdAt: string;
}

export interface InterpretationThread {
  id: string;
  mode: AstrologyMode;
  profileId: string;
  friendId?: string;
  title: string;
  entries: InterpretationEntry[];
  updatedAt: string;
  /** 置顶时间（ISO）；有值即置顶，按置顶先后排在列表最上方 */
  pinnedAt?: string;
}

export interface VisualAssetSource {
  file: string;
  origin: 'hand-coded-svg' | 'dreamina' | 'third-party';
  author: string;
  license: string;
  notes?: string;
}
