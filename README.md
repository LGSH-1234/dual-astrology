# Dio delle Stelle · 星神

（原名「星与紫微 · Dual Astrology」）

一个支持紫微斗数和西洋占星两种模式的 AI 占星作品集 Web App。两种模式无刷新切换，命盘、运势、合盘、问答都会随之变化。

[在线体验](https://lgsh-1234.github.io/dual-astrology/) · [部署与开发说明](docs/DEPLOYMENT.md)

## 运行

Mac 一键启动：双击项目根目录的 `启动.command`（需要 Node.js 22.5+）。它会按本机平台安装依赖、构建页面、在 http://localhost:8787 同时提供页面和接口，并自动打开浏览器。关掉终端窗口即停止。

开发模式：

```bash
npm install
npm run dev        # 前端 http://localhost:5173 ，API http://localhost:8787
npm start          # 构建后由服务端同端口提供页面和接口
```

## 命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 同时启动前端和 API |
| `npm start` | 构建前端并启动服务（页面 + 接口同端口） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm test` | 单元测试（Vitest，76 项） |
| `npm run standalone` | 生成单文件体验版 `dist-standalone/DioDelleStelle.html`，双击即可打开 |
| `npm run e2e` | 端到端测试（Playwright，30 项），截图输出到 `docs/screenshots` |

## 结构

```
src/lib/astro    时间与时区、西占（astronomy-engine + Placidus）、紫微（iztro）、合盘、每日运势
src/lib/ai       解读逻辑、请求校验、前端客户端
src/pages        引导 / 首页 / 命盘 / 合盘 / 问答 / 我的
server/          Hono API：解读、账号、状态与数据接口
docs/            PLAN.md 细化方案、PROVENANCE.md 来源与许可、screenshots
```

## 说明

- 账号支持邮箱与密码登录，也可以直接以游客身份体验；注册后可继续保留已有资料。
- 找回密码提供一次性链接，30 分钟有效；登录后可在「我的资料」修改密码。
- 解读、登录、注册、找回、重置、修改密码和问答均带有基础的频率限制与异常处理。
- 出生地点按省 / 地级市 / 区县三级选择（直辖市为两级，港澳台到省级），也可直接搜索地名；共 3212 个地点，来源见 `docs/PROVENANCE.md`。不确定区县时按市中心计算。
- 桌面侧栏可拖动右边缘调宽（最小 248px，最大约屏宽 1/3，双击恢复，方向键微调），宽度会记住；会话列表不显示滚动条。
- 会话列表默认显示最近 8 个，可“展开显示 / 收起”；悬停或聚焦某行时右侧渐变淡入“…”和图钉（默认宽度即可使用，长标题自动截断），“…”菜单只有置顶 / 删除（删除可撤销），置顶会话固定在最上方的“置顶”分组。
- 内容仅供娱乐和自我探索，不构成任何专业建议。
