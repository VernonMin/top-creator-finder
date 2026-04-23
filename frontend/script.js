/**
 * Top Creator Finder - 前端逻辑
 *
 * 功能：
 * 1. 调用后端 API 搜索 Top Creator
 * 2. 处理和展示结果
 * 3. 提供交互功能（排序、筛选、导出）
 */

// ============================================
// 配置
// ============================================

// API 地址使用同源相对路径，便于和后端一起部署
const API_BASE_URL = '/api';
const POLL_INTERVAL_MS = 5000;

// DOM 元素缓存
const DOM = {
    categorySelect: document.getElementById('category'),
    maxResultsInput: document.getElementById('maxResults'),
    searchBtn: document.getElementById('searchBtn'),
    errorMessage: document.getElementById('errorMessage'),
    statsContainer: document.getElementById('statsContainer'),
    resultsSection: document.getElementById('resultsSection'),
    loadingContainer: document.getElementById('loadingContainer'),
    loadingStatusText: document.getElementById('loadingStatusText'),
    loadingTipsText: document.getElementById('loadingTipsText'),
    copyToast: document.getElementById('copyToast'),
    apiUrl: document.getElementById('apiUrl'),

    // 标签页
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),

    // 表格
    topCreatorsBody: document.getElementById('topCreatorsBody'),
    allCreatorsBody: document.getElementById('allCreatorsBody'),
    topCreatorsEmpty: document.getElementById('topCreatorsEmpty'),
    allCreatorsEmpty: document.getElementById('allCreatorsEmpty'),

    // 统计信息
    totalCreators: document.getElementById('totalCreators'),
    topCreatorsCount: document.getElementById('topCreatorsCount'),
    topCreatorPercentage: document.getElementById('topCreatorPercentage'),
    runCost: document.getElementById('runCost'),
    updateTime: document.getElementById('updateTime'),

    // 计数
    topCount: document.getElementById('topCount'),
    allCount: document.getElementById('allCount'),

    // 按钮
    exportBtn: document.getElementById('exportBtn'),
    sortBtn: document.getElementById('sortBtn')
};

// 全局状态
const state = {
    currentResults: null,
    currentSearch: null,
    currentTab: 'top-creators',
    sortBy: 'posts', // 'posts' 或 'name'
    pollTimer: null,
};

// ============================================
// 初始化
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded, initializing...');

    // 设置 API 地址显示
    DOM.apiUrl.textContent = API_BASE_URL;

    // 事件监听
    DOM.searchBtn.addEventListener('click', handleSearch);
    DOM.exportBtn.addEventListener('click', exportToCSV);
    DOM.sortBtn.addEventListener('click', toggleSort);

    // 标签页切换
    DOM.tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    // 回车键搜索
    DOM.maxResultsInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    loadCategories();

    console.log('✓ Initialization complete');
});

// ============================================
// 搜索功能
// ============================================

/**
 * 处理搜索按钮点击
 */
async function handleSearch() {
    const category = DOM.categorySelect.value.trim();
    const maxResults = parseInt(DOM.maxResultsInput.value) || 1;

    // 验证输入
    if (!category) {
        showError('请选择一个品类');
        return;
    }

    if (maxResults < 1 || maxResults > 500) {
        showError('结果数必须在 1 到 500 之间');
        return;
    }

    // 开始搜索
    await search(category, maxResults);
}

/**
 * 执行搜索
 */
