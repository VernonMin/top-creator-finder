/**
 * Top Creator Finder - 后端应用
 *
 * 这是 Express.js 服务器的入口文件
 * 负责处理 HTTP 请求、调用 Apify API、返回结果
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './api/routes.js';

// 加载环境变量
dotenv.config();

// 验证必需的环境变量
const requiredEnvVars = [
    'APIFY_API_TOKEN',
    'APIFY_AMAZON_LIVE_SCRAPER_ID',
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingEnvVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease create a .env file based on .env.example');
    process.exit(1);
}

// 创建 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// ============================================
// 中间件配置
// ============================================

// 解析 JSON 请求体
app.use(express.json());

// 解析 URL 编码请求体
app.use(express.urlencoded({ extended: true }));

// CORS 配置（允许前端跨域请求）
// 注意：需要 trim() 去除空格，避免匹配失败
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim());

console.log('✓ CORS enabled for origins:', corsOrigins);

app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 请求日志中间件
app.use((req, res, next) => {
    console.log(`\n${new Date().toISOString()} - ${req.method} ${req.path}`);
    if (Object.keys(req.body).length > 0) {
        console.log('  Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// ============================================
// 路由配置
// ============================================

// API 路由
app.use('/api', apiRoutes);

// 根路由
app.get('/', (req, res) => {
    return res.json({
        name: 'Top Creator Finder Backend',
        version: '1.0.0',
        description: 'Backend API for finding Amazon Top Creators',
        endpoints: {
            'POST /api/search': '搜索 Top Creator（传入品类）',
            'GET /api/categories': '获取所有支持的品类',
            'GET /api/health': '健康检查',
            'GET /api/test': '测试 Apify 连接'
        }
    });
});

// ============================================
// 错误处理
// ============================================

// 处理 404 错误
app.use((req, res) => {
    return res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.path}`
    });
});

// 全局错误处理
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================
// 启动服务器
// ============================================

app.listen(PORT, HOST, () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   Top Creator Finder Backend Started   ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log(`✓ Server running at: http://${HOST}:${PORT}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✓ API Token: ${process.env.APIFY_API_TOKEN ? 'Configured' : '❌ Missing'}`);
    console.log(`✓ Amazon Live Scraper: ${process.env.APIFY_AMAZON_LIVE_SCRAPER_ID || '❌ Not configured'}`);
    console.log(`\nℹ️  Test the API: curl http://${HOST}:${PORT}/api/health`);
    console.log(`ℹ️  Test Apify connection: curl http://${HOST}:${PORT}/api/test\n`);
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n\n✓ Shutting down gracefully...');
    process.exit(0);
});
