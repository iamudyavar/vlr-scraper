import { getVlrMatchDetails, getMatchUrlsFromMainPage, getMatchUrlsFromResultsPage } from './scrapeMatchData.js';
import { ConvexHttpClient } from "convex/browser";
import dotenv from 'dotenv';
import _ from 'lodash';

dotenv.config({ path: '.env.local', quiet: true });

// =============================================================================
// Configuration
// =============================================================================
const SCANNER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const TRACKER_INTERVAL_MS = 30 * 1000; // 30 seconds
const MAX_RESULTS_PER_CATEGORY = 50;
const CONVEX_URL = process.env.CONVEX_URL;
const CONVEX_API_KEY = process.env.CONVEX_API_KEY;

// =============================================================================
// State Management
// =============================================================================
/**
 * In-memory store for active trackers.
 * The key is the vlrId, the value is the interval ID.
 * e.g., { '12345': 1, '67890': 2 }
 */
const activeTrackers = new Map();

/**
 * In-memory cache for scraped matches data to avoid unnecessary database writes.
 * Stores the last scraped matches data as an object for comparison.
 */
let lastScrapedMatchesData = null;

let client; // Convex client initialized once

// =============================================================================
// Core Logic: Tracker
// =============================================================================

/**
 * The high-frequency task that scrapes detailed data for a SINGLE live match.
 * @param {string} vlrId - The VLR ID of the match to track.
 * @param {string} matchUrl - The full URL to the match page.
 */
