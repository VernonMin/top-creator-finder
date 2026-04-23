/**
 * API 路由定义
 *
 * 定义了应用的所有 API 端点
 */

import express from 'express';
import {
    getTopCreatorsSearchStatus,
    startTopCreatorsSearch,
    testApifyConnection
} from './apify.js';
import { categories } from '../config/categories.js';
import { getHistory } from '../db.js';

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
 * 返回任务信息，前端随后轮询 GET /api/search/:runId
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

        const result = await startTopCreatorsSearch(category, max, country);

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

router.get('/search/:runId', async (req, res) => {
    try {
        const { runId } = req.params;
        const { category, country = 'US', maxResults = 50 } = req.query;

        if (!runId || typeof runId !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Missing or invalid "runId" parameter'
            });
        }

        if (!category || typeof category !== 'string' || category.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Missing or invalid "category" query parameter'
            });
        }

        const max = Math.min(parseInt(maxResults) || 50, 500);
        if (max < 1) {
            return res.status(400).json({
                success: false,
                error: 'maxResults must be at least 1'
            });
        }

        const result = await getTopCreatorsSearchStatus(runId, category, max, country);

        return res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('[API] Error in GET /api/search/:runId:', error);
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
router.get('/history', async (req, res) => {
    try {
        const runs = await getHistory(30);
        return res.json({ success: true, runs });
    } catch (error) {
        console.error('[API] Error in GET /api/history:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/categories', (req, res) => {
    return res.json({
        success: true,
        categories
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
