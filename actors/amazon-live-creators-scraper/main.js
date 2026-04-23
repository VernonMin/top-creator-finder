/**
 * Amazon Live Top Creator Finder
 *
 * 4-step flow (SOLUTION.md):
 *   Step 1 — Playwright  : browse /live/browse/{category} → broadcast UUID list
 *   Step 2 — HTTP GET    : /live/broadcast/{UUID}  → filter by "Earns Revenue"
 *   Step 3 — same HTML   : extract storefront link → username
 *                          fallback: derive 4 candidates from display name
 *   Step 4 — HTTP GET    : /shop/{username}         → verify "Top Creator"
 */

import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { gotScraping } from 'got-scraping';

await Actor.init();

const input = await Actor.getInput();
if (!input?.category) {
    throw new Error('Missing required input: category');
}

const { category = 'featured', maxResults = 50 } = input;
const browseUrl = `https://www.amazon.com/live/browse/${category}`;

// US residential proxy
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
    countryCode: 'US',
});

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Step 1: Playwright — collect broadcast UUIDs ───────────────────────────

const broadcastList = []; // [{ uuid, displayName }]
const seenUUIDs = new Set();

const playwrightCrawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: 1,
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 120,
    launchContext: {
        launchOptions: {
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
    },

    async requestHandler({ page }) {
        console.log(`Step 1: Loading ${browseUrl}`);

        // Wait for page to fully load first, then wait for broadcast cards
        await page.waitForLoadState('domcontentloaded');

        // Continuously save screenshots every 1s so Live View shows near-realtime view
        let capturing = true;
        (async () => {
            while (capturing) {
                try {
                    const screenshot = await page.screenshot({ fullPage: false });
                    await Actor.setValue('SCREENSHOT', screenshot, { contentType: 'image/png' });
                } catch {}
                await sleep(1000);
            }
        })();

        try {
            await page.waitForSelector('a[href*="/live/broadcast/"]', { timeout: 60000 });
            console.log('  Broadcast cards loaded');
        } catch {
            console.log('  Selector timeout — proceeding with whatever loaded');
        }

        // Save top-of-page screenshot before scrolling
        const topScreenshot = await page.screenshot({ fullPage: false });
        await Actor.setValue('SCREENSHOT_TOP', topScreenshot, { contentType: 'image/png' });
        console.log('  Top screenshot saved');

        // Scroll to trigger lazy-loading of additional cards
        for (let i = 0; i < 10; i++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await sleep(1500);
        }

        // Stop screenshot loop
        capturing = false;

        const items = await page.$$eval('a[href*="/live/broadcast/"]', (anchors) =>
            anchors
                .filter((a) => {
                    // Exclude VOD cards — they contain duration/time-ago text in parent container
                    const card = a.closest('li, article, div[class*="card"], div[class*="Card"], div[class*="item"]') || a.parentElement;
                    const text = card?.textContent || '';
                    const isVod = /video\s*length|\d+\s*(hours?|days?|minutes?|weeks?)\s*ago/i.test(text);
                    return !isVod;
                })
                .map((a) => {
                    const m = a.href.match(/\/live\/broadcast\/([^/?#]+)/);
                    return m ? { uuid: m[1] } : null;
                })
                .filter(Boolean),
        );

        for (const item of items) {
            if (!seenUUIDs.has(item.uuid)) {
                seenUUIDs.add(item.uuid);
                broadcastList.push(item);
                console.log(`  UUID: ${item.uuid}`);
            }
        }

        console.log(`Step 1 done: ${broadcastList.length} broadcasts`);
    },
});

await playwrightCrawler.addRequests([{ url: browseUrl }]);
await playwrightCrawler.run();

if (broadcastList.length === 0) {
    console.warn('No broadcasts found — exiting');
    await Actor.exit();
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function httpGet(url) {
    console.log(`  GET ${url}`);
    try {
        const proxyUrl = await proxyConfiguration.newUrl();
        const res = await gotScraping({
            url,
            proxyUrl,
            headers: HEADERS,
            followRedirect: true,
        });
        const finalUrl = res.url;
        if (finalUrl !== url) console.log(`  → redirected to ${finalUrl}`);
        console.log(`  → ${res.statusCode} (${res.body.length} chars)`);
        return { status: res.statusCode, html: res.body, finalUrl };
    } catch (err) {
        console.log(`  → ERROR: ${err.message}`);
        return { status: 0, html: '', finalUrl: url, error: err.message };
    }
}

// ─── Step 3 helpers ──────────────────────────────────────────────────────────

// Extract username from creatorProfileLink embedded in page JSON data.
// Format in HTML: creatorProfileLink\&#034;:\&#034;/shop/{username}\&#034;
function extractStorefrontUsername(html) {
    // Primary: parse creatorProfileLink from embedded JSON (HTML-encoded)
    const jsonMatch = html.match(/creatorProfileLink[^/]{0,30}\/shop\/([^"\\&#\s\/]+)/);
    if (jsonMatch?.[1] && jsonMatch[1] !== 'info') return jsonMatch[1];

    // Fallback: standard href with strfrnt ref param
    const hrefMatch = html.match(/href="[^"]*\/shop\/([^?"\/\s]+)[^"]*strfrnt[^"]*"/i);
    if (hrefMatch?.[1]) return hrefMatch[1];

    return null;
}

// Derive username candidates from display name (fallback only).
// Rules per SOLUTION.md §4 — exactly 4 formats for names with spaces.
function deriveUsernameCandidates(displayName) {
    const cleaned = displayName
        .toLowerCase()
        .replace(/<3/g, '')
        .replace(/\p{Emoji_Presentation}/gu, '')
        .replace(/[^\w\s.]/g, '')
        .trim();

    if (!cleaned || cleaned.length < 2) return [];
    if (!cleaned.includes(' ')) return [cleaned];

    const noSpace = cleaned.replace(/\s+/g, '');
    return [
        noSpace,
        cleaned.replace(/\s+/g, '_'),
        `_${noSpace}`,
        `${noSpace}_`,
    ];
}

// ─── Steps 2-4: Process each broadcast ───────────────────────────────────────

// Phase 1: collect all unique usernames from broadcast pages
const collectedUsernames = new Set();

for (const { uuid } of broadcastList) {
    try {
        const broadcastUrl = `https://www.amazon.com/live/broadcast/${uuid}`;
        console.log(`\nCollecting from ${broadcastUrl}`);

        const { status, html } = await httpGet(broadcastUrl);

        if (status !== 200) {
            console.log(`  Skip: HTTP ${status}`);
            await sleep(500);
            continue;
        }

        // Only collect from Influencer pages (filters out brand/official accounts)
        if (!/creatorType[^a-zA-Z]{0,20}Influencer/.test(html)) {
            console.log('  Skip: not an Influencer page');
            await sleep(300);
            continue;
        }

        // Collect ALL creatorProfileLinks from this page (broadcaster + sidebar creators)
        const matches = [...html.matchAll(/creatorProfileLink[^/]{0,30}\/shop\/([^"\\&#\s\/]+)/g)];
        let added = 0;
        for (const m of matches) {
            const username = m[1];
            if (username && username !== 'info' && !collectedUsernames.has(username)) {
                collectedUsernames.add(username);
                added++;
            }
        }
        console.log(`  Collected ${added} new usernames (total: ${collectedUsernames.size})`);

        await sleep(500);

    } catch (err) {
        console.error(`Error collecting from UUID ${uuid}: ${err.message}`);
    }
}

console.log(`\nPhase 1 done: ${collectedUsernames.size} unique usernames collected`);

// Phase 2: verify Top Creator for each unique username
const topCreators = [];

for (const username of collectedUsernames) {
    if (topCreators.length >= maxResults) break;

    try {
        await sleep(600);
        const shopUrl = `https://www.amazon.com/shop/${username}`;
        console.log(`\nVerifying ${shopUrl}`);

        const { status, html, finalUrl } = await httpGet(shopUrl);

        if (status !== 200) {
            console.log(`  Skip: HTTP ${status}`);
            continue;
        }

        if (!html.includes('Top Creator')) {
            console.log('  Skip: not a Top Creator');
            continue;
        }

        // Use real username from final URL (resolves influencer-XXXXXXXX → custom username)
        const realUsername = finalUrl.match(/\/shop\/([^/?#]+)/)?.[1] || username;
        const realShopUrl = `https://www.amazon.com/shop/${realUsername}`;

        // Extract display name from shop page title
        const titleMatch = html.match(/<title>([^<|]+)/);
        const displayName = titleMatch ? titleMatch[1].replace(/ [-|:].*$/, '').trim() : realUsername;

        console.log(`  ✓ Top Creator: ${displayName} (${realUsername})`);

        topCreators.push({
            username: realUsername,
            displayName,
            shopUrl: realShopUrl,
            isTopCreator: true,
            category,
            scrapedAt: new Date().toISOString(),
        });

    } catch (err) {
        console.error(`Error verifying ${username}: ${err.message}`);
    }
}

console.log(`\n=== Done: ${topCreators.length} Top Creators ===`);

if (topCreators.length > 0) {
    await Actor.pushData(topCreators);
}

await Actor.exit();
