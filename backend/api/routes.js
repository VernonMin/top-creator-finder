/**
 * API 路由定义
 *
 * 定义了应用的所有 API 端点
 */

import express from 'express';
import {
    getTopCreatorsByCategory,
    testApifyConnection
} from './apify.js';

const router = express.Router();

/**
 * POST /api/search
 * 根据品类搜索 Top Creator
 *
 * 请求体：
 * {
 *   "category": "electronics",  // 品类（必需）
 *   "maxResults": 50,           // 最多结果数（可选，默认50）
 *   "country": "US"             // 国家代码（可选，默认US）
 * }
 *
 * 返回：
 * {
 *   "success": true,
 *   "data": {
 *     "topCreators": [...],
 *     "allCreators": [...],
 *     "stats": {...}
 *   }
 * }
 *
 * 错误返回：
 * {
 *   "success": false,
 *   "error": "错误信息"
 * }
 */
router.post('/search', async (req, res) => {
    try {
        const { category, maxResults = 50, country = 'US' } = req.body;

        // 验证必需参数
        if (!category || typeof category !== 'string' || category.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Missing or invalid "category" parameter'
            });
        }

        // 验证 maxResults 范围
        const max = Math.min(parseInt(maxResults) || 50, 500);
        if (max < 1) {
            return res.status(400).json({
                success: false,
                error: 'maxResults must be at least 1'
            });
        }

        console.log(`\n[API] POST /api/search - category: ${category}, maxResults: ${max}`);

        // 调用 Apify 获取数据
        const result = await getTopCreatorsByCategory(category, max, country);

        // 返回成功结果
        return res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('[API] Error in /api/search:', error);

        // 返回错误
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

/**
 * GET /api/categories
 * 获取所有支持的品类列表
 *
 * 返回：
 * {
 *   "success": true,
 *   "categories": ["electronics", "fashion", "beauty", ...]
 * }
 */
router.get('/categories', (req, res) => {
    // 支持的品类列表（基于 Amazon Live）
    const categories = [
        'featured',     // 所有精选创作者
        'electronics',
        'fashion',
        'beauty',
        'fitness',
        'food',
        'home',
        'garden',
        'pets',
        'sports',
        'toys',
        'books',
        'music',
        'movies',
        'jewelry'
    ];

    return res.json({
        success: true,
        categories: categories
    });
});

/**
 * GET /api/health
 * 健康检查
 *
 * 返回：
 * {
 *   "status": "ok",
 *   "timestamp": "2026-04-23T10:30:00Z"
 * }
 */
router.get('/health', (req, res) => {
    return res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /api/test
 * 测试 Apify 连接
 *
 * 这是一个调试端点，用于验证 Apify 配置是否正确
 *
 * 返回：
 * {
 *   "success": true,
 *   "message": "All Apify connections are working"
 * }
 */
router.get('/test', async (req, res) => {
    try {
        console.log('[API] GET /api/test - Testing Apify connection');

        const isConnected = await testApifyConnection();

        if (isConnected) {
            return res.json({
                success: true,
                message: 'All Apify connections are working'
            });
        } else {
            return res.status(500).json({
                success: false,
                message: 'Apify connection test failed. Check logs for details.'
            });
        }

    } catch (error) {
        console.error('[API] Error in /api/test:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * 错误处理中间件
 * 处理 404 和其他错误
 */
router.use((req, res) => {
    return res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.path}`
    });
});

export default router;
