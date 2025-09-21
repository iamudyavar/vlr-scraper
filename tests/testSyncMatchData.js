import { scrapeVlrMatches } from '../syncMatchData.js';
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
        console.log('=== VLR.gg Match Scraper ===\n');

        // Ask for match type
        const matchType = await askQuestion('▶ Select match type (live/upcoming/completed/all): ');

        // Ask for max records
        const maxRecordsInput = await askQuestion('▶ Max records per category (default: 5): ');
        const maxRecords = maxRecordsInput ? parseInt(maxRecordsInput, 10) : 5;

        // Configure scraping options based on selection
        const options = {
            includeLive: false,
            includeUpcoming: false,
            includeCompleted: false,
            maxResults: maxRecords,
        };

        switch (matchType.toLowerCase()) {
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

        console.log(`\n⏳ Scraping ${matchType} matches (max: ${maxRecords}, detailed: ${includeDetailed})...`);

        // Scrape matches using the high-level function
        const allMatches = await scrapeVlrMatches(options);

        // Print the final JSON
        console.log('\n✅ Scraping complete. Results:\n');
        console.log(JSON.stringify(allMatches, null, 2));

    } catch (error) {
        console.error('An error occurred during the scraping process:', error.message);
    } finally {
        rl.close();
    }
}

// Run the main function
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}