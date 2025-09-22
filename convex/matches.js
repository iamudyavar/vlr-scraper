import { mutation } from "./_generated/server";
import { matchSchema } from "./shared.js";
import { v } from "convex/values";
import { query } from "./_generated/server";
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

// Get grouped match cards for frontend display (core data only, grouped by status)
export const getGroupedMatchCards = query({
    args: {
        upcomingLimit: v.number(),
        completedLimit: v.number(),
        completedCursor: v.optional(v.string()),
    },
    handler: async (ctx, { upcomingLimit, completedLimit, completedCursor }) => {
        // 1. Live matches (small set, just collect all)
        const liveMatches = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "live"))
            .collect();

        // 2. Upcoming matches (ascending order by time)
        const upcomingMatches = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "upcoming"))
            .order("time")
            .take(upcomingLimit);

        // 3. Completed matches (descending order with pagination)
        const completedPage = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "completed"))
            .order("time", "desc")
            .paginate({ limit: completedLimit, cursor: completedCursor });

        return {
            live: liveMatches.map(transformToCard),
            upcoming: upcomingMatches.map(transformToCard),
            completed: completedPage.page.map(transformToCard),
            completedCursor: completedPage.continueCursor,
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

