# 部署与开发

线上前端：https://lgsh-1234.github.io/dual-astrology/

代码仓库：https://github.com/LGSH-1234/dual-astrology

## 组成

- GitHub Pages 发布 Vite 构建产物，main 分支推送后自动测试、构建与更新。
- Supabase Auth 管理邮箱密码账号；本项目的表为 `dual_astrology_states`，按 `auth.uid()` 限制每位用户只能读写自己的资料与对话。
- `dual-astrology-api` Edge Function 处理问答。每个登录用户每 5 分钟最多 30 次，限额在数据库中原子更新；游客使用演示回答，不调用付费模型。
- 解读引擎和请求校验由 `scripts/sync-edge-shared.mjs` 从主代码同步到 `supabase/functions/_shared`。

## 开发

`npm run dev` 默认使用原有本机 API，原有资料保持在原位置。

需要在开发环境验证线上后端时，在 `.env.local` 中设置：

```dotenv
VITE_SUPABASE_ENABLED=true
```

生产构建默认连接 Supabase；用 `VITE_SUPABASE_ENABLED=false` 可构建配合原有 Node 服务的版本。单文件版在 `file://` 打开时使用独立的离线账号与演示问答。

`src/config/cloud.ts` 只有可公开的 Supabase URL、publishable key 与站点地址。管理员密钥、AI 密钥、真实用户数据均不得提交到 GitHub。

## 更新后端

1. 修改 `server/cloud.ts`、`server/deepseek.ts` 或解读共享代码。
2. 运行 `node scripts/sync-edge-shared.mjs` 和 `npm test`。
3. 将 `supabase/functions/dual-astrology-api` 与 `_shared` 部署到现有 Supabase 项目。
4. 新项目的数据库结构在 `supabase/schema.sql`，应用后确认 RLS、授权和四条所有者策略已启用。

部署函数关闭旧 JWT 网关校验，函数自身对登录请求调用 Auth `getUser(token)`；公开请求只可获得演示内容，并检查 publishable key 与允许的来源。管理凭据只在 Edge Function 环境内读取。

Supabase Edge Function secrets：`DIO_DEEPSEEK_API_KEY`、可选的 `DIO_DEEPSEEK_MODEL`、`DIO_PUBLISHABLE_KEY`。以 `DIO_` 前缀区分其他作品。

## 登录配置

展示版本使用邮箱与密码直接注册。邮件链接的回跳地址需加入 Supabase Auth Redirect URLs：`https://lgsh-1234.github.io/dual-astrology/`。

恢复链接的 access token 会被应用读取并立即从地址栏移除，然后进入密码重置页。若重新开启邮箱验证，注册后会提示查收邮件。

Supabase 默认邮件服务只适合测试，向一般访客发送找回密码邮件需要配置自己的 SMTP。未配置时不要把邮件发送成功当作已经验证过的功能。

## 本次验证

- 76 个单元测试覆盖原有功能及线上后端的身份校验、来源检查、输入校验、调用限额、降级和出生日期时区处理。
- 生产构建使用 `/dual-astrology/` 作为资源前缀。
- GitHub Actions 在发布前重新执行测试与构建。
