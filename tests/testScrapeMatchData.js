import { scrapeVlrMatches, getVlrMatchDetails } from '../scrapeMatchData.js';
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
            const maxRecordsInput = await askQuestion('▶ Max records per category (default: 5): ');
            const maxRecords = maxRecordsInput ? parseInt(maxRecordsInput, 10) : 5;

            const options = {
                includeLive: false,
                includeUpcoming: false,
                includeCompleted: false,
                maxResults: maxRecords,
            };

            switch (actionType.toLowerCase()) {
                case 'live':
                    options.includeLive = true;
                    break;
                case 'upcoming':
                    options.includeUpcoming = true;
                    break;
                case 'completed':
                    options.includeCompleted = true;
                    break;
                case 'all':
                    options.includeLive = true;
                    options.includeUpcoming = true;
                    options.includeCompleted = true;
                    break;
                default:
                    console.log('Invalid selection. Defaulting to "all".');
                    options.includeLive = true;
                    options.includeUpcoming = true;
                    options.includeCompleted = true;
            }

            console.log(`\n⏳ Scraping ${actionType} matches (max: ${maxRecords})...`);

            const listData = await scrapeVlrMatches(options);

            console.log('\n✅ Scraping complete. Results:\n');
            console.log(JSON.stringify(listData, null, 2));
        }

    } catch (error) {
        console.error('An error occurred during the scraping process:', error.message);
    } finally {
        rl.close();
    }
}

main();