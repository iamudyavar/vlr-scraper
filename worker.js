import { getVlrMatchDetails, getMatchUrlsFromMainPage, getMatchUrlsFromResultsPage } from './scrapeMatchData.js';
import { ConvexHttpClient } from "convex/browser";
import dotenv from 'dotenv';
import _ from 'lodash';

dotenv.config({ path: '.env.local', quiet: true });

// =============================================================================
// Configuration
// =============================================================================
const SCANNER_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
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

/**
 * In-memory cache for individual live match data to avoid tracker writes if no details have changed.
 * Key: vlrId, Value: last scraped match details object
 */
const trackerCache = new Map();

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

        // Avoid database write if match details haven't changed.
        const cachedDetails = trackerCache.get(vlrId);
        if (cachedDetails && _.isEqual(details, cachedDetails)) {
            console.log(`[Tracker:${vlrId}] 💾 Cached data unchanged, skipping update.`);
            return; // No changes detected, skip the update.
        }

        const result = await client.mutation("matches:upsertMatch", {
            match: details,
            apiKey: CONVEX_API_KEY
        });

        if (result.success) {
            // Update cache only after a successful database operation.
            trackerCache.set(vlrId, _.cloneDeep(details));
            if (result.status === 'updated') {
                console.log(`[Tracker:${vlrId}] ✅ Updated`);
            }
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
 * Compares the current scraped matches with the cached version and returns only
 * the matches that are new or have changed.
 * @param {Array} currentMatches - The current array of parsed match objects.
 * @returns {Array} An array of match objects that are new or have been updated.
 */
function getChangedMatches(currentMatches) {
    if (!lastScrapedMatchesData) {
        return currentMatches; // First run, all matches are considered new.
    }

    const changedMatches = [];
    const oldMatchesMap = new Map(lastScrapedMatchesData.map(m => [m.vlrId, m]));

    for (const currentMatch of currentMatches) {
        const oldMatch = oldMatchesMap.get(currentMatch.vlrId);
        if (!oldMatch || !_.isEqual(currentMatch, oldMatch)) {
            changedMatches.push(currentMatch);
        }
    }

    return changedMatches;
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
        const allChangedMatches = getChangedMatches(sortedDetailedMatches);

        // Log cache comparison results
        const totalMatches = sortedDetailedMatches.length;
        const unchangedCount = totalMatches - allChangedMatches.length;
        if (unchangedCount > 0) {
            console.log(`[Scanner] 💾 ${unchangedCount}/${totalMatches} matches unchanged from cache, skipping updates.`);
        }

        // Manage Trackers based on live matches
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

        // Stop any trackers for matches that are no longer live.
        for (const [vlrId, intervalId] of activeTrackers.entries()) {
            if (!liveVlrIds.has(vlrId)) {
                console.log(`[Scanner] 🛑 Match ${vlrId} is no longer live. Stopping tracker.`);
                clearInterval(intervalId);
                activeTrackers.delete(vlrId);
                trackerCache.delete(vlrId);
            }
        }
        console.log(`[Scanner] 📈 Active trackers: ${activeTrackers.size}`);

        // Filter out matches that are being handled by a tracker
        const changedMatchesForScanner = allChangedMatches.filter(match => !activeTrackers.has(match.vlrId));

        // Log how many matches are being handled by trackers vs scanner
        const trackerHandledCount = allChangedMatches.length - changedMatchesForScanner.length;
        if (trackerHandledCount > 0) {
            console.log(`[Scanner] 🔄 ${trackerHandledCount} matches handled by active trackers, skipping scanner processing.`);
        }

        if (changedMatchesForScanner.length === 0) {
            console.log(`[Scanner] 💾 All matches cached and unchanged, skipping database operations.`);
        } else {
            // 4. Upsert only the non-tracked, changed matches in a single batch operation
            try {
                const result = await client.mutation("matches:upsertMatchesBatch", {
                    matches: changedMatchesForScanner,
                    apiKey: CONVEX_API_KEY
                });

                if (result.success) {
                    console.log(`[Scanner] 📦 Batch upserted ${changedMatchesForScanner.length} changes: ${result.inserted} inserted, ${result.updated} updated.`);
                }
            } catch (error) {
                console.error(`[Scanner] ❌ Error in batch upserting matches:`, error.message);
            }
        }

        // 5. Update cache with the complete current parsed data if anything changed.
        if (allChangedMatches.length > 0) {
            updateCachedMatchesData(sortedDetailedMatches);
        }
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