import { ConvexHttpClient } from "convex/browser";
import { scrapeVlrMatches } from '../scrapeMatchData.js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// This script allows for testing Convex locally
async function runLocalTest() {
    if (!process.env.CONVEX_URL) {
        throw new Error("CONVEX_URL environment variable not set!");
    }
    if (!process.env.CONVEX_API_KEY) {
        throw new Error("CONVEX_API_KEY environment variable not set!");
    }

    const client = new ConvexHttpClient(process.env.CONVEX_URL);

    try {
        console.log('🚀 Starting local VLR.gg scraper test...');

        // 1. Scrape matches
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
            return { success: true, message: "No matches found." };
        }

        // 2. Align data with the schema (vlrId is already correct)
        const matchesForConvex = matches.map(match => ({
            vlrId: match.vlrId,
            url: match.url,
            status: match.status,
            time: match.time,
            team1: match.team1,
            team2: match.team2,
            event: match.event
        }));

        // 3. Call the Convex mutation
        console.log('🔄 Calling Convex mutation to sync matches...');
        const syncResults = await client.mutation("matches:upsertHighLevelMatchBatch", {
            scrapedMatches: matchesForConvex,
            apiKey: process.env.CONVEX_API_KEY
        });

        // 4. Log results
        console.log('✅ Sync completed:');
        console.log(`  - Inserted: ${syncResults.inserted}`);
        console.log(`  - Updated: ${syncResults.updated}`);
        console.log(`  - Unchanged: ${syncResults.unchanged}`);

        return { success: true, syncResults };

    } catch (error) {
        console.error('❌ Local test failed:', error);
        return { success: false, error: error.message };
    }
}

// Execute the test
runLocalTest()
    .then(result => {
        process.exit(result.success ? 0 : 1);
    });