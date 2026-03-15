# Umami → Cloudflare Workers 迁移设计

**日期**: 2026-03-15  
**目标**: 将本仓库的 Umami（Next.js + Prisma + Supabase Postgres）迁移到 Cloudflare Workers 部署，并通过本地构建产物后使用 `wrangler deploy` 发布。

## 背景与动机

- 当前部署在 Vercel，CPU 开销较大，无法支撑后续扩展/迭代。
- 希望复用已有项目 `arabic-calligraphy-creator` 的 Cloudflare Workers 部署流程：本地构建 → `wrangler deploy`。

## 总体方案（已选）

采用 **OpenNext + Cloudflare Workers + Hyperdrive**：

1. **OpenNext 构建**：使用 `@opennextjs/cloudflare` 将 Next.js 构建为 Worker 产物（`.open-next/worker.js`）与静态资源（`.open-next/assets`）。
2. **数据库连接**：使用 Cloudflare **Hyperdrive** 为 Workers → Supabase Postgres 提供连接复用与连接池。
3. **运行时适配**：针对 Workers 特性调整 Prisma 初始化、geo 识别与可选依赖加载方式，保证 Worker 打包/运行稳定。

## 架构

- **Worker**：单 Worker 承载 UI + API（包括 `/api/send` 等写入接口）。
- **静态资源**：OpenNext 将静态资源打包到 `.open-next/assets`，由 `ASSETS` binding 提供。
- **数据库**：
  - Worker 侧绑定 `HYPERDRIVE`（Hyperdrive binding）
  - Prisma Adapter 使用 `env.HYPERDRIVE.connectionString`（而非直接使用 Supabase 原始连接串）
  - Prisma client 采用“按请求创建/同请求内复用”的策略，避免跨请求连接复用导致的潜在问题

## 构建与部署

### 本地构建

- `pnpm cf:build`
  - 运行 Umami 必要的构建步骤（如 prisma generate、tracker build、Next build）
  - 运行 `opennextjs-cloudflare build` 生成 `.open-next/` 产物

### 数据库迁移

- Worker 不运行 `prisma migrate`（避免在边缘环境跑 CLI）
- 部署前由本地或 CI 执行：`pnpm update-db`

### 发布

- `pnpm cf:deploy:prod`：
  - `pnpm cf:build`
  - `wrangler deploy --config wrangler.jsonc`

## 关键代码改动点

### Prisma（核心）

- 新增 Cloudflare/OpenNext request context 读取工具：从 `globalThis[Symbol.for("__cloudflare-context__")]` 读取 `{ env, ctx, cf }`。
- `src/lib/prisma.ts`：
  - Cloudflare 环境优先使用 `env.HYPERDRIVE.connectionString`
  - PrismaClient 不再使用全局单例（避免跨请求复用），改为“每个请求创建一个 PrismaClient；同请求内可复用”

### Geo/IP

- Cloudflare 环境优先使用 Cloudflare headers（`cf-ipcountry`、`cf-region-code`、`cf-ipcity`）。
- 在 Worker 中禁用/规避 `maxmind` 的 mmdb 文件读取兜底（Workers 无传统文件系统，避免触发崩溃）。

### 可选依赖（Kafka / ClickHouse）

- `kafkajs`、`@clickhouse/client` 在 Workers 环境可能存在兼容性风险。
- 改为“仅在对应 env 变量启用时动态 import”，避免默认情况下打包/运行失败。

## 环境变量与 Cloudflare 配置

- **必须**：建议设置 `APP_SECRET`（避免 secret 派生自 `DATABASE_URL` 导致不同环境不一致）。
- 其他：`REDIS_URL`、`CLICKHOUSE_URL`、`KAFKA_URL` 等保持可选。
- `wrangler.jsonc`：
  - `compatibility_flags`: `nodejs_compat`、`global_fetch_strictly_public`
  - `hyperdrive`: 绑定 `HYPERDRIVE`

## 风险与验证

- **Prisma + Hyperdrive + Workers** 的兼容性需通过本地 `wrangler dev` 走通关键链路：
  - 登录、创建网站、`/api/send` 写入、Dashboard 查询展示
- Supabase 连接数/性能：验证 Hyperdrive 生效（连接复用、连接数不暴增）。

