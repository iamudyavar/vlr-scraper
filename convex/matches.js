import { action, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { matchSchema, detailedMatchSchema } from "./shared.js";
import { v } from "convex/values";
import { query } from "./_generated/server";
import _ from 'lodash';


/**
 * Upserts a batch of matches into the database.
 */
export const upsertBatch = mutation({
    // This mutation takes an array of matches
    args: {
        scrapedMatches: v.array(matchSchema)
    },
    handler: async (ctx, args) => {
        const results = { inserted: 0, updated: 0, unchanged: 0 };

        for (const match of args.scrapedMatches) {
            // Find an existing match using the `by_vlr_id` index
            const existingMatch = await ctx.db
                .query("matches")
                .withIndex("by_vlr_id", (q) => q.eq("vlrId", match.vlrId))
                .unique();

            if (!existingMatch) {
                // If it doesn't exist, insert it
                await ctx.db.insert("matches", match);
                results.inserted++;
            } else {
                // If it exists, check if an update is needed
                const needsUpdate =
                    existingMatch.status !== match.status ||
                    existingMatch.team1.score !== match.team1.score ||
                    existingMatch.team2.score !== match.team2.score;

                if (needsUpdate) {
                    // If data has changed, patch the existing document
                    await ctx.db.patch(existingMatch._id, {
                        status: match.status,
                        time: match.time,
                        team1: match.team1,
                        team2: match.team2,
                    });
                    results.updated++;
                } else {
                    results.unchanged++;
                }
            }
        }
        return results;
    },
});

export const upsertMatchesAction = action({
    args: {
        scrapedMatches: v.array(matchSchema)
    },
    handler: async (ctx, args) => {
        // Actions can call mutations
        const result = await ctx.runMutation(internal.matches.upsertBatch, {
            scrapedMatches: args.scrapedMatches,
        });
        return result;
    },
});

/**
 * Upserts detailed match data and syncs the main matches table.
 */
export const upsertMatchDetails = mutation({
    args: {
        details: detailedMatchSchema
    },
    handler: async (ctx, args) => {
        const { details } = args;

        // 1. Upsert the detailed data
        const existingDetails = await ctx.db
            .query("matchDetails")
            .withIndex("by_vlr_id", (q) => q.eq("vlrId", details.vlrId))
            .unique();

        if (!existingDetails) {
            // First time seeing this match, insert it.
            await ctx.db.insert("matchDetails", details);
        } else {
            // It exists, so we must compare before patching.
            // We strip out Convex-specific fields for a clean comparison.
            const { _id, _creationTime, ...comparableExisting } = existingDetails;

            if (!_.isEqual(comparableExisting, details)) {
                // Only patch if the data has actually changed.
                await ctx.db.patch(existingDetails._id, details);
            } else {
                // Data is identical, do nothing. This saves a write.
                return { success: true, vlrId: details.vlrId, status: 'unchanged' };
            }
        }

        // 2. Sync the main 'matches' table for consistency
        const mainMatch = await ctx.db
            .query("matches")
            .withIndex("by_vlr_id", (q) => q.eq("vlrId", details.vlrId))
            .unique();

        if (mainMatch) {
            await ctx.db.patch(mainMatch._id, {
                status: details.overallStatus,
                team1: { ...mainMatch.team1, score: details.team1.score },
                team2: { ...mainMatch.team2, score: details.team2.score },
            });
        }
        return { success: true, vlrId: details.vlrId, status: 'updated' };
    },
});

// Fetch matches grouped into live, upcoming, completed
export const getGroupedMatches = query({
    args: {
        upcomingLimit: v.number(),
        completedLimit: v.number(),
        completedCursor: v.optional(v.string()),
    },
    handler: async (ctx, { upcomingLimit, completedLimit, completedCursor }) => {
        // 1. Live matches (small set, just collect all)
        const live = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "live"))
            .collect();

        // 2. Upcoming with a known time (ascending order)
        const upcomingWithTime = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "upcoming"))
            .filter((q) => q.neq(q.field("time"), null))
            .order("time")
            .take(upcomingLimit);

        // 3. Upcoming with null time (unsorted, append to end)
        const upcomingWithoutTime = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "upcoming"))
            .filter((q) => q.eq(q.field("time"), null))
            .collect();

        const upcoming = [...upcomingWithTime, ...upcomingWithoutTime];

        // 4. Completed matches (must have time → descending order with pagination)
        const completedPage = await ctx.db
            .query("matches")
            .withIndex("by_status", (q) => q.eq("status", "completed"))
            .order("time", "desc")
            .paginate({ limit: completedLimit, cursor: completedCursor });

        return {
            live,
            upcoming,
            completed: completedPage.page,
            completedCursor: completedPage.continueCursor,
        };
    },
});

