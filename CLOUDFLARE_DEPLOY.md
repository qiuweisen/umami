# 🚀 Cloudflare Workers 部署指南（OpenNext + Hyperdrive）

本项目（Umami）可通过 `@opennextjs/cloudflare` 构建为 Cloudflare Worker，再使用 `wrangler deploy` 部署。

> 推荐：Workers → Supabase Postgres 使用 **Hyperdrive**，避免连接数暴增与握手开销。

## ✅ 一次性准备

### 1) 安装 & 登录 Wrangler

```bash
pnpm add -D wrangler
pnpm wrangler login
```

### 2) 创建 Hyperdrive（连接 Supabase Postgres）

使用 Supabase 的 **Direct connection**（直连）连接串创建 Hyperdrive：

```bash
pnpm wrangler hyperdrive create umami-supabase \
  --connection-string "postgresql://USER:PASSWORD@HOST:5432/DB" \
  --caching-disabled
```

命令会输出一个 `id`，把它填入 `wrangler.jsonc`：

```jsonc
"hyperdrive": [
  { "binding": "HYPERDRIVE", "id": "YOUR_HYPERDRIVE_ID" }
]
```

### 3) 设置必须的 Secret

建议设置 `APP_SECRET`（避免不同环境 token 失效）：

```bash
pnpm wrangler secret put APP_SECRET
```

## 🗄️ 数据库迁移（每次发布前）

Worker 不负责执行 migration，请在本地/CI 先执行：

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB"
pnpm update-db
```

## 🏗️ 构建与部署

### 本地构建（生成 `.open-next/`）

```bash
pnpm cf:build
```

### 部署到 Workers

```bash
pnpm cf:deploy:prod
```

## 🧪 本地用 Worker 方式验证（可选）

```bash
pnpm cf:build
pnpm wrangler dev --config wrangler.jsonc
```

> `wrangler.jsonc` 的 `hyperdrive.localConnectionString` 仅用于本地 `wrangler dev`，可指向本机 Postgres 或 Supabase。
