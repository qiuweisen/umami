# Umami → Cloudflare Workers Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 使用 OpenNext 将 Umami 部署到 Cloudflare Workers，并通过 Hyperdrive 连接 Supabase Postgres，支持完整 UI + API 能力。

**Architecture:** Next.js 通过 `@opennextjs/cloudflare` 输出 `.open-next/worker.js` 与 `.open-next/assets`；Wrangler 负责部署 Worker；数据库通过 Hyperdrive binding 提供 `connectionString` 给 Prisma（`@prisma/adapter-pg`）。

**Tech Stack:** Next.js 15, OpenNext (`@opennextjs/cloudflare`), Cloudflare Workers + Wrangler, Hyperdrive, Prisma (`@prisma/adapter-pg`)

---

> 注意：本计划包含“提交 commit”的步骤，但本仓库在当前工作流下可能不希望自动提交；执行时可将 commit 步骤视为可选。

### Task 1: 增加 Cloudflare 构建/部署依赖与脚本

**Files:**
- Modify: `package.json`

**Step 1: 安装依赖（本地验证用）**

Run: `pnpm install`
Expected: 依赖安装成功

**Step 2: 增加 scripts**

在 `package.json` 增加：
- `cf:build`: 先跑 Umami 必要构建，再跑 `opennextjs-cloudflare build`
- `cf:deploy:prod`: `npm run cf:build && wrangler deploy --config wrangler.jsonc`

**Step 3: 增加 devDependencies**

增加：
- `@opennextjs/cloudflare`
- `wrangler`

**Step 4: 运行静态检查**

Run: `pnpm lint`
Expected: 通过（或仅有既有仓库的已知问题）

**Step 5: Commit（可选）**

Run:
```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add Cloudflare Workers build/deploy scripts"
```

---

### Task 2: 新增 OpenNext 与 Wrangler 配置文件

**Files:**
- Create: `open-next.config.ts`
- Create: `wrangler.jsonc`
- (Optional) Create: `wrangler.staging.jsonc`
- (Optional) Create: `CLOUDFLARE_DEPLOY.md`

**Step 1: 新增 `open-next.config.ts`（最小配置）**

参考 `arabic-calligraphy-creator/open-next.config.ts`，先只做：
```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
```

**Step 2: 新增 `wrangler.jsonc`**

要求：
- `main: ".open-next/worker.js"`
- `assets.directory: ".open-next/assets"` + `binding: "ASSETS"`
- `compatibility_flags`: `nodejs_compat`, `global_fetch_strictly_public`
- `services`: `WORKER_SELF_REFERENCE` 绑定自身
- `hyperdrive`: 绑定 `HYPERDRIVE`（填入实际 hyperdrive id）

**Step 3:（可选）新增 `CLOUDFLARE_DEPLOY.md`**

写清：
- `wrangler login`
- `wrangler hyperdrive create ...`
- `pnpm update-db`
- `pnpm cf:deploy:prod`

**Step 4: 产物检查（无需部署）**

Run: `pnpm cf:build`
Expected: 生成 `.open-next/` 目录（包含 `worker.js` 与 `assets/`）

**Step 5: Commit（可选）**

Run:
```bash
git add open-next.config.ts wrangler.jsonc CLOUDFLARE_DEPLOY.md
git commit -m "chore: add OpenNext and Wrangler config for Cloudflare Workers"
```

---

### Task 3: 增加 OpenNext/Cloudflare request context 读取工具

**Files:**
- Create: `src/lib/cloudflare-context.ts`
- Test: `src/lib/__tests__/cloudflare-context.test.ts`

**Step 1: 写一个最小单测（先失败）**

```ts
import { getCloudflareContext } from "../cloudflare-context";

test("getCloudflareContext returns undefined by default", () => {
  expect(getCloudflareContext()).toBeUndefined();
});
```

**Step 2: 运行测试确认失败**

Run: `pnpm test`
Expected: FAIL（文件不存在或函数不存在）

**Step 3: 实现 `getCloudflareContext()`**

实现逻辑：
- 读取 `globalThis[Symbol.for("__cloudflare-context__")]`
- 若不存在则返回 `undefined`
- 若存在则返回 `{ env, ctx, cf }`（类型尽量宽松）

**Step 4: 运行测试确认通过**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit（可选）**

```bash
git add src/lib/cloudflare-context.ts src/lib/__tests__/cloudflare-context.test.ts
git commit -m "feat: add Cloudflare request context helper"
```

---

### Task 4: Prisma 适配 Hyperdrive + 每请求创建 client

**Files:**
- Modify: `src/lib/prisma.ts`
- (Optional) Modify: `src/lib/db.ts`
- Test: `src/lib/__tests__/prisma-cloudflare.test.ts`

**Step 1: 写一个聚焦的单测（先失败）**

目标：当 Cloudflare context 存在且 env.HYPERDRIVE.connectionString 存在时，Prisma 使用该 URL。

