import { mutation } from "./_generated/server";
import { matchSchema } from "./shared.js";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import _ from 'lodash';

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
        match: matchSchema,
        apiKey: v.string()
    },
    handler: async (ctx, args) => {
        await validateApiKey(args.apiKey);

        const { match } = args;

        // Find existing match
        const existingMatch = await ctx.db
            .query("matches")
            .withIndex("by_vlr_id", (q) => q.eq("vlrId", match.vlrId))
            .unique();

        if (!existingMatch) {
            await ctx.db.insert("matches", match);
            return { success: true, vlrId: match.vlrId, status: 'inserted' };
        } else {
            const { _id, _creationTime, ...comparableExisting } = existingMatch;
            if (!_.isEqual(comparableExisting, match)) {
                await ctx.db.patch(existingMatch._id, match);
                return { success: true, vlrId: match.vlrId, status: 'updated' };
            } else {
                return { success: true, vlrId: match.vlrId, status: 'unchanged' };
            }
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

