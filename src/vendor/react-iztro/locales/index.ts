// 摘自 react-iztro src/locales/index.ts（MIT），本项目只保留简体中文
import i18next from "iztro/lib/i18n";
import transZhCN from "./zh-CN";
import type FunctionalAstrolabe from "iztro/lib/astro/FunctionalAstrolabe";
import type { Language } from "iztro/lib/data/types";

i18next.addResources("zh-CN", "react", transZhCN);

export const toLocaleLunarStr = (
  lunarStr: string,
  _lunarDate: FunctionalAstrolabe["rawDates"]["lunarDate"],
  _lang: Language
) => lunarStr;
