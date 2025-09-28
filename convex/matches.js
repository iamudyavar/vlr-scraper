import { mutation } from "./_generated/server";
import { matchSchema } from "./shared.js";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

// Helper function to validate API key
async function validateApiKey(apiKey) {
    if (!apiKey) {
        throw new Error("API key is required.");
    }

    // Get the expected API key from environment variables set in Convex project.
    const expectedApiKey = process.env.CONVEX_API_KEY;
    if (!expectedApiKey) {
        throw new Error("API key not configured on the Convex server. Please set CONVEX_API_KEY environment variable.");
    }

    if (apiKey !== expectedApiKey) {
        throw new Error("Invalid API key");
    }
}

// Upserts a match into the database.
export const upsertMatch = mutation({
    args: {
        match: matchSchema, // Ensure matchSchema in shared.js allows optional `searchTerms`
        apiKey: v.string()
    },
    handler: async (ctx, args) => {
        await validateApiKey(args.apiKey);

        const { match } = args;

        // Create a combined search terms string
        const searchTerms = [
            match.team1.name,
            match.team1.shortName,
            match.team2.name,
            match.team2.shortName,
            match.event.name,
            match.event.series,
        ].join(" ").toLowerCase();

        // Add the search terms to the match object
        const matchWithSearch = { ...match, searchTerms };

        // Find existing match
        const existingMatch = await ctx.db
            .query("matches")
            .withIndex("by_vlr_id", (q) => q.eq("vlrId", match.vlrId))
            .unique();

        if (!existingMatch) {
            // Use the object with the search terms
            await ctx.db.insert("matches", matchWithSearch);
            return { success: true, vlrId: match.vlrId, status: 'inserted' };
        } else {
            // Use the object with the search terms
            await ctx.db.patch(existingMatch._id, matchWithSearch);
            return { success: true, vlrId: match.vlrId, status: 'updated' };
        }
    },
});

// Helper function to transform match to card format
function transformToCard(match) {
    return {
        vlrId: match.vlrId,
        url: `https://www.vlr.gg/${match.vlrId}`,
        status: match.status,
        time: match.time,
        team1: {
            teamId: match.team1.teamId,
            name: match.team1.name,
            shortName: match.team1.shortName,
            score: match.team1.score,
            logoUrl: match.team1.logoUrl
        },
        team2: {
            teamId: match.team2.teamId,
            name: match.team2.name,
            shortName: match.team2.shortName,
            score: match.team2.score,
            logoUrl: match.team2.logoUrl
        },
        event: {
            eventId: match.event.eventId,
            name: match.event.name,
            series: match.event.series
        }
    };
}

// Query for the home page, fetching only live and upcoming matches.
export const getHomePageMatches = query({
    args: {
        upcomingLimit: v.number(),
    },
    handler: async (ctx, { upcomingLimit }) => {
        const liveMatches = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "live"))
            .collect();

        const upcomingMatches = await ctx.db
            .query("matches")
            .withIndex("by_status_time", (q) => q.eq("status", "upcoming"))
            .order("asc")
            .take(upcomingLimit);

        return {
            live: liveMatches.map(transformToCard),
            upcoming: upcomingMatches.map(transformToCard),
        };
    },
});

// Dedicated query for paginating completed matches on the results page.
export const getCompletedMatches = query({
    args: {
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, { paginationOpts }) => {
        const completedPage = await ctx.db
            .query("matches")
            .withIndex("by_status_time", (q) => q.eq("status", "completed"))
            .order("desc")
            .paginate(paginationOpts);

        // Return the pagination result, transforming the items on the page
        return {
            ...completedPage,
            page: completedPage.page.map(transformToCard),
        };
    },
});

// Paginated query for home page matches (live and upcoming)
export const getHomePageMatchesPaginated = query({
    args: {
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, { paginationOpts }) => {
        // Get live matches
        const liveMatches = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "live"))
            .collect();

        // Get upcoming matches with pagination
        const upcomingPage = await ctx.db
            .query("matches")
            .withIndex("by_status_time", (q) => q.eq("status", "upcoming"))
            .order("asc")
            .paginate(paginationOpts);

        // Combine live matches with upcoming matches
        const allMatches = [
            ...liveMatches.map(transformToCard),
            ...upcomingPage.page.map(transformToCard)
        ];

        return {
            ...upcomingPage,
            page: allMatches,
        };
    },
});

// Search completed matches by team names, event name, or event series
export const searchCompletedMatchesPaginated = query({
    args: {
        searchTerm: v.string(),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, { searchTerm, paginationOpts }) => {
        if (!searchTerm) {
            // If search is empty, return the standard completed matches page
            const completedPage = await ctx.db
                .query("matches")
                .withIndex("by_status_time", (q) => q.eq("status", "completed"))
                .order("desc")
                .paginate(paginationOpts);

            return {
                ...completedPage,
                page: completedPage.page.map(transformToCard),
            };
        }

        // Use the search index to find matches
        const searchResults = await ctx.db
            .query("matches")
            .withSearchIndex("by_search_terms_and_status", (q) =>
                q.search("searchTerms", searchTerm)
                    .eq("status", "completed")
            )
            .paginate(paginationOpts);

        // Transform the results to the card format
        return {
            ...searchResults,
            page: searchResults.page.map(transformToCard),
        };
    },
});

// Get full match data by vlrId
export const getMatchById = query({
    args: { vlrId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("matches")
            .withIndex("by_vlr_id", (q) => q.eq("vlrId", args.vlrId))
            .unique();
    },
});

