import { getVlrMatchDetails, getMatchUrlsFromMainPage, getMatchUrlsFromResultsPage } from '../scrapeMatchData.js';
import readline from 'readline';

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Helper function to ask questions
function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

async function main() {
    try {
        console.log('=== VLR.gg Scraper CLI ===\n');

        // Ask for the action type
        const actionType = await askQuestion('▶ Select action (live/upcoming/completed/all, or detailed): ');

        if (actionType.toLowerCase() === 'detailed') {
            const matchUrl = await askQuestion('▶ Enter the full VLR.gg match URL: ');

            if (!matchUrl || !matchUrl.startsWith('https://www.vlr.gg')) {
                console.error('\n❌ Invalid URL. Please provide a full VLR.gg match URL.');
                return;
            }

            console.log(`\n⏳ Scraping detailed data for: ${matchUrl}...`);
            const detailedData = await getVlrMatchDetails(matchUrl);

            if (detailedData) {
                console.log('\n✅ Scraping complete. Results:\n');
                console.log(JSON.stringify(detailedData, null, 2));
            } else {
                console.log('\n❌ Failed to retrieve or parse match data.');
            }
        } else {
            const maxRecordsInput = await askQuestion('▶ Max records (default: 5): ');
            const maxRecords = maxRecordsInput ? parseInt(maxRecordsInput, 10) : 5;

            console.log(`\n⏳ Getting match URLs from main page and results pages (max: ${maxRecords})...`);

            const matchUrls = [];

            // Get live/upcoming matches from main page
            const mainPageUrls = await getMatchUrlsFromMainPage();
            matchUrls.push(...mainPageUrls);

            // Get completed matches from results pages
            for (let page = 1; page <= Math.ceil(maxRecords / 20); page++) {
                const pageUrls = await getMatchUrlsFromResultsPage(page);
                matchUrls.push(...pageUrls);
                if (matchUrls.length >= maxRecords) break;
            }

            // Remove duplicates and limit
            const uniqueMatchUrls = [...new Set(matchUrls)];
            const limitedUrls = uniqueMatchUrls.slice(0, maxRecords);
            console.log(`\n📊 Found ${limitedUrls.length} match URLs (${mainPageUrls.length} from main page, ${matchUrls.length - mainPageUrls.length} from results pages). Processing details...`);

            const results = [];
            for (const [index, matchUrl] of limitedUrls.entries()) {
                console.log(`Processing ${index + 1}/${limitedUrls.length}: ${matchUrl}`);
                const details = await getVlrMatchDetails(matchUrl);
                if (details) {
                    results.push(details);
                }
            }

            console.log('\n✅ Scraping complete. Results:\n');
            console.log(JSON.stringify(results, null, 2));
        }

    } catch (error) {
        console.error('An error occurred during the scraping process:', error.message);
    } finally {
        rl.close();
    }
}

main();