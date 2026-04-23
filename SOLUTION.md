# Top Creator Finder — 完整技术方案

> 本文档是项目权威方案文档。**每次架构/流程/规则调整后，必须同步更新本文档。**
>
> Last updated: 2026-04-23

---

## 1. 项目目标

用户输入一个品类（例如 `electronics`），系统自动在 Amazon Live 该品类页面中识别出所有 **Top Creator（Amazon Influencer Program 的 Platinum tier 红人）**，并展示为可排序、可导出 CSV 的列表。

**硬性要求：**
- 全自动，用户不需要手动提供 username
- 必须精准识别 Top Creator，不能混入品牌方或 Amazon 官方账号
- 成本可控
- 结果可导出 CSV

---

## 2. 核心挑战与关键发现

### 挑战
1. Amazon Live 浏览页面只返回 **broadcast UUID**，不直接提供 username
2. Amazon Live 上的直播有三类账号，必须过滤：
   - 红人（Creator/Influencer） ← 目标
   - 品牌方（如 Phomemo、T3 Micro）
   - Amazon 官方账号
3. username 与 display name 无关（例："Brian MacDuff" → `bmac`）

### 关键发现（经过多轮验证）
- `/live/browse/{category}` 页面的直播卡片是 **JS 动态渲染**，必须用 Playwright 才能拿到完整列表
- `/live/broadcast/{UUID}` 页面是**服务端渲染**，HTTP GET 直接返回 200，HTML 里内嵌 JSON 数据包含：
  - `creatorType`：值为 `"Influencer"` 或 `"Brand"` ← 用于过滤
  - `creatorProfileLink`：`/shop/{username}` ← 用于获取 username
  - 页面上**不止有主播**，侧边栏的 Featured Creators 也在同一个 JSON 里，都是**同品类**创作者
- `"Earns Revenue"` 字符串是页面级配置文字，品牌和红人页面都有，**不能用于过滤**
- `/shop/{username}` 页面的 HTML 直接包含 "Top Creator" 字样
- `influencer-XXXXXXXX` 格式是 Amazon 内部 ID，访问时会重定向到真实自定义 username

---

## 3. 完整流程（2 Phase）

```
┌─────────────────────────────────────────────────────────┐
│ Step 1: 浏览品类页，获取 broadcast UUID 列表              │
│         (Playwright 加载 /live/browse/{category})        │
│         滚动触发懒加载，收集所有 broadcast UUID           │
└────────────────────────────┬────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 1: 对每个 broadcast UUID，HTTP GET 页面            │
│          检查 HTML 中是否含 creatorType=Influencer        │
│          是 → 提取该页面所有 creatorProfileLink          │
│               （主播 + 侧边栏同品类创作者，全收集，去重） │
│          否 → 品牌/官方，跳过                            │
└────────────────────────────┬────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 2: 对所有去重后的 username，HTTP GET /shop/{user}  │
│          跟随重定向（influencer-ID → 真实 username）     │
│          HTML 含 "Top Creator" → 确认并保存              │
│          否则 → 丢弃                                     │
└────────────────────────────┬────────────────────────────┘
                             ▼
                    输出 Top Creator 列表
                    → 前端展示 + CSV 导出
```

---

## 4. 关键技术细节

### 红人过滤
- 检查 broadcast 页面 HTML 是否匹配正则：`/creatorType[^a-zA-Z]{0,20}Influencer/`
- **不使用** "Earns Revenue"（页面级配置文字，品牌页面也有）

### Username 提取
- 从 broadcast 页面 HTML 提取所有 `creatorProfileLink`：
  ```
  正则：/creatorProfileLink[^/]{0,30}\/shop\/([^"\\&#\s\/]+)/g
  ```
- 一个 broadcast 页面通常包含 10-20 个同品类创作者的 username
- 跨多个 broadcast 页面去重后汇总

### 真实 Username 解析
- 部分 username 格式为 `influencer-XXXXXXXX`（Amazon 内部 ID）
- HTTP GET 时设置 `redirect: 'follow'`，从最终 URL 提取真实 username：
  ```
  /shop/influencer-53d60670 → redirect → /shop/sweetmotherly
  最终 URL 提取：sweetmotherly
  ```

### Top Creator 验证
- HTTP GET `/shop/{username}`，HTML 含 `"Top Creator"` → 确认
- Display name 从 shop 页面 `<title>` 提取

---

## 5. 技术架构

### 整体架构
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend    │────▶│  Apify      │
│  (HTML/JS)  │◀────│  (Express)   │◀────│   Actor     │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │  Amazon.com  │
                                         │  (Live/Shop) │
                                         └──────────────┘
```

### Actor 内部技术选型

| 步骤 | 工具 | 原因 |
|---|---|---|
| Step 1 浏览品类页 | **Playwright** (PlaywrightCrawler) | 卡片是 JS 动态渲染，必须浏览器自动化 |
| Phase 1/2 HTTP 请求 | 普通 fetch | 这些页面是 SSR，HTTP 直接返回 200 |

---

## 6. 不采用的方案

| 方案 | 为什么放弃 |
|---|---|
| 用 "Earns Revenue" 过滤红人 | 是页面级配置文字，品牌/官方页面也包含，误报率高 |
| 从 display name 推导 username | 覆盖率极低（如 "Brian MacDuff" → `bmac`，完全不可推导） |
| 只取 broadcast 页面第一个 creatorProfileLink | 第一个不一定是主播，且会漏掉同页面的其他同品类创作者 |
| 用 Apify `amazon-influencers-profile-scraper` 做发现 | 只接受 username 输入，不能按品类搜索 |
| 整个流程都用 Playwright | 成本高；Phase 1/2 页面 SSR，HTTP 请求足够 |

---

## 7. 验证过的事实

- ✅ `curl https://www.amazon.com/live/broadcast/{UUID}` 返回 200
- ✅ broadcast 页面 HTML 内嵌 JSON 含 `creatorType`（Influencer/Brand）
- ✅ broadcast 页面 HTML 内嵌 JSON 含 `creatorProfileLink`（`/shop/{username}`）
- ✅ 侧边栏 Featured Creators 与主播同品类，`creatorProfileLink` 同样可用
- ✅ `influencer-XXXXXXXX` 访问时自动重定向到真实自定义 username
- ✅ shop 页面 HTML 直接含 "Top Creator" 文本
- ✅ `/live/browse/{category}` 的卡片是 JS 渲染，需要 Playwright

---

## 8. 数据模型

### Creator 对象
```json
{
  "username": "sweetmotherly",
  "displayName": "Sweet Motherly",
  "shopUrl": "https://amazon.com/shop/sweetmotherly",
  "isTopCreator": true,
  "category": "fashionandbeauty",
  "scrapedAt": "2026-04-23T..."
}
```

---

## 9. 成本估算

| 组件 | 消耗 |
|---|---|
| Playwright Step 1 | ~0.13 CU（2GB 内存，约 3-4 分钟） |
| Phase 1 HTTP 请求 | ~0.002 CU |
| Phase 2 HTTP 请求 | ~0.02 CU |
| **合计** | **~0.15 CU / 次** |

Apify 免费套餐 5 CU/月，约可免费跑 **30 次**。

---

## 10. 维护约定

- **本文档是权威方案。** 代码实现与本文档不一致时，以本文档为准。
- **任何流程/规则变动，必须同步更新本文档的对应章节和 "Last updated" 时间戳。**
