# Top Creator Finder — 完整技术方案

> 本文档是项目权威方案文档。每次架构、流程、接口、规则调整后，必须同步更新本文档。
>
> Last updated: 2026-04-23

---

## 1. 项目目标

用户输入一个品类（例如 `electronics`），系统自动在 Amazon Live 中识别并验证 Creator，区分：
- Top Creator（`isTopCreator=true`）
- Creator（`isTopCreator=false`）

前端需要支持：
- 异步查询（不阻塞等待整次任务完成）
- 增量展示结果
- 展示本次任务成本（`costUsd`）

---

## 2. 当前架构

### 部署形态
- 单服务部署（Render Web Service）
- Express 同时托管：
- `/api/*` 后端接口
- `/` 前端静态页面

### 模块组成
- `frontend/`: 原生 HTML/CSS/JS 页面
- `backend/`: Express API 编排层
- `actors/amazon-live-creators-scraper/`: Apify Actor 抓取与验证

---

## 3. 端到端流程（异步 + 增量）

1. 前端调用 `POST /api/search`，后端启动 Actor run，立即返回 `runId`/`datasetId`。
2. 前端按固定间隔轮询 `GET /api/search/:runId`。
3. Actor 在运行中持续写入 dataset（每验证一个 Creator 就写一条）。
4. 后端每次轮询读取当前 dataset items，计算统计并返回给前端。
5. 前端实时刷新 `Creator` 与 `Top Creator` 两个列表，直到 run 进入终态。

终态集合：
- `SUCCEEDED`
- `FAILED`
- `ABORTED`
- `TIMED-OUT`

---

## 4. Actor 运行逻辑

### Step 1: 浏览页采集
- 使用 `PlaywrightCrawler` 打开 `/live/browse/{category}`。
- 滚动页面采集 `broadcast UUID`。

### Step 2: 流式处理 broadcast
- 逐个请求 `/live/broadcast/{uuid}`。
- 用 `creatorType=Influencer` 过滤非目标页面。
- 提取该页面全部 `creatorProfileLink -> /shop/{username}`。

### Step 3: 流式验证 username
- 拿到一个新 username 就立即请求 `/shop/{username}` 验证。
- 通过重定向解析真实 username（处理 `influencer-xxxx`）。
- 判断是否包含 `"Top Creator"`，得到 `isTopCreator`。
- 每个验证成功请求（无论是否 Top Creator）都 `Actor.pushData()` 写入 dataset。

### Step 4: 早停策略
- `maxResults` 定义为 Top Creator 上限。
- 当 `topCreators.length >= maxResults` 时，停止后续 broadcast 和 username 验证，降低成本。

---

## 5. API 协议

### `POST /api/search`
用途：启动任务。

请求体：
```json
{
  "category": "electronics",
  "maxResults": 50,
  "country": "US"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "runId": "abc123",
    "datasetId": "xyz456",
    "status": "READY",
    "isFinished": false,
    "category": "electronics",
    "country": "US",
    "maxResults": 50
  }
}
```

### `GET /api/search/:runId?category=...&country=...&maxResults=...`
用途：获取任务状态 + 当前增量结果。

响应关键字段：
- `status`/`isFinished`
- `topCreators`（仅 Top Creator）
- `allCreators`（全部已验证 Creator）
- `stats.totalCreators`
- `stats.topCreatorsCount`
- `stats.topCreatorPercentage`
- `stats.costUsd`

### 其他接口
- `GET /api/categories`: 返回品类配置（来源 `backend/config/categories.js`）
- `GET /api/health`: 健康检查
- `GET /api/test`: Apify 连通性检查

---

## 6. 数据模型

### Actor dataset item
```json
{
  "username": "sweetmotherly",
  "displayName": "Sweet Motherly",
  "shopUrl": "https://www.amazon.com/shop/sweetmotherly",
  "isTopCreator": true,
  "category": "fashion",
  "scrapedAt": "2026-04-23T10:30:00Z"
}
```

### 前端展示模型（后端转换后）
```json
{
  "username": "sweetmotherly",
  "displayName": "Sweet Motherly",
  "profileUrl": "https://www.amazon.com/shop/sweetmotherly",
  "topCreatorStatus": true,
  "bio": "",
  "postsCount": 0,
  "timestamp": "2026-04-23T10:30:00Z"
}
```

---

## 7. 成本控制策略

- 使用 `maxResults` 作为 Top Creator 的硬上限并早停。
- 流式验证，减少“先收集大候选池再统一验证”的无效请求。
- 前端异步轮询，避免长时间同步阻塞请求。
- 通过 Apify run 的 `usageTotalUsd` 回传并展示当前任务成本。

---

## 8. 运维与发布约定

- 修改 Actor 逻辑后，必须重新发布 Actor 到 Apify。
- 修改后端/前端逻辑后，必须重新部署 Render。
- 文档与代码不一致时，以代码为准并立即回补本文档。
- 与历史草稿冲突时，以 `SOLUTION.md` 为准。
