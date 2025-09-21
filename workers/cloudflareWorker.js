import { ConvexHttpClient } from "convex/browser";
import { scrapeVlrMatches } from './syncMatchData.js';

/**
 * Handler for Cloudflare Worker Cron Trigger. Scrapes and syncs matches with Convex.
 * @param {ScheduledController} controller - The controller for the scheduled event.
 * @param {object} env - Environment variables (secrets).
 * @param {ExecutionContext} ctx - The execution context.
 */
export default {
    async scheduled(controller, env, ctx) {
        console.log('🚀 Starting VLR.gg scraper worker...');

        // Initialize Convex client using the secret URL from Cloudflare environment
        const client = new ConvexHttpClient(env.CONVEX_URL);

        try {
            // 1. Scrape all matches from VLR.gg
            console.log('📡 Scraping VLR.gg matches...');
            const { matches, scrapedAt } = await scrapeVlrMatches({
                includeLive: true,
                includeUpcoming: true,
                includeCompleted: true,
                maxResults: 50,
            });
            console.log(`📊 Scraped ${matches.length} matches at ${scrapedAt}`);

            if (matches.length === 0) {
                console.log("No matches found to sync. Exiting.");
                return;
            }

            // 2. Align scraped data with the schema (id -> vlrId)
            const matchesForConvex = matches.map(match => ({
                vlrId: match.id,
                url: match.url,
                status: match.status,
                time: match.time,
                team1: match.team1,
                team2: match.team2,
                event: match.event
            }));

            // 3. Send the entire batch to our Convex mutation in a single call
            console.log('🔄 Syncing with Convex database...');
            const syncResults = await client.mutation("matches:upsertBatch", {
                scrapedMatches: matchesForConvex,
            });

            // 4. Log the results
            console.log('✅ Sync completed:');
            console.log(`  - Inserted: ${syncResults.inserted}`);
            console.log(`  - Updated: ${syncResults.updated}`);
            console.log(`  - Unchanged: ${syncResults.unchanged}`);

        } catch (error) {
            console.error('❌ Worker failed:', error);
        }
    }
};