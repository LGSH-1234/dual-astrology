# 来源与许可

## 依赖（均锁定版本）

| 包 | 版本 | 许可 | 用途 |
|---|---|---|---|
| iztro | 2.6.1 | MIT | 紫微斗数排盘数据 |
| astronomy-engine | 2.1.19 | MIT | 行星黄经、黄赤交角、恒星时 |
| react / react-dom | 18.3.1 | MIT | UI |
| lucide-react | 0.460.0 | ISC | 图标 |
| hono / @hono/node-server | 4.6.14 | MIT | 服务端 API |
| tailwindcss | 3.4.17 | MIT | 样式 |
| vite / vitest / @playwright/test | 5.4.11 / 2.1.8 / 1.49.1 | MIT / MIT / Apache-2.0 | 构建与测试 |

## 考虑过但未使用

AstroChart、astrologyjs、solar-system-threejs 都没有引入。react-iztro 的排版代码已复制进 `src/vendor/react-iztro/`，见下文。西方星盘由本项目代码绘制。

## 自写部分

- Placidus 宫位算法、真太阳时与时差计算、合盘规则、每日运势文案、星曜与星座释义文本，均为本项目原创。
- 视觉：配色参考 Anthropic 官网的暖中性色调（纸白 #faf9f5、浅底 #f0eee6、墨黑 #141413、陶土橙 #d97757），只借用色值，没有使用 Anthropic / Claude 的 Logo、字体或任何品牌元素。字体使用系统字体回退（Noto Serif SC / Inter），没有打包字体文件。
- 与 Co–Star 无关：没有使用其代码、文案、商标或截图。
- 紫微命盘排版代码复制自 [react-iztro](https://github.com/SylarLong/react-iztro)，版本 v1.5.0，commit a57f16b，MIT 许可，© 2023 Sylar Long。原 LICENSE 保留在 `src/vendor/react-iztro/LICENSE`。复制范围包括 Iztrolabe、Izpalace、Izstar、IzpalaceCenter（含 Line 连线）、theme/default.css 和 zh-CN 语言包。本项目做了这些改动：颜色变量换成本项目的 Anthropic 风格配色，排版规则没动；去掉 iztro-hook，直接传入本项目按真太阳时排好的 astrolabe；用 `cx.ts` 替代 classnames；去掉安星算法和排盘类型切换；只注册 zh-CN；新增宫位选中、键盘操作、aria 标签和 testid；版权链接加上 `rel="noreferrer"`。新增的直接依赖是 lunar-lite 0.2.8，它本来就是 iztro 的依赖。

## 生成图像

2026-10-01 用即梦画布 CLI（Seedream 5.0 Lite，文生图，消耗 0 积分）生成了 3 个 UI 方向，每个方向一张桌面版和一张手机版：A 杂志排版、B 卡片式、C 细线轨道。文件放在 `docs/jimeng/`，任务记录在 `docs/jimeng-job.json`，画布地址是 https://jimeng.jianying.com/ai-tool/ai-canvas/f0197840-970c-4cd5-90f2-a4d3b1555b0a 。

这些图只用来定视觉方向，没有切图或嵌进产品。最后选的是「A + C 混合」，界面全部用代码（Tailwind + SVG）重新实现。生成图里如果出现了文字或图形，都没有搬进产品文案。

### Logo

2026-10-01 用同一画布（Seedream 5.0 Lite，1:1 2K，消耗 0 积分）生成 3 张 logo 参考图：`docs/jimeng/logo/logo-A.png`（八芒星 + 轨道弧）、`logo-B.png`（星冠神像徽章）、`logo-C.png`（宫格 + 星盘）。任务记录在 `docs/jimeng-logo-job.json`。

参考图只用来定方向，产品里的标志 `src/components/Logo.tsx` 和 `public/favicon.svg` 是按 A 方向手写的 SVG（十六芒星 + 陶土色指针 + 轨道弧），没有使用生成图的像素。

## 截图

`docs/screenshots/` 下的截图由 Playwright 自动生成（`npm run e2e`），使用的是示例用户「星野」的虚构资料。

## 出生地点数据（src/data/regions.json）

- 省 / 地级市 / 区县名称与代码：[@aurouscia/china-areas](https://www.npmjs.com/package/@aurouscia/china-areas) 0.7.0，MIT，数据来自民政部国家地名信息库（2026）。共 34 个省级单位、3212 个地点；港澳台只到省级。
- 经纬度：[cpca](https://pypi.org/project/cpca/) 0.5.5 的 `adcodes.csv`，MIT。按行政区划代码匹配 3037 个；代码变更的按同市/同省唯一同名匹配 89 个；其余 52 个新设或更名区县按前身县区或政府驻地手工补近似坐标（误差在几十公里内，对真太阳时影响约 1–2 分钟）。
- 只在构建时离线合并，运行时不调用任何地理编码服务。旧版城市 id（如 `hangzhou`）和海外城市仍可读取，但界面只提供中国地点。