（测试可通过 mock `globalThis[Symbol.for("__cloudflare-context__")]` 的 getter 返回固定 store 来实现。）

**Step 2: 运行测试确认失败**

Run: `pnpm test`
Expected: FAIL

**Step 3: 改造 `src/lib/prisma.ts`**

建议实现：
- 将“构建连接串”提取为函数 `getRuntimeDatabaseUrl()`：
  - 优先：Cloudflare context `env.HYPERDRIVE.connectionString`
  - 否则：`process.env.DATABASE_URL`
- Cloudflare 环境：
  - 不再写入 `globalThis.prisma` 单例
  - 通过 `react` 的 `cache()` 在同一请求内复用 PrismaClient
  - 通过 `PrismaPg` 的 pool option 设置 `maxUses: 1`
- 非 Cloudflare 环境保持原来的行为（全局单例 + replica 支持）

**Step 4: 运行测试确认通过**

Run: `pnpm test`
Expected: PASS

**Step 5: 回归最核心链路（本地）**

Run: `pnpm dev`
Expected: 本地 Next dev 正常启动（不需要 Cloudflare）

**Step 6: Commit（可选）**

```bash
git add src/lib/prisma.ts src/lib/db.ts src/lib/__tests__/prisma-cloudflare.test.ts
git commit -m "feat: support Hyperdrive + request-scoped Prisma client on Cloudflare"
```

---

### Task 5: Geo/IP 逻辑避免 Workers 文件系统依赖

**Files:**
- Modify: `src/lib/detect.ts`
- Modify: `src/lib/__tests__/detect.test.ts`

**Step 1: 增加单测覆盖“Cloudflare headers 优先”**

在 `detect.test.ts` 增加一个测试（或补充现有测试）：
- 当 headers 有 `cf-ipcountry` 时，不应触发 maxmind 兜底（通过把 `SKIP_LOCATION_HEADERS` 打开/关闭来覆盖路径）。

**Step 2: 运行测试确认失败**

Run: `pnpm test`
Expected: FAIL

**Step 3: 实现修改**

修改方向：
- 移除 `maxmind` 的静态 import，改为在需要时动态 import
- Cloudflare 环境下如果没有可用 headers，直接返回 `null`（不尝试读取 mmdb）

**Step 4: 运行测试确认通过**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit（可选）**

```bash
git add src/lib/detect.ts src/lib/__tests__/detect.test.ts
git commit -m "fix: avoid maxmind filesystem fallback on Cloudflare Workers"
```

---

### Task 6: Kafka / ClickHouse 可选依赖改为动态加载

**Files:**
- Modify: `src/lib/kafka.ts`
- Modify: `src/lib/clickhouse.ts`

**Step 1: 改造 Kafka 为动态 import**

- 顶层不再 `import { Kafka } from "kafkajs"`
- 仅当 `KAFKA_URL` 与 `KAFKA_BROKER` 都存在时再 `await import("kafkajs")`

**Step 2: 改造 ClickHouse 为动态 import**

- 顶层不再 `import { createClient } from "@clickhouse/client"`
- 仅当 `CLICKHOUSE_URL` 存在时再 `await import("@clickhouse/client")`

**Step 3: 运行测试/构建**

Run: `pnpm test`
Expected: PASS

Run: `pnpm cf:build`
Expected: OpenNext build 成功（不因 Kafka/ClickHouse 包引入而失败）

**Step 4: Commit（可选）**

```bash
git add src/lib/kafka.ts src/lib/clickhouse.ts
git commit -m "chore: lazy-load optional kafka/clickhouse deps for Workers compatibility"
```

---

### Task 7: Cloudflare 本地验证与部署验证

**Files:**
- (No code changes expected)

**Step 1: 创建 Hyperdrive（一次性）**

Run:
```bash
wrangler login
wrangler hyperdrive create umami-supabase --connection-string "postgresql://USER:PASSWORD@HOST:5432/DB" --caching-disabled
```
Expected: 输出 Hyperdrive `id`

**Step 2: 将 Hyperdrive `id` 写入 `wrangler.jsonc`**

Expected: `hyperdrive` binding 生效

**Step 3: 运行本地 Worker**

Run: `pnpm cf:build && wrangler dev --config wrangler.jsonc`
Expected: 访问本地地址，页面能加载，核心 API（登录、创建网站、/api/send）可用

**Step 4: 部署到线上**

Run: `pnpm update-db && pnpm cf:deploy:prod`
Expected: `wrangler deploy` 成功，线上访问可用

---

Plan complete and saved to `docs/plans/2026-03-15-umami-cloudflare-workers.md`. Two execution options:

1. Subagent-Driven (this session) — I execute tasks sequentially with review checkpoints.
2. Parallel Session (separate) — Open a new session using `executing-plans` and run this plan task-by-task.

Which approach?
