import { ConvexHttpClient } from "convex/browser";
import { getVlrMatchDetails, getMatchUrlsFromMainPage, getMatchUrlsFromResultsPage } from '../scrapeMatchData.js';
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

        // 1. Get match URLs from main page and results pages
        console.log('📡 Getting match URLs from VLR.gg...');
        const matchUrls = [];

        // Get live/upcoming matches from main page
        const mainPageUrls = await getMatchUrlsFromMainPage();
        matchUrls.push(...mainPageUrls);

        // Get completed matches from results pages
        for (let page = 1; page <= 1; page++) {
            const pageUrls = await getMatchUrlsFromResultsPage(page);
            matchUrls.push(...pageUrls);
        }

        // Remove duplicates
        const uniqueMatchUrls = [...new Set(matchUrls)];
        console.log(`📊 Found ${uniqueMatchUrls.length} match URLs (${mainPageUrls.length} from main page, ${matchUrls.length - mainPageUrls.length} from results pages)`);

        if (uniqueMatchUrls.length === 0) {
            console.log("No matches found to sync. Exiting.");
            return { success: true, message: "No matches found." };
        }

        // 2. Process each match individually with the new unified schema
        console.log('🔄 Processing matches with new unified schema...');
        let processedCount = 0;
        let errorCount = 0;

        for (const matchUrl of uniqueMatchUrls) {
            try {
                const vlrId = matchUrl.split('/')[3];
                // Get detailed match data
                const detailedMatch = await getVlrMatchDetails(matchUrl);
                if (!detailedMatch) {
                    console.warn(`⚠️ Skipping match ${vlrId}: failed to get detailed data`);
                    errorCount++;
                    continue;
                }

                // Call the Convex mutation for each match
                const result = await client.mutation("matches:upsertMatch", {
                    match: detailedMatch,
                    apiKey: process.env.CONVEX_API_KEY
                });

                if (result.success) {
                    processedCount++;
                    console.log(`✅ ${result.status}: ${vlrId}`);
                }
            } catch (error) {
                console.error(`❌ Error processing match:`, error.message);
                errorCount++;
            }
        }

        // 3. Log results
        console.log('✅ Sync completed:');
        console.log(`  - Processed: ${processedCount}`);
        console.log(`  - Errors: ${errorCount}`);

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