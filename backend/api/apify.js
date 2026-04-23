const BASE_URL = 'https://api.apify.com/v2';

function authHeader() {
    return { 'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}` };
}

function actorPath() {
    return process.env.APIFY_AMAZON_LIVE_SCRAPER_ID.replace('/', '~');
}

async function apifyGet(path) {
    const res = await fetch(`${BASE_URL}${path}`, { headers: authHeader() });
    if (!res.ok) throw new Error(`Apify GET ${path} → ${res.status}`);
    return (await res.json()).data;
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

async function waitForRun(runId, timeoutMs = 600_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5000));
        const run = await apifyGet(`/acts/${actorPath()}/runs/${runId}`);
        console.log(`[Apify] Run ${runId}: ${run.status}`);
        if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
            return run;
        }
    }
    throw new Error(`Run ${runId} did not finish within timeout`);
}

/**
 * Run the actor and return verified Top Creators.
 */
export async function findTopCreators(category, maxResults = 50) {
    console.log(`[Apify] Starting actor: category=${category} maxResults=${maxResults}`);

    const run = await apifyPost(`/acts/${actorPath()}/runs`, { category, maxResults });
    console.log(`[Apify] Run started: ${run.id} (status: ${run.status})`);

    const finished = await waitForRun(run.id);
    if (finished.status !== 'SUCCEEDED') {
        throw new Error(`Actor run ${run.id} ended with status: ${finished.status}`);
    }

    const dataset = await apifyGet(`/datasets/${finished.defaultDatasetId}/items?clean=true`);
    const items = Array.isArray(dataset) ? dataset : (dataset.items || []);

    console.log(`[Apify] Retrieved ${items.length} Top Creators`);

    return items
        .filter(item => item.username)
        .map(item => ({
            username: item.username,
            displayName: item.displayName || item.username,
            profileUrl: item.shopUrl || `https://www.amazon.com/shop/${item.username}`,
            topCreatorStatus: true,
            bio: '',
            postsCount: 0,
            timestamp: item.scrapedAt || new Date().toISOString(),
        }));
}

/**
 * Entry point called by routes.js.
 */
export async function getTopCreatorsByCategory(category, maxResults = 50, country = 'US') {
    console.log(`\n[Apify] getTopCreatorsByCategory: ${category}`);

    const topCreators = await findTopCreators(category, maxResults);

    const stats = {
        totalCreators: topCreators.length,
        topCreatorsCount: topCreators.length,
        topCreatorPercentage: topCreators.length > 0 ? '100.00' : '0.00',
        category,
        country,
        timestamp: new Date().toISOString(),
    };

    console.log(`[Apify] Done. Found ${topCreators.length} Top Creators.`);

    return { topCreators, allCreators: topCreators, stats, category, country };
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
