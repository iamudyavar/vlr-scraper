import { scrapeVlrMatches, getVlrMatchDetails } from './scrapeMatchData.js';
import { ConvexHttpClient } from "convex/browser";
import dotenv from 'dotenv';
import _ from 'lodash';

dotenv.config({ path: '.env.local' });

// =============================================================================
// Configuration
// =============================================================================
const SCANNER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const TRACKER_INTERVAL_MS = 30 * 1000; // 30 seconds
const MAX_RESULTS_PER_CATEGORY = 50;
const CONVEX_URL = process.env.CONVEX_URL;

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
    console.log(`[Tracker:${vlrId}] 🏃‍♂️ Fetching details`);
    try {
        const details = await getVlrMatchDetails(matchUrl);
        if (!details) {
            console.log(`[Tracker:${vlrId}] ⚠️ No details returned. Match might be over or page changed.`);
            return;
        }

        await client.mutation("matches:upsertMatchDetails", { details });
        console.log(`[Tracker:${vlrId}] ✅ Synced detailed data to Convex.`);

        // If the match is no longer live, the scanner will eventually stop this tracker.
        if (details.overallStatus !== 'live') {
            console.log(`[Tracker:${vlrId}] 🏁 Match status is now '${details.overallStatus}'. The scanner will stop this tracker on its next run.`);
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
 * @param {Array} currentMatches - The current scraped matches array
 * @returns {boolean} - True if data has changed, false if it's the same
 */
function hasMatchesDataChanged(currentMatches) {
    if (!lastScrapedMatchesData) {
        return true; // First run, data is considered "changed"
    }

    try {
        return !_.isEqual(currentMatches, lastScrapedMatchesData);
    } catch (error) {
        console.error('[Scanner] ⚠️ Error comparing matches data:', error.message);
        return true; // On error, assume data has changed to be safe
    }
}

/**
 * Updates the cached matches data.
 * @param {Array} matches - The matches array to cache
 */
function updateCachedMatchesData(matches) {
    try {
        // Deep clone the matches array to avoid reference issues
        lastScrapedMatchesData = _.cloneDeep(matches);
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
        // 1. Scrape the high-level match list
        const { matches } = await scrapeVlrMatches({
            includeLive: true,
            includeUpcoming: true,
            includeCompleted: true,
            maxResults: MAX_RESULTS_PER_CATEGORY,
        });
        console.log(`[Scanner] 📊 Found ${matches.length} total matches.`);

        // 2. Check if data has changed using in-memory cache
        if (!hasMatchesDataChanged(matches)) {
            console.log(`[Scanner] 💾 Matches data unchanged, skipping database write.`);
        } else {
            console.log(`[Scanner] 🔄 Matches data changed, syncing to database...`);

            // 3. Upsert the list to Convex
            const matchesForConvex = matches.map(match => ({
                vlrId: match.vlrId, // Corrected from match.id
                url: match.url,
                status: match.status,
                time: match.time,
                team1: match.team1,
                team2: match.team2,
                event: match.event
            }));

            await client.mutation("matches:upsertHighLevelMatchBatch", {
                scrapedMatches: matchesForConvex,
            });
            console.log(`[Scanner] ✅ Synced high-level match list to Convex.`);

            // 4. Update the cached data
            updateCachedMatchesData(matches);
        }


        // 5. Manage Trackers based on match status
        const liveVlrIds = new Set();
        for (const match of matches) {
            if (match.status === 'live') {
                liveVlrIds.add(match.vlrId);
                // If a match is live but NOT being tracked, start a new tracker.
                if (!activeTrackers.has(match.vlrId)) {
                    console.log(`[Scanner] ✨ Found new live match! Starting tracker for ${match.vlrId}.`);
                    // Run immediately once, then set the interval
                    runTracker(match.vlrId, match.url);
                    const intervalId = setInterval(() => runTracker(match.vlrId, match.url), TRACKER_INTERVAL_MS);
                    activeTrackers.set(match.vlrId, intervalId);
                }
            }
        }

        // 6. Stop any trackers for matches that are no longer live.
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
    client = new ConvexHttpClient(CONVEX_URL);
    console.log('✅ Worker started. Initializing scanner...');

    // Run the scanner once on startup, then set it to run on its interval.
    runScanner();
    setInterval(runScanner, SCANNER_INTERVAL_MS);
}

main();