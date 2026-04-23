# Amazon Live Creators Scraper

这是一个 Apify Actor，用于从 Amazon Live 按品类浏览页面爬取创作者信息。

## 功能

- ✅ 支持所有 Amazon Live 品类（electronics, fashion, beauty, fitness, food, home, garden, pets, sports 等）
- ✅ 提取创作者的 username、显示名、简介等信息
- ✅ 自动生成创作者的店铺链接
- ✅ 支持限制爬取数量
- ✅ 处理重复记录

## 输入参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|-----|------|------|-------|------|
| category | string | ✅ | - | Amazon Live 品类，如 "electronics", "fashion", "beauty" 等 |
| maxResults | integer | ❌ | 50 | 最多爬取多少个创作者（1-500） |
| startUrl | string | ❌ | - | 自定义起始 URL（高级用法） |

## 使用示例

### 输入 JSON

```json
{
  "category": "electronics",
  "maxResults": 100
}
```

### 输出示例

```json
[
  {
    "username": "tech_reviewer",
    "displayName": "Tech Reviewer",
    "bio": "Latest gadgets and tech reviews",
    "profileUrl": "https://amazon.com/shop/tech_reviewer",
    "sourceUrl": "https://www.amazon.com/live/browse/electronics",
    "scrapedAt": "2026-04-23T10:30:00Z"
  },
  {
    "username": "gadget_guru",
    "displayName": "Gadget Guru",
    "bio": "Honest product reviews",
    "profileUrl": "https://amazon.com/shop/gadget_guru",
    "sourceUrl": "https://www.amazon.com/live/browse/electronics",
    "scrapedAt": "2026-04-23T10:30:00Z"
  }
]
```

## 本地开发和测试

### 1. 安装依赖

```bash
npm install
```

### 2. 在本地运行

```bash
apify run
```

或者指定输入：

```bash
apify run --input '{"category":"electronics","maxResults":50}'
```

### 3. 查看输出

结果会保存在 `storage/datasets/default/` 目录中，可以通过 `apify logs` 查看日志。

## 部署到 Apify

### 1. 登录 Apify

```bash
apify login
```

### 2. 推送到 Apify

```bash
apify push
```

这会将 Actor 推送到 Apify 云平台。

### 3. 在 Apify 控制台中运行

访问 https://console.apify.com，找到你的 Actor，点击 "Develop" 或 "Run"。

## 技术细节

### 使用的库
- **Apify SDK**: 用于与 Apify 平台交互
- **Crawlee**: 网页爬虫框架，支持多种爬虫类型（CheerioCrawler、PlaywrightCrawler 等）
- **Cheerio**: 用于解析和提取 HTML（类似 jQuery）

### 选择 CheerioCrawler 而不是 PlaywrightCrawler 的原因
- **速度**: Cheerio 基于正则表达式，速度快
- **成本**: 不需要启动浏览器实例，成本低
- **适用场景**: Amazon Live 页面主要是静态 HTML，不需要 JavaScript 渲染

### 如果需要 JavaScript 渲染

如果 Amazon Live 后续更改为动态渲染，可以切换到 `PlaywrightCrawler`：

```javascript
import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    launchContext: {
        launchOptions: {
            headless: true,
        },
    },
    // 其他配置...
});
```

## 常见问题

### Q: 爬虫被 Amazon 屏蔽了怎么办？

A: 可以尝试以下方法：
1. 降低并发数（已设置为 1）
2. 添加随机延迟：`navigationWaitUntil: 'networkidle2'`
3. 使用代理（需要配置 Apify Proxy）
4. 调整 User-Agent

### Q: 爬不到创作者信息怎么办？

A: Amazon 可能更改了页面结构。需要：
1. 手动访问 https://www.amazon.com/live/browse/[category]
2. 查看 HTML 源代码，找到创作者信息的选择器
3. 更新 `main.js` 中的 CSS 选择器

## 成本估算

- 按 Apify 计费标准，1 次爬虫运行（50 个创作者）约 $0.01-0.05
- 如果每天运行一次，月成本约 $0.30-1.50

## 许可证

Apache-2.0

## 联系方式

如有问题，请提交 Issue 或 Pull Request。