async function search(category, maxResults) {
    console.log(`Searching for category: ${category}, maxResults: ${maxResults}`);

    // 隐藏错误提示
    hideError();
    stopPolling();

    // 显示加载提示
    showLoading(true);
    DOM.resultsSection.style.display = 'none';
    DOM.statsContainer.style.display = 'none';
    updateLoadingText('正在启动抓取任务...', '任务启动后会自动轮询最新结果');

    try {
        const response = await fetch(`${API_BASE_URL}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                category: category,
                maxResults: maxResults,
                country: 'US'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Unknown error');
        }

        state.currentSearch = {
            runId: data.data.runId,
            category,
            country: 'US',
            maxResults,
        };

        updateLoadingText(
            `任务已启动，正在抓取 ${category} 类目创作者...`,
            `任务 ID: ${data.data.runId}`
        );

        const shouldContinuePolling = await pollSearchStatus();
        if (shouldContinuePolling) {
            state.pollTimer = window.setInterval(pollSearchStatus, POLL_INTERVAL_MS);
        }

    } catch (error) {
        console.error('Search error:', error);
        showError(`搜索失败：${error.message}`);
        showLoading(false);
    } finally {
        // 轮询模式下，由 pollSearchStatus 控制何时结束 loading
    }
}

async function pollSearchStatus() {
    if (!state.currentSearch) {
        return false;
    }

    const { runId, category, country, maxResults } = state.currentSearch;

    try {
        const params = new URLSearchParams({
            category,
            country,
            maxResults: String(maxResults),
        });

        const response = await fetch(`${API_BASE_URL}/search/${runId}?${params.toString()}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (!payload.success) {
            throw new Error(payload.error || 'Unknown error');
        }

        const data = payload.data;
        state.currentResults = data;
        displayResults(data);

        if (data.isFinished) {
            stopPolling();
            showLoading(false);

            if (data.status !== 'SUCCEEDED') {
                showError(`任务结束，状态为 ${data.status}`);
            } else {
                updateLoadingText('抓取完成', `共找到 ${data.topCreators.length} 个 Top Creator`);
            }
            return false;
        }

        updateLoadingText(
            `任务运行中：${data.status}`,
            `已发现 ${data.topCreators.length} 个 Top Creator，页面会自动刷新`
        );
        return true;
    } catch (error) {
        stopPolling();
        showLoading(false);
        console.error('Polling error:', error);
        showError(`查询任务状态失败：${error.message}`);
        return false;
    }
}

async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/categories`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data.success || !Array.isArray(data.categories)) {
            throw new Error('Invalid categories response');
        }

        renderCategories(data.categories);
    } catch (error) {
        console.error('Failed to load categories:', error);
        showError('加载品类列表失败，请刷新页面重试');
    }
}

function renderCategories(categories) {
    const placeholder = '<option value="">-- 选择一个品类 --</option>';
    const options = categories.map(({ value, label }) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
    );

    DOM.categorySelect.innerHTML = placeholder + options.join('');
}

// ============================================
// 结果展示
// ============================================

/**
 * 展示搜索结果
 */
function displayResults(data) {
    console.log('Displaying results:', data);

    const { topCreators, allCreators, stats } = data;

    // 更新统计信息
    DOM.totalCreators.textContent = stats.totalCreators;
    DOM.topCreatorsCount.textContent = stats.topCreatorsCount;
    DOM.topCreatorPercentage.textContent = stats.topCreatorPercentage + '%';
    DOM.runCost.textContent = formatCost(stats.costUsd);
    DOM.updateTime.textContent = formatTime(stats.timestamp);

    // 更新计数
    DOM.topCount.textContent = topCreators.length;
    DOM.allCount.textContent = allCreators.length;

    // 渲染表格
    renderTable(topCreators, 'topCreators');
    renderTable(allCreators, 'allCreators');

    // 显示结果区域
    DOM.resultsSection.style.display = 'block';
    DOM.statsContainer.style.display = 'grid';

    // 切换到 Top Creator 标签
    switchTab('top-creators');

    // 滚动到结果
    setTimeout(() => {
        DOM.resultsSection.scrollIntoView({ behavior: 'smooth' });
    }, 300);
}

/**
 * 渲染表格
 */
function renderTable(creators, type) {
    const tbody = DOM[type + 'Body'];
    const emptyEl = DOM[type + 'Empty'];

    // 清空表格
    tbody.innerHTML = '';

    if (creators.length === 0) {
        emptyEl.style.display = 'block';
        return;
    }

    emptyEl.style.display = 'none';

    // 按排序方式排序
    const sorted = [...creators].sort((a, b) => {
        if (state.sortBy === 'posts') {
            return (b.postsCount || 0) - (a.postsCount || 0);
        } else {
            return (a.displayName || '').localeCompare(b.displayName || '');
        }
    });

    // 生成行
    sorted.forEach((creator, index) => {
        const row = createCreatorRow(creator, index);
        tbody.appendChild(row);
    });

    console.log(`✓ Rendered ${creators.length} creators in table: ${type}`);
}

/**
 * 创建创作者行
 */
function createCreatorRow(creator, index) {
    const row = document.createElement('tr');

    // 截断简介
    const truncatedBio = creator.bio ? creator.bio.substring(0, 60) : '-';
    const fullBio = creator.bio || '-';

    row.innerHTML = `
        <td>
            <a href="${creator.profileUrl}" target="_blank" class="username-link">
                ${escapeHtml(creator.username)}
            </a>
        </td>
        <td>${escapeHtml(creator.displayName)}</td>
        <td>
            <span class="text-truncate" title="${escapeHtml(fullBio)}">
                ${escapeHtml(truncatedBio)}${creator.bio && creator.bio.length > 60 ? '...' : ''}
            </span>
        </td>
        <td>
            <strong>${creator.postsCount || 0}</strong>
        </td>
        <td>
            <div class="action-buttons">
                <button class="btn btn-secondary action-btn" onclick="copyToClipboard('${creator.username}')">
                    📋 复制
                </button>
                <a href="${creator.profileUrl}" target="_blank" class="btn btn-secondary action-btn">
                    🔗 店铺
                </a>
            </div>
        </td>
    `;

    return row;
}

// ============================================
// 交互功能
// ============================================

/**
 * 切换标签页
 */
function switchTab(tabName) {
    state.currentTab = tabName;

    // 更新按钮状态
    DOM.tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // 更新内容显示
    DOM.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === tabName);
    });

    console.log(`Switched to tab: ${tabName}`);
}

/**
 * 切换排序方式
 */
function toggleSort() {
    state.sortBy = state.sortBy === 'posts' ? 'name' : 'posts';

    if (state.currentResults) {
        const { topCreators, allCreators } = state.currentResults;
        renderTable(topCreators, 'topCreators');
        renderTable(allCreators, 'allCreators');
    }

    const sortText = state.sortBy === 'posts' ? '↕️ 按热度排序' : '↕️ 按名字排序';
    DOM.sortBtn.textContent = sortText;

    console.log(`Sort changed to: ${state.sortBy}`);
}

/**
 * 复制到剪贴板
 */
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // 显示 toast
        DOM.copyToast.style.display = 'block';
        setTimeout(() => {
            DOM.copyToast.style.display = 'none';
        }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
        alert('复制失败，请手动复制');
    });
}

/**
 * 导出为 CSV
 */
function exportToCSV() {
    if (!state.currentResults) {
        showError('没有数据可导出');
        return;
    }

    const { topCreators, allCreators, stats } = state.currentResults;

    // 选择要导出的数据
    const dataToExport = state.currentTab === 'top-creators' ? topCreators : allCreators;

    // CSV 头
    const headers = ['用户名', '显示名', '简介', '帖子数', '店铺链接'];
    const csvContent = [
        headers.join(','),
        ...dataToExport.map(creator =>
            [
                creator.username,
                creator.displayName,
                creator.bio ? `"${creator.bio.replace(/"/g, '""')}"` : '',
                creator.postsCount || 0,
                creator.profileUrl
            ].join(',')
        )
    ].join('\n');

    // 创建 blob 和下载链接
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const fileName = `top-creators-${stats.category}-${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`✓ Exported ${dataToExport.length} creators to ${fileName}`);
}

// ============================================
// UI 状态函数
// ============================================

/**
 * 显示加载提示
 */
function showLoading(show) {
    DOM.loadingContainer.style.display = show ? 'block' : 'none';
    DOM.searchBtn.disabled = show;
    DOM.categorySelect.disabled = show;
    DOM.maxResultsInput.disabled = show;

    if (show) {
        const btn = DOM.searchBtn;
        btn.querySelector('.btn-text').style.display = 'none';
        btn.querySelector('.spinner').style.display = 'inline-block';
    } else {
        const btn = DOM.searchBtn;
        btn.querySelector('.btn-text').style.display = 'inline';
        btn.querySelector('.spinner').style.display = 'none';
    }
}

function updateLoadingText(status, tips) {
    DOM.loadingStatusText.textContent = status;
    DOM.loadingTipsText.textContent = tips;
}

/**
 * 显示错误提示
 */
function showError(message) {
    DOM.errorMessage.textContent = message;
    DOM.errorMessage.style.display = 'block';
}

/**
 * 隐藏错误提示
 */
function hideError() {
    DOM.errorMessage.style.display = 'none';
}

function stopPolling() {
    if (state.pollTimer) {
        window.clearInterval(state.pollTimer);
        state.pollTimer = null;
    }
}

// ============================================
// 工具函数
// ============================================

/**
 * 转义 HTML 特殊字符
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * 格式化时间
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function formatCost(costUsd) {
    if (typeof costUsd !== 'number' || Number.isNaN(costUsd)) {
        return '$0.00';
    }

    return `$${costUsd.toFixed(4)}`;
}

console.log('✓ Script loaded');
