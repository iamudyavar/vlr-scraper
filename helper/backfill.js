import { getVlrMatchDetails, getMatchUrlsFromResultsPage } from '../scrapeMatchData.js';
import { ConvexHttpClient } from "convex/browser";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });

// =============================================================================
// Configuration
// =============================================================================
const CONVEX_URL = process.env.CONVEX_URL;

const DELAY_BETWEEN_PAGES_MS = 100;
const DELAY_BETWEEN_MATCHES_MS = 50;

const START_PAGE = 1;
const PAGES_TO_SCRAPE = 0;

// =============================================================================
// Main Backfill Logic
// =============================================================================
async function runBackfill() {
    if (!CONVEX_URL) {
        console.error("❌ CONVEX_URL environment variable is not set.");
        process.exit(1);
    }
    const client = new ConvexHttpClient(CONVEX_URL);
    console.log('🚀 Starting backfill process...');

    // Log the configuration
    if (PAGES_TO_SCRAPE) {
        console.log(`⚙️  Configuration: Starting from page ${START_PAGE} and scraping a maximum of ${PAGES_TO_SCRAPE} pages.`);
    } else {
        console.log(`⚙️  Configuration: Starting from page ${START_PAGE} and scraping all available pages.`);
    }

    let currentPage = START_PAGE;
    let consecutiveEmptyPages = 0;
    const endPage = PAGES_TO_SCRAPE ? START_PAGE + PAGES_TO_SCRAPE : Infinity;

    // Stop if we reach the page limit OR finds 3 consecutive empty pages.
    while (currentPage < endPage && consecutiveEmptyPages < 3) {
        try {
            const pageProgress = PAGES_TO_SCRAPE ? `(Page ${currentPage - START_PAGE + 1}/${PAGES_TO_SCRAPE})` : `(Page ${currentPage})`;
            console.log(`\n==================================================`);
            console.log(`[Controller] ${pageProgress} ⏳ Fetching match list...`);
            console.log(`==================================================`);

            const matchUrls = await getMatchUrlsFromResultsPage(currentPage);

            if (matchUrls.length === 0) {
                consecutiveEmptyPages++;
                console.log(`[Page ${currentPage}] ⚠️ No matches found. Consecutive empty pages: ${consecutiveEmptyPages}/3.`);
                if (consecutiveEmptyPages >= 3) {
                    console.log("\n✅🏁 Found 3 consecutive empty pages. Backfill complete!");
                    break;
                }
            } else {
                consecutiveEmptyPages = 0; // Reset counter
                console.log(`[Page ${currentPage}] ✅ Found ${matchUrls.length} matches. Processing details...`);

                for (const [index, matchUrl] of matchUrls.entries()) {
                    const vlrId = matchUrl.split('/')[3];
                    console.log(`  [${index + 1}/${matchUrls.length}] 🔎 Scraping details for match ${vlrId}...`);
                    const details = await getVlrMatchDetails(matchUrl);

                    if (details) {
                        const result = await client.mutation("matches:upsertMatch", {
                            match: details,
                            apiKey: process.env.CONVEX_API_KEY
                        });
                        console.log(`    💾 ${result.status}: ${vlrId} to Convex.`);
                    } else {
                        console.log(`    ⚠️ Could not fetch details for ${vlrId}. Skipping.`);
                    }
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MATCHES_MS));
                }
            }

            currentPage++;

            // Stop if we have processed the last required page.
            if (currentPage >= endPage) {
                console.log("\n✅🏁 Reached the configured page limit. Backfill complete!");
                break;
            }

            console.log(`\n[Controller] 😴 Waiting ${DELAY_BETWEEN_PAGES_MS / 1000}s before fetching next page...`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_PAGES_MS));

        } catch (error) {
            console.error(`❌ An unexpected error occurred on page ${currentPage}:`, error);
            console.log("Retrying after 10 seconds...");
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

runBackfill();