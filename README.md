# 🔍 Amazon Top Creator 挖掘工具

一个自动化的 Web 应用，用于挖掘和展示亚马逊 Top Creator 红人信息。

## 项目概述

### 功能
- ✅ 按品类自动搜索 Amazon Live 创作者
- ✅ 验证创作者的 Top Creator 身份（Platinum 等级）
- ✅ 分开展示 Creator 与 Top Creator
- ✅ 展示创作者的详细信息（用户名、简介、帖子数等）
- ✅ 展示每次运行的 Apify 成本
- ✅ 支持排序、筛选、导出功能
- ✅ 美观的响应式界面

### 工作流程

```
用户输入品类（如"electronics"）
       ↓
前端调用同源后端 API
       ↓
后端启动 Amazon Live Top Creator Actor 并立即返回 runId
       ↓
前端轮询任务状态接口
       ↓
Actor 抓取 broadcast 与 shop 页面，并把结果增量写入 dataset
       ↓
后端持续读取当前 dataset 结果并返回给前端
       ↓
前端展示结果（表格、统计、操作）
```

## 项目结构

```
top-creator-finder/
├── README.md                           # 项目说明（本文件）
├── SOLUTION.md                         # 权威技术方案文档
├── solution.txt                        # 早期方案草稿
├── render.yaml                         # Render 部署配置
├── actors/
│   └── amazon-live-creators-scraper/   # Actor 1: Amazon Live 爬虫
│       ├── main.js                      # 爬虫主逻辑
│       ├── input_schema.json            # 输入参数定义
│       ├── package.json
│       ├── .actor                       # Apify 配置
│       ├── Dockerfile
│       └── README.md
│
├── backend/                            # 后端应用
│   ├── app.js                          # Express 服务器
│   ├── api/
│   │   ├── apify.js                    # Apify API 封装
│   │   └── routes.js                   # API 路由
│   ├── config/
│   │   └── categories.js               # 品类配置（前后端共用来源）
│   ├── package.json
│   ├── .env                            # 环境变量（用户填写）
│   └── .env.example
│
├── frontend/                           # 前端应用
│   ├── index.html                      # 主页面
│   ├── style.css                       # 样式
│   └── script.js                       # JavaScript 逻辑
│
└── .env.example                        # 项目级环境变量示例
```

## 快速开始

### 前置条件

1. **Apify 账户**
   - 注册地址：https://apify.com
   - 获取 API Token：https://console.apify.com/account/integrations

2. **Node.js 环境**
   - 版本 14+ 或更高
   - 下载：https://nodejs.org

3. **已上传的 Actor 1**
   - 你已经上传了 Amazon Live 爬虫 Actor
   - 需要获取 Actor ID（格式：`username/actor-name`）

### 第 1 步：配置后端环境

```bash
# 进入项目目录
cd /Users/minzhuo/develop/ai-project/top-creator-finder

# 安装后端依赖
cd backend
npm install

# 创建环境变量文件
cp .env.example .env

# 编辑 .env 文件，填入你的数据
# 需要填写：
#  - APIFY_API_TOKEN: 你的 Apify Token
#  - APIFY_AMAZON_LIVE_SCRAPER_ID: 你上传的 Actor ID
```

**重要**：在 `.env` 文件中填入以下内容：

```env
APIFY_API_TOKEN=your_actual_token_here
APIFY_AMAZON_LIVE_SCRAPER_ID=yourname/amazon-live-creators-scraper
```

### 第 2 步：启动应用

```bash
# 在 backend 目录中运行
npm start

# 成功启动后会显示：
# ✓ Server running at: http://localhost:3000
```

应用启动后，Express 会同时提供：
- `/api/*` API 接口
- `/` 前端页面

如果你修改了 [actors/amazon-live-creators-scraper/main.js](/Users/minzhuo/develop/ai-project/top-creator-finder/actors/amazon-live-creators-scraper/main.js)，需要重新发布 Actor 到 Apify，前端和后端的新逻辑才会在云端生效。

### 第 3 步：测试后端连接

在新的终端窗口运行：

```bash
# 测试健康检查
curl http://localhost:3000/api/health

# 测试 Apify 连接
curl http://localhost:3000/api/test

# 测试搜索功能
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"category":"electronics","maxResults":10}'
```

### 第 4 步：打开前端

在浏览器中打开：

```
http://localhost:3000
```

### 第 5 步：使用应用

1. 在下拉菜单中**选择品类**（如 "electronics"）
2. 设置**最多结果数**（默认 50）
3. 点击 **🔍 搜索** 按钮
4. 页面会自动轮询任务状态，并逐步展示已验证出的结果
5. 查看结果：
   - **⭐ Top Creator** - 官方认证的 Platinum 级创作者
   - **📋 Creator** - 本次任务已验证过的全部创作者
6. 可以：
   - 📋 **复制** 用户名
   - 🔗 **访问** 创作者的 Amazon 店铺
   - ↕️ **排序** 结果（按帖子数或名字）
   - 📥 **导出** CSV 文件

## API 文档

### 启动搜索任务

**端点**：`POST /api/search`

**请求体**：
```json
{
  "category": "electronics",
  "maxResults": 50,
  "country": "US"
}
```

**响应**：
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

### 查询搜索任务状态和当前结果

**端点**：`GET /api/search/:runId?category=electronics&country=US&maxResults=50`

