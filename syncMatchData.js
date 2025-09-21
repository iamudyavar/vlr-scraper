import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Parses a match card element and extracts structured match data.
 * @param {cheerio.Cheerio<cheerio.Element>} $match - The Cheerio element for a single match (a.match-item).
 * @param {string} dateText - The date string associated with this match.
 * @returns {Object|null} A structured match object or null if parsing fails.
 */
function parseMatchCard($match, dateText) {
    try {
        const matchHref = $match.attr('href');
        if (!matchHref) return null;

        const matchId = matchHref.split('/')[1];
        const team1Name = $match.find('.match-item-vs-team-name').eq(0).text().trim();
        const team2Name = $match.find('.match-item-vs-team-name').eq(1).text().trim();

        // Skip if essential data is missing
        if (!matchId || !team1Name || !team2Name) {
            return null;
        }

        // Extract and process status
        const statusText = $match.find('.match-item-eta .ml .ml-status').text().trim().toLowerCase();
        let status;
        if (statusText === 'live') {
            status = 'live';
        } else if (statusText === 'completed') {
            status = 'completed';
        } else {
            // Treat 'upcoming' and 'tbd' as upcoming
            status = 'upcoming';
        }

        // Extract scores
        const score1Text = $match.find('.match-item-vs-team-score').eq(0).text().trim();
        const score2Text = $match.find('.match-item-vs-team-score').eq(1).text().trim();
        const score1 = score1Text === '–' ? 0 : parseInt(score1Text, 10) || 0;
        const score2 = score2Text === '–' ? 0 : parseInt(score2Text, 10) || 0;

        // Extract and clean event info
        const eventName = cleanText($match.find('.match-item-event').contents().filter((_, el) => el.type === 'text').text());
        const eventSeries = cleanText($match.find('.match-item-event-series').text());

        // Extract and process time
        const matchTime = $match.find('.match-item-time').text().trim();
        const timestamp = createTimestamp(dateText, matchTime);

        return {
            id: matchId,
            url: `https://www.vlr.gg${matchHref}`,
            status,
            time: timestamp,
            team1: {
                name: team1Name,
                score: score1
            },
            team2: {
                name: team2Name,
                score: score2
            },
            event: {
                name: eventName,
                series: eventSeries
            },
        };
    } catch (error) {
        console.error('Error parsing a match card:', error);
        return null;
    }
}


/**
 * Cleans up text by normalizing whitespace and handling special characters.
 * @param {string} text - The input string.
 * @returns {string} The cleaned string.
 */
function cleanText(text) {
    if (!text) return '';
    // Replace the en dash with a hyphen surrounded by spaces
    return text.replace(/–/g, ' - ')
        .replace(/\s+/g, ' ') // This line cleans up any potential double spaces
        .trim();
}

/**
 * Creates an ISO timestamp from date and time strings.
 * @param {string} dateText - The date string (e.g., "Fri, September 19, 2025").
 * @param {string} timeText - The time string (e.g., "11:30 AM" or "TBD").
 * @returns {string|null} The ISO timestamp or null if parsing fails.
 */
function createTimestamp(dateText, timeText) {
    if (!dateText || !timeText || timeText.toLowerCase() === 'tbd') {
        return null;
    }
    try {
        // Remove day prefix and labels like "Today" for cleaner parsing
        const cleanDate = dateText.replace(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s*/i, '')
            .replace(/\s+(Today|Yesterday|Tomorrow)$/i, '')
            .trim();

        const dateTimeString = `${cleanDate} ${timeText}`;
        const timestamp = new Date(dateTimeString);

        return isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
    } catch (error) {
        console.error(`Error creating timestamp from date: "${dateText}" and time: "${timeText}"`, error);
        return null;
    }
}

/**
 * Scrapes a single VLR.gg matches page (live/upcoming or results).
 * @param {string} url - The URL to scrape.
 * @param {number} maxResults - The maximum number of matches to return.
 * @returns {Promise<Array>} A promise that resolves to an array of match objects.
 */
async function scrapePage(url, maxResults) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        const matches = [];

        // Select all match items within the main container
        const allMatches = $('div.col-container a.match-item');

        for (let i = 0; i < allMatches.length; i++) {
            if (matches.length >= maxResults) break;

            const element = allMatches[i];
            const $match = $(element);

            const dateText = $match.closest('.wf-card')
                .prevAll('.wf-label.mod-large')
                .first()
                .text()
                .trim();

            const matchData = parseMatchCard($match, dateText);
            if (matchData) {
                matches.push(matchData);
            }
        }
        return matches;
    } catch (error) {
        console.error(`Error scraping page ${url}:`, error);
        return []; // Return empty array on error
    }
}

/**
 * Scrapes match data from VLR.gg and returns a single, combined list of matches.
 * @param {Object} [options={}] - Configuration options.
 * @param {boolean} [options.includeLive=true] - Include live matches.
 * @param {boolean} [options.includeUpcoming=true] - Include upcoming matches.
 * @param {boolean} [options.includeCompleted=true] - Include completed matches.
 * @param {number} [options.maxResults=50] - Max results PER CATEGORY.
 * @returns {Promise<Object>} A promise resolving to an object with a flat `matches` array and a `scrapedAt` timestamp.
 */
async function scrapeVlrMatches(options = {}) {
    const {
        includeLive = true,
        includeUpcoming = true,
        includeCompleted = true,
        maxResults = 50
    } = options;

    let allMatches = [];
    const scrapedIds = new Set();

    // Scrape from /matches (live and upcoming)
    if (includeLive || includeUpcoming) {
        // Fetch a bit more since we filter *after* scraping the page
        const liveUpcomingPageMatches = await scrapePage('https://www.vlr.gg/matches', maxResults * 2);

        const filteredMatches = liveUpcomingPageMatches.filter(match => {
            if (scrapedIds.has(match.id)) return false; // Deduplicate
            return (includeLive && match.status === 'live') || (includeUpcoming && match.status === 'upcoming');
        });

        // Respect maxResults for each category
        let liveCount = 0;
        let upcomingCount = 0;
        for (const match of filteredMatches) {
            if (match.status === 'live' && liveCount < maxResults) {
                allMatches.push(match);
                scrapedIds.add(match.id);
                liveCount++;
            } else if (match.status === 'upcoming' && upcomingCount < maxResults) {
                allMatches.push(match);
                scrapedIds.add(match.id);
                upcomingCount++;
            }
        }
    }

    // Scrape from /matches/results (completed)
    if (includeCompleted) {
        const completedPageMatches = await scrapePage('https://www.vlr.gg/matches/results', maxResults);

        let completedCount = 0;
        for (const match of completedPageMatches) {
            if (completedCount >= maxResults) break;
            if (!scrapedIds.has(match.id) && match.status === 'completed') {
                allMatches.push(match);
                scrapedIds.add(match.id);
                completedCount++;
            }
        }
    }

    return {
        matches: allMatches,
        scrapedAt: new Date().toISOString(),
    };
}

/**
 * Gets detailed match information from a specific match page.
 * @param {string} matchUrl - The URL of the match page.
 * @returns {Promise<Object>} Detailed match data.
 */
async function getDetailedMatchData(matchUrl) {
    try {
        const { data } = await axios.get(matchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);

        // TODO

        return {
            mapScores: [],
            playerStats: []
        };
    } catch (error) {
        console.error(`Error getting detailed data for ${matchUrl}:`, error);
        throw error;
    }
}

export {
    scrapeVlrMatches,
    getDetailedMatchData,
};