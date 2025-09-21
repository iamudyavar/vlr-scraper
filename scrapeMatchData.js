import axios from 'axios';
import * as cheerio from 'cheerio';

// =============================================================================
// Main Exported Functions
// =============================================================================

/**
 * Scrapes match data from VLR.gg and returns a combined list of matches.
 * @param {Object} [options={}] - Configuration options.
 * @param {boolean} [options.includeLive=true] - Include live matches.
 * @param {boolean} [options.includeUpcoming=true] - Include upcoming matches.
 * @param {boolean} [options.includeCompleted=true] - Include completed matches.
 * @param {number} [options.maxResults=50] - Max results PER CATEGORY.
 * @returns {Promise<Object>} A promise resolving to an object with a flat `matches` array and a `scrapedAt` timestamp.
 */
export async function scrapeVlrMatches(options = {}) {
    const {
        includeLive = true,
        includeUpcoming = true,
        includeCompleted = true,
        maxResults = 50
    } = options;

    let allMatches = [];
    const scrapedIds = new Set();

    // Scrape from /matches (contains both live and upcoming)
    if (includeLive || includeUpcoming) {
        // Fetch a bit more since we filter *after* scraping the page
        const liveUpcomingPageMatches = await _scrapeListPage('https://www.vlr.gg/matches', maxResults * 2);

        const filteredMatches = liveUpcomingPageMatches.filter(match => {
            if (scrapedIds.has(match.vlrId)) return false;
            return (includeLive && match.status === 'live') || (includeUpcoming && match.status === 'upcoming');
        });

        // Respect maxResults for each category separately
        let liveCount = 0;
        let upcomingCount = 0;
        for (const match of filteredMatches) {
            if (match.status === 'live' && liveCount < maxResults) {
                allMatches.push(match);
                scrapedIds.add(match.vlrId);
                liveCount++;
            } else if (match.status === 'upcoming' && upcomingCount < maxResults) {
                allMatches.push(match);
                scrapedIds.add(match.vlrId);
                upcomingCount++;
            }
        }
    }

    // Scrape from /matches/results for completed matches
    if (includeCompleted) {
        const completedPageMatches = await _scrapeListPage('https://www.vlr.gg/matches/results', maxResults);

        let completedCount = 0;
        for (const match of completedPageMatches) {
            if (completedCount >= maxResults) break;
            if (!scrapedIds.has(match.vlrId) && match.status === 'completed') {
                allMatches.push(match);
                scrapedIds.add(match.vlrId);
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
 * Fetches and parses a single VLR.gg match page for its detailed data,
 * including map-by-map stats.
 * @param {string} matchUrl - The full URL of the VLR.gg match page.
 * @returns {Promise<Object|null>} A promise that resolves to the detailed match data object, or null on failure.
 */
export async function getVlrMatchDetails(matchUrl) {
    console.log(`🚀 Fetching detailed data for: ${matchUrl}`);
    try {
        const html = await _fetchHtml(matchUrl);
        const vlrId = matchUrl.split('/')[3];
        if (!vlrId || isNaN(parseInt(vlrId, 10))) {
            throw new Error(`Could not parse a valid vlrId from URL: ${matchUrl}`);
        }

        return await _parseDetailedMatchData(html, vlrId);
    } catch (error) {
        console.error(`❌ Complete failure in getVlrMatchDetails for ${matchUrl}: ${error.message}`);
        return null;
    }
}


// =============================================================================
// Core Scraper & HTML Fetcher
// =============================================================================

/**
 * Fetches the HTML content of a given URL.
 * This is the single entry point for all HTTP requests.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<string>} The HTML content of the page.
 */
async function _fetchHtml(url) {
    try {
        const {
            data
        } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });
        return data;
    } catch (error) {
        console.error(`❌ Failed to fetch page at ${url}:`, error.message);
        throw error;
    }
}

/**
 * Scrapes a VLR.gg matches list page (e.g., /matches or /matches/results).
 * @param {string} url - The URL to scrape.
 * @param {number} maxResults - The maximum number of matches to return.
 * @returns {Promise<Array>} A promise that resolves to an array of match objects.
 */
async function _scrapeListPage(url, maxResults) {
    try {
        const html = await _fetchHtml(url);
        const $ = cheerio.load(html);
        const matches = [];

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

            const matchData = _parseMatchCard($match, dateText);
            if (matchData) {
                matches.push(matchData);
            }
        }
        return matches;
    } catch (error) {
        console.error(`Error scraping list page ${url}:`, error.message);
        return [];
    }
}


// =============================================================================
// Parsing Helper Functions
// =============================================================================

/**
 * Parses a match card element from a match list page.
 * @param {cheerio.Cheerio<cheerio.Element>} $match - The Cheerio element for a single match.
 * @param {string} dateText - The date string associated with this match.
 * @returns {Object|null} A structured match object or null if parsing fails.
 */
function _parseMatchCard($match, dateText) {
    try {
        const matchHref = $match.attr('href');
        if (!matchHref) return null;

        const vlrId = matchHref.split('/')[1];
        const team1Name = $match.find('.match-item-vs-team-name').eq(0).text().trim();
        const team2Name = $match.find('.match-item-vs-team-name').eq(1).text().trim();

        if (!vlrId || !team1Name || !team2Name) return null;

        const statusText = $match.find('.match-item-eta .ml .ml-status').text().trim().toLowerCase();
        let status = 'upcoming'; // Default
        if (statusText === 'live') status = 'live';
        else if (statusText === 'completed') status = 'completed';

        const score1Text = $match.find('.match-item-vs-team-score').eq(0).text().trim();
        const score2Text = $match.find('.match-item-vs-team-score').eq(1).text().trim();
        const score1 = score1Text === '–' ? 0 : parseInt(score1Text, 10) || 0;
        const score2 = score2Text === '–' ? 0 : parseInt(score2Text, 10) || 0;

        const eventName = _cleanText($match.find('.match-item-event').contents().filter((_, el) => el.type === 'text').text());
        const eventSeries = _cleanText($match.find('.match-item-event-series').text());

        const matchTime = $match.find('.match-item-time').text().trim();
        const timestamp = _createTimestamp(dateText, matchTime);

        return {
            vlrId,
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
 * Parses the round history for a single map.
 * @param {cheerio.Cheerio<cheerio.Element>} $gameContainer - The Cheerio element for a map's stats container.
 * @param {string} team1Name - The name of the first team.
 * @param {string} team2Name - The name of the second team.
 * @param {cheerio.CheerioAPI} $ - The cheerio instance.
 * @returns {Array<Object>} An array of objects, each representing a round.
 */
function _parseRoundsData($gameContainer, team1Name, team2Name, $) {
    const rounds = [];
    // Select all round columns, skipping the first one which contains team names
    const $roundCols = $gameContainer.find('.vlr-rounds-row-col:not(:first-child)');

    $roundCols.each((_, col) => {
        const $col = $(col);
        const roundNumberText = $col.find('.rnd-num').text().trim();
        if (!roundNumberText) return; // Skip non-round columns like spacers

        const roundNumber = parseInt(roundNumberText, 10);
        const $squares = $col.find('.rnd-sq');
        const $winnerSq = $squares.filter('.mod-win');

        let winningTeam = null;
        let winCondition = null;

        if ($winnerSq.length > 0) {
            // Determine winner by index (0 for team1, 1 for team2)
            winningTeam = $squares.index($winnerSq) === 0 ? team1Name : team2Name;

            // Extract win condition from the image src
            const imgSrc = $winnerSq.find('img').attr('src');
            if (imgSrc) {
                const match = imgSrc.match(/\/([a-z]+)\.webp$/);
                if (match && match[1]) {
                    winCondition = match[1]; // e.g., 'elim', 'defuse', 'boom', 'time'
                }
            }
        }

        rounds.push({
            roundNumber,
            winningTeam,
            winCondition,
        });
    });

    return rounds;
}

/**
 * Parses the HTML of a specific match page for detailed information.
 * @param {string} html - The HTML content of the match page.
 * @param {string} vlrId - The VLR match ID.
 * @returns {Promise<Object>} Detailed match data.
 */
async function _parseDetailedMatchData(html, vlrId) {
    const $ = cheerio.load(html);

    // Inner helper to parse the pick/ban note string.
    const parsePicks = (noteText) => {
        const picks = {};
        if (!noteText) return picks;
        const parts = noteText.split(';').map(p => p.trim());
        for (const part of parts) {
            if (part.toLowerCase().includes('pick')) {
                const words = part.split(' '); // e.g., ['TL', 'pick', 'Corrode']
                if (words.length >= 3) {
                    picks[words[2]] = words[0]; // { 'Corrode': 'TL' }
                }
            }
        }
        return picks;
    };

    // Inner helper to parse a table of player stats for a specific map.
    const parsePlayerStatsTable = ($table, teamName) => {
        const players = [];
        const $rows = $table.find('tbody tr');

        const parseStat = ($row, statClass) => {
            const text = $row.find(statClass).find('.side.mod-both').text().trim();
            const num = parseFloat(text.replace('%', ''));
            return isNaN(num) ? 0 : num;
        };

        $rows.each((_, row) => {
            const $row = $(row);
            const playerName = $row.find('.mod-player .text-of').text().trim();
            if (!playerName) return;

            const agentImg = $row.find('.mod-agent img');
            const agentName = agentImg.attr('title');
            let agentIconUrl = agentImg.attr('src');
            if (agentIconUrl && agentIconUrl.startsWith('/')) {
                agentIconUrl = `https://www.vlr.gg${agentIconUrl}`;
            }

            players.push({
                playerName,
                teamName,
                agent: {
                    name: agentName,
                    iconUrl: agentIconUrl
                },
                stats: {
                    kills: parseStat($row, '.mod-vlr-kills'),
                    deaths: parseStat($row, '.mod-vlr-deaths'),
                    assists: parseStat($row, '.mod-vlr-assists'),
                    acs: parseStat($row, 'td:nth-child(4)'),
                    adr: parseStat($row, '.mod-combat'),
                    kastPercent: parseStat($row, 'td:nth-child(9)'),
                    headshotPercent: parseStat($row, 'td:nth-child(11)'),
                    firstKills: parseStat($row, '.mod-fb'),
                    firstDeaths: parseStat($row, '.mod-fd'),
                },
            });
        });
        return players;
    };

    // --- Main Parsing Logic ---
    let overallStatus = 'upcoming';
    const statusText = $('.match-header-vs-note').first().text().toLowerCase();
    if (statusText.includes('live')) overallStatus = 'live';
    else if (statusText.includes('final')) overallStatus = 'completed';

    const mapPicks = parsePicks($('.match-header-note').text());

    const team1Name = $('.match-header-link.mod-1 .wf-title-med').text().trim();
    const team2Name = $('.match-header-link.mod-2 .wf-title-med').text().trim();
    const fixUrl = (url) => (url?.startsWith('//') ? `https:${url}` : url);
    const team1LogoUrl = fixUrl($('.match-header-link.mod-1 img').attr('src'));
    const team2LogoUrl = fixUrl($('.match-header-link.mod-2 img').attr('src'));
    const scoreSpans = $('.match-header-vs-score .js-spoiler span:not(.match-header-vs-score-colon)');
    const team1OverallScore = parseInt(scoreSpans.eq(0).text().trim(), 10) || 0;
    const team2OverallScore = parseInt(scoreSpans.eq(1).text().trim(), 10) || 0;
    const teamShortNameElements = $('.vlr-rounds-row .team');
    const team1ShortName = teamShortNameElements.eq(0).clone().children().remove().end().text().trim() || team1Name;
    const team2ShortName = teamShortNameElements.eq(1).clone().children().remove().end().text().trim() || team2Name;

    const maps = [];
    $('.vm-stats-gamesnav-item:not(.mod-all)').each((_, el) => {
        const $el = $(el);
        const mapName = $el.find('div[style*="margin-bottom"]').text().replace(/\d/g, '').trim();
        const gameId = $el.data('game-id');
        const $gameContainer = $(`.vm-stats-game[data-game-id="${gameId}"]`);

        let status = 'upcoming'; // Default status
        if ($gameContainer.length > 0) {
            if ($gameContainer.find('.vm-stats-game-header .score.mod-win').length > 0) status = 'completed';
            else if ($el.hasClass('mod-live')) status = 'live';
        }

        const team1Stats = $gameContainer.length ? parsePlayerStatsTable($gameContainer.find('.wf-table-inset').eq(0), team1Name) : [];
        const team2Stats = $gameContainer.length ? parsePlayerStatsTable($gameContainer.find('.wf-table-inset').eq(1), team2Name) : [];

        const rounds = $gameContainer.length ? _parseRoundsData($gameContainer, team1Name, team2Name, $) : [];

        maps.push({
            name: mapName,
            status: status,
            pickedBy: mapPicks[mapName] || null,
            team1Score: parseInt($gameContainer.find('.vm-stats-game-header .team').first().find('.score').text().trim(), 10) || 0,
            team2Score: parseInt($gameContainer.find('.vm-stats-game-header .team').last().find('.score').text().trim(), 10) || 0,
            stats: [...team1Stats, ...team2Stats],
            rounds: rounds,
        });
    });

    // Adjust map statuses if the whole match is completed but some maps weren't played
    if (overallStatus === 'completed') {
        maps.forEach(map => {
            if (map.status === 'upcoming') map.status = 'unplayed';
        });
    }

    return {
        vlrId,
        overallStatus,
        team1: {
            name: team1Name,
            shortName: team1ShortName,
            logoUrl: team1LogoUrl,
            score: team1OverallScore
        },
        team2: {
            name: team2Name,
            shortName: team2ShortName,
            logoUrl: team2LogoUrl,
            score: team2OverallScore
        },
        maps,
    };
}


// =============================================================================
// Utility Helper Functions
// =============================================================================

/**
 * Cleans up text by normalizing whitespace.
 * @param {string} text - The input string.
 * @returns {string} The cleaned string.
 */
function _cleanText(text) {
    if (!text) return '';
    return text.replace(/–/g, ' - ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Creates an ISO timestamp from date and time strings.
 * @param {string} dateText - The date string (e.g., "Fri, September 19, 2025").
 * @param {string} timeText - The time string (e.g., "11:30 AM" or "TBD").
 * @returns {string|null} The ISO timestamp or null if parsing fails.
 */
function _createTimestamp(dateText, timeText) {
    if (!dateText || !timeText || timeText.toLowerCase() === 'tbd') {
        return null;
    }
    try {
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