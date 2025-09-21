import { ConvexHttpClient } from "convex/browser";
import cron from 'node-cron';
import dotenv from 'dotenv';
import { scrapeVlrMatches } from './syncMatchData.js';

// Load environment variables from a .env file
dotenv.config({ path: '.env.local' });

/**
 * The main function to scrape and sync matches with Convex.
 */
async function syncMatches() {
    console.log('🚀 Starting VLR.gg scraper worker...');

    // Get the Convex URL from environment variables using Node's process.env
    const CONVEX_URL = process.env.CONVEX_URL;
    if (!CONVEX_URL) {
        console.error("❌ CONVEX_URL environment variable is not set.");
        // In a cron job, throwing an error is better than process.exit()
        throw new Error("CONVEX_URL is a required environment variable.");
    }

    const client = new ConvexHttpClient(CONVEX_URL);

    try {
        // 1. Scrape matches from VLR.gg
        console.log('📡 Scraping VLR.gg matches...');
        const { matches, scrapedAt } = await scrapeVlrMatches({
            includeLive: true,
            includeUpcoming: true,
            includeCompleted: true,
            maxResults: 50,
        });
        console.log(`📊 Scraped ${matches.length} matches at ${scrapedAt}`);

        if (matches.length === 0) {
            console.log("No matches found to sync. Exiting task.");
            return;
        }

        // 2. Align scraped data with the Convex schema
        const matchesForConvex = matches.map(match => ({
            vlrId: match.id,
            url: match.url,
            status: match.status,
            time: match.time,
            team1: match.team1,
            team2: match.team2,
            event: match.event
        }));

        // 3. Send the batch to the Convex mutation
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
        console.error('❌ Worker task failed:', error);
    }
}

// Schedule the task to run every minute using node-cron.
cron.schedule('* * * * *', () => {
    console.log('🕒 Cron job triggered. Running syncMatches task.');
    syncMatches();
});

console.log('✅ Node.js worker started. Cron job scheduled to run every minute.');