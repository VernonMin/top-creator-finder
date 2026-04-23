import { createClient } from '@supabase/supabase-js';

let supabase = null;

function getClient() {
    if (supabase) return supabase;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
        console.warn('[DB] SUPABASE_URL or SUPABASE_ANON_KEY not set — history disabled');
        return null;
    }
    supabase = createClient(url, key);
    return supabase;
}

export async function upsertRun({ runId, category, maxResults, country, status, topCreatorsCount, totalCreators, costUsd, isFinished, creators }) {
    const client = getClient();
    if (!client) return;

    const row = {
        id: runId,
        category,
        max_results: maxResults,
        country: country || 'US',
        status,
        top_creators_count: topCreatorsCount || 0,
        total_creators: totalCreators || 0,
        cost_usd: costUsd ?? null,
        is_finished: isFinished,
        ...(creators ? { creators } : {}),
        ...(isFinished ? { finished_at: new Date().toISOString() } : {}),
    };

    const { error } = await client.from('run_history').upsert(row);
    if (error) console.error('[DB] upsertRun error:', error.message);
}

export async function getHistory(limit = 30) {
    const client = getClient();
    if (!client) return [];

    const { data, error } = await client
        .from('run_history')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[DB] getHistory error:', error.message);
        return [];
    }
    return data || [];
}