async function runTracker(vlrId, matchUrl) {
    try {
        const details = await getVlrMatchDetails(matchUrl);
        if (!details) {
            console.log(`[Tracker:${vlrId}] ⚠️ Match ended or page changed, stopping tracker.`);
            return;
        }

        const result = await client.mutation("matches:upsertMatch", {
            match: details,
            apiKey: CONVEX_API_KEY
        });

        if (result.success && result.status === 'updated') {
            console.log(`[Tracker:${vlrId}] ✅ Updated`);
        }

        // If the match is no longer live, the scanner will eventually stop this tracker.
        if (details.status !== 'live') {
            console.log(`[Tracker:${vlrId}] 🏁 Match status is now '${details.status}'. The scanner will stop this tracker on its next run.`);
        }

    } catch (error) {
        console.error(`[Tracker:${vlrId}] ❌ Failed:`, error.message);
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Compares the current scraped matches data with the cached data using lodash isEqual.
 * Expects parsed match objects (not URLs) and assumes a stable order.
 * @param {Array} currentParsedMatches - The current parsed matches array
 * @returns {boolean} - True if data has changed, false if it's the same
 */
function hasMatchesDataChanged(currentParsedMatches) {
    if (!lastScrapedMatchesData) {
        return true; // First run, data is considered "changed"
    }

    try {
        return !_.isEqual(currentParsedMatches, lastScrapedMatchesData);
    } catch (error) {
        console.error('[Scanner] ⚠️ Error comparing matches data:', error.message);
        return true; // On error, assume data has changed to be safe
    }
}

/**
 * Updates the cached matches data with parsed match objects.
 * @param {Array} parsedMatches - The parsed matches array to cache
 */
function updateCachedMatchesData(parsedMatches) {
    try {
        // Deep clone the matches array to avoid reference issues
        lastScrapedMatchesData = _.cloneDeep(parsedMatches);
    } catch (error) {
        console.error('[Scanner] ⚠️ Error caching matches data:', error.message);
    }
}

// =============================================================================
// Core Logic: Scanner
// =============================================================================

/**
 * The low-frequency task that scans the main match list and manages trackers.
 */
async function runScanner() {
    console.log(`\n[Scanner] 📡 Starting scan...`);
    try {
        // 1. Get match URLs from main page (live/upcoming) and results pages
        const matchUrls = [];

        // Get live/upcoming matches from main page
        const mainPageUrls = await getMatchUrlsFromMainPage();
        matchUrls.push(...mainPageUrls);

        // Get completed matches from latest results page only
        const resultsPageUrls = await getMatchUrlsFromResultsPage(1);
        matchUrls.push(...resultsPageUrls);

        // Remove duplicates
        const uniqueMatchUrls = [...new Set(matchUrls)];
        console.log(`[Scanner] 📊 Found ${uniqueMatchUrls.length} total match URLs (${mainPageUrls.length} from main page, ${resultsPageUrls.length} from results page).`);

        // 2. Parse detailed match data for all URLs first
        console.log(`[Scanner] 🔄 Fetching detailed match data for comparison...`);
        const liveMatches = [];
        const detailedMatches = [];
        let skippedCount = 0;
        for (const matchUrl of uniqueMatchUrls) {
            try {
                const vlrId = matchUrl.split('/')[3];
                const detailedMatch = await getVlrMatchDetails(matchUrl);
                if (!detailedMatch) {
                    skippedCount++;
                    continue;
                }
                // Ensure vlrId present for stable sort
                if (!detailedMatch.vlrId) {
                    detailedMatch.vlrId = vlrId;
                }
                detailedMatches.push(detailedMatch);

                if (detailedMatch.status === 'live') {
                    liveMatches.push({ vlrId, url: matchUrl });
                }
            } catch (error) {
                console.error(`[Scanner] ❌ Error fetching details:`, error.message);
                skippedCount++;
            }
        }

        // 3. Stabilize ordering (to avoid order-only diffs) and compare with cache
        const sortedDetailedMatches = _.sortBy(detailedMatches, ['vlrId']);
        if (!hasMatchesDataChanged(sortedDetailedMatches)) {
            console.log(`[Scanner] ⏭️ No changes detected after parsing, skipping database operations.`);
            // Still manage trackers even if no DB changes
        } else {
            // 4. Upsert only after detecting changes
            let processedCount = 0;
            for (const match of sortedDetailedMatches) {
                try {
                    const result = await client.mutation("matches:upsertMatch", {
                        match,
                        apiKey: CONVEX_API_KEY
                    });
                    if (result.success) {
                        processedCount++;
                    }
                } catch (error) {
                    console.error(`[Scanner] ❌ Error upserting match:`, error.message);
                }
            }
            // 5. Update cache with current parsed data
            updateCachedMatchesData(sortedDetailedMatches);
            console.log(`[Scanner] 📊 Updated: ${processedCount}, Skipped: ${skippedCount}`);
        }

        // 3. Manage Trackers based on live matches
        const liveVlrIds = new Set();
        for (const match of liveMatches) {
            liveVlrIds.add(match.vlrId);
            // If a match is live but NOT being tracked, start a new tracker.
            if (!activeTrackers.has(match.vlrId)) {
                console.log(`[Scanner] ✨ Found new live match! Starting tracker for ${match.vlrId}.`);
                // Run immediately once, then set the interval
                const matchUrl = `https://www.vlr.gg/${match.vlrId}`;
                runTracker(match.vlrId, matchUrl);
                const intervalId = setInterval(() => runTracker(match.vlrId, matchUrl), TRACKER_INTERVAL_MS);
                activeTrackers.set(match.vlrId, intervalId);
            }
        }

        // 4. Stop any trackers for matches that are no longer live.
        for (const [vlrId, intervalId] of activeTrackers.entries()) {
            if (!liveVlrIds.has(vlrId)) {
                console.log(`[Scanner] 🛑 Match ${vlrId} is no longer live. Stopping tracker.`);
                clearInterval(intervalId);
                activeTrackers.delete(vlrId);
            }
        }
        console.log(`[Scanner] 📈 Active trackers: ${activeTrackers.size}`);

    } catch (error) {
        console.error('[Scanner] ❌ Task failed:', error);
    }
}

// =============================================================================
// Main Execution
// =============================================================================
function main() {
    if (!CONVEX_URL) {
        console.error("❌ CONVEX_URL environment variable is not set.");
        process.exit(1);
    }

    if (!CONVEX_API_KEY) {
        console.error("❌ CONVEX_API_KEY environment variable is not set.");
        process.exit(1);
    }

    client = new ConvexHttpClient(CONVEX_URL);
    console.log('✅ Worker started. Initializing scanner...');

    // Run the scanner once on startup, then set it to run on its interval.
    runScanner();
    setInterval(runScanner, SCANNER_INTERVAL_MS);
}

main();