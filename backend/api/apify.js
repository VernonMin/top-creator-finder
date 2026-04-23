import { upsertRun } from '../db.js';

const BASE_URL = 'https://api.apify.com/v2';
const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

function authHeader() {
    return { 'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}` };
}

function actorPath() {
    return process.env.APIFY_AMAZON_LIVE_SCRAPER_ID.replace('/', '~');
}

async function apifyGet(path) {
    const res = await fetch(`${BASE_URL}${path}`, { headers: authHeader() });
    if (!res.ok) throw new Error(`Apify GET ${path} → ${res.status}`);
    const json = await res.json();
    return Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
}

async function apifyPost(path, body) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Apify POST ${path} → ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()).data;
}

function mapActorItem(item) {
    return {
        username: item.username,
        displayName: item.displayName || item.username,
        profileUrl: item.shopUrl || `https://www.amazon.com/shop/${item.username}`,
        topCreatorStatus: Boolean(item.isTopCreator),
        bio: '',
        postsCount: 0,
        timestamp: item.scrapedAt || new Date().toISOString(),
    };
}

function buildSearchPayload(items, { category, country, maxResults, run }) {
    const allCreators = items
        .filter((item) => item.username)
        .map(mapActorItem);
    const topCreators = allCreators.filter((item) => item.topCreatorStatus);
    const costUsd = typeof run.usageTotalUsd === 'number' ? run.usageTotalUsd : null;

    const stats = {
        totalCreators: allCreators.length,
        topCreatorsCount: topCreators.length,
        topCreatorPercentage: allCreators.length > 0
            ? ((topCreators.length / allCreators.length) * 100).toFixed(2)
            : '0.00',
        category,
        country,
        maxResults,
        costUsd,
        timestamp: new Date().toISOString(),
        runStatus: run.status,
        isFinished: TERMINAL_STATUSES.has(run.status),
    };

    return {
        runId: run.id,
        datasetId: run.defaultDatasetId,
        status: run.status,
        isFinished: TERMINAL_STATUSES.has(run.status),
        topCreators,
        allCreators,
        stats,
        category,
        country,
        maxResults,
    };
}

async function getDatasetItems(datasetId) {
    if (!datasetId) {
        return [];
    }

    const dataset = await apifyGet(`/datasets/${datasetId}/items?clean=true`);
    return Array.isArray(dataset) ? dataset : (dataset.items || []);
}

export async function startTopCreatorsSearch(category, maxResults = 50, country = 'US') {
    console.log(`[Apify] Starting actor: category=${category} maxResults=${maxResults}`);

    const run = await apifyPost(`/acts/${actorPath()}/runs?timeout=600&memory=2048`, { category, maxResults });
    console.log(`[Apify] Run started: ${run.id} (status: ${run.status})`);

    await upsertRun({
        runId: run.id,
        category,
        maxResults,
        country,
        status: run.status,
        topCreatorsCount: 0,
        totalCreators: 0,
        costUsd: null,
        isFinished: false,
    });

    return {
        runId: run.id,
        datasetId: run.defaultDatasetId,
        status: run.status,
        isFinished: TERMINAL_STATUSES.has(run.status),
        category,
        country,
        maxResults,
    };
}

export async function getTopCreatorsSearchStatus(runId, category, maxResults = 50, country = 'US') {
    const run = await apifyGet(`/acts/${actorPath()}/runs/${runId}`);
    const items = await getDatasetItems(run.defaultDatasetId);

    console.log(`[Apify] Run ${runId}: ${run.status} (${items.length} result(s))`);

    const payload = buildSearchPayload(items, { category, country, maxResults, run });

    await upsertRun({
        runId,
        category,
        maxResults,
        country,
        status: run.status,
        topCreatorsCount: payload.stats.topCreatorsCount,
        totalCreators: payload.stats.totalCreators,
        costUsd: payload.stats.costUsd,
        isFinished: payload.isFinished,
    });

    return payload;
}

export async function testApifyConnection() {
    console.log('[Apify] Testing connection...');
    try {
        const actor = await apifyGet(`/acts/${actorPath()}`);
        console.log(`✓ Actor found: ${actor.name}`);
        return true;
    } catch (error) {
        console.error('[Apify] Connection test failed:', error.message);
        return false;
    }
}