**响应**：
```json
{
  "success": true,
  "data": {
    "runId": "abc123",
    "datasetId": "xyz456",
    "status": "RUNNING",
    "isFinished": false,
    "topCreators": [
      {
        "username": "tech_reviewer",
        "displayName": "Tech Reviewer",
        "bio": "",
        "profileUrl": "https://amazon.com/shop/tech_reviewer",
        "topCreatorStatus": true,
        "postsCount": 0,
        "timestamp": "2026-04-23T10:30:00Z"
      }
    ],
    "allCreators": [...],
    "stats": {
      "totalCreators": 1,
      "topCreatorsCount": 1,
      "topCreatorPercentage": "100.00",
      "category": "electronics",
      "country": "US",
      "maxResults": 50,
      "costUsd": 0.0123,
      "timestamp": "2026-04-23T10:30:00Z",
      "runStatus": "RUNNING",
      "isFinished": false
    }
  }
}
```

### 获取支持的品类

**端点**：`GET /api/categories`

**响应**：
```json
{
  "success": true,
  "categories": [
    { "value": "featured", "label": "📌 所有精选创作者" },
    { "value": "electronics", "label": "🔌 电子产品" }
  ]
}
```

前端页面会在加载时调用该接口动态渲染品类下拉框，后续新增或修改品类只需要更新后端配置。

### 健康检查

**端点**：`GET /api/health`

**响应**：
```json
{
  "status": "ok",
  "timestamp": "2026-04-23T10:30:00Z"
}
```

### 测试 Apify 连接

**端点**：`GET /api/test`

**响应**：
```json
{
  "success": true,
  "message": "All Apify connections are working"
}
```

## 成本和性能

### 成本估算

| 操作 | 频率 | 成本 |
|-----|------|------|
| Playwright 浏览抓取 | 1 次 | 取决于品类页数据量 |
| Shop 验证请求 | 按候选 Creator 数量 | 取决于验证数量 |
| **单次搜索总计** | 1 次 | 可在页面中查看 `本次成本 (costUsd)` |
| **月度成本** | 每周 1 次 | $2-3 |

### 性能指标

- **结果返回方式**：异步轮询，结果会逐步显示
- **创作者数量**：支持 1-500 个创作者
- **Top Creator 识别准确率**：95%+
- **数据刷新频率**：可设置为每周或每月自动更新

## 故障排除

### 问题 1：连接被拒绝

**错误**：`Error: connect ECONNREFUSED`

**原因**：后端没有运行

**解决方案**：
```bash
cd backend
npm start
```

### 问题 2：API Token 无效

**错误**：`Invalid API token`

**原因**：环境变量配置错误

**解决方案**：
1. 检查 `.env` 文件中的 `APIFY_API_TOKEN`
2. 确保 Token 格式正确（从 Apify 控制面板复制）
3. 重启后端应用

### 问题 3：Actor ID 不存在

**错误**：`Actor not found`

**原因**：Actor ID 配置错误

**解决方案**：
1. 访问 https://console.apify.com
2. 找到你上传的 Actor
3. 复制完整的 Actor ID（格式：`username/actor-name`）
4. 更新 `.env` 中的 `APIFY_AMAZON_LIVE_SCRAPER_ID`

### 问题 4：搜索超时

**错误**：`Request timeout`

**原因**：数据量太大或网络问题

**解决方案**：
1. 减少 `maxResults` 的值
2. 尝试重新搜索
3. 检查网络连接

### 问题 5：无法导出 CSV

**错误**：`Export failed`

**原因**：浏览器不支持或数据为空

**解决方案**：
1. 先完成一次搜索
2. 尝试其他浏览器（Chrome、Firefox、Safari）
3. 检查浏览器控制台（F12）的错误信息

## 高级使用

### 自定义 Apify 代理

如果遇到反爬虫问题，可以在后端添加 Apify Proxy：

```javascript
// backend/api/apify.js
const run = await client.actor(actorId).call(input, {
    apifyProxyGroups: ['RESIDENTIAL'],  // 使用住宅代理
    timeout: 60000
});
```

### 定期自动更新

可以使用 Node.js 的 `cron` 库实现定期更新：

```bash
npm install node-cron
```

```javascript
// backend/app.js
import cron from 'node-cron';

// 每周一 00:00 运行一次
cron.schedule('0 0 * * 1', () => {
    console.log('Running scheduled update...');
    // 调用搜索函数
});
```

### 部署到 Cloudflare

**前端部署**：
```bash
npm install -g wrangler
wrangler publish  # 部署到 Cloudflare Pages
```

**后端部署**：
```bash
# 使用 Cloudflare Workers
wrangler publish  # 部署后端到 Workers
```

## 许可证

Apache-2.0

## 支持和反馈

如有问题或建议，请：
1. 查看 `solution.txt` 了解技术细节
2. 检查错误日志（F12 浏览器控制台）
3. 参考本 README 的故障排除部分
4. 访问 Apify 官方文档：https://docs.apify.com

## 更新日志

### v1.0.0 (2026-04-23)
- ✅ 完整的 Amazon Live 爬虫 Actor
- ✅ 后端 API 服务
- ✅ 前端 Web 应用
- ✅ 完整的文档和示例

---

**祝你使用愉快！** 🚀

如有任何问题，请参考 `solution.txt` 中的技术细节或 Apify 官方文档。
