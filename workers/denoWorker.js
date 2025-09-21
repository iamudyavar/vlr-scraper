import { ConvexHttpClient } from "convex/browser";
import { scrapeVlrMatches } from './syncMatchData.js';

/**
 * Handler for Deno Deploy Cron Trigger. Scrapes and syncs matches with Convex.
 */
async function handleScheduled() {
    console.log('🚀 Starting VLR.gg scraper worker...');

    // Get the Convex URL from environment variables.
    // Deno Deploy requires this to be accessed via Deno.env.
    const CONVEX_URL = Deno.env.get('CONVEX_URL');
    if (!CONVEX_URL) {
        console.error("❌ CONVEX_URL environment variable is not set.");
        throw new Error("CONVEX_URL is a required environment variable.");
    }

    // Initialize Convex client using the environment variable.
    const client = new ConvexHttpClient(CONVEX_URL);

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

// Define the cron job for Deno Deploy.
Deno.cron(
    "VLR Valorant Scraper",
    "* * * * *",      // Schedule: every minute
    handleScheduled   // The handler function to execute
);