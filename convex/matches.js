import { action, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Define the schema for a match
const matchSchema = v.object({
    vlrId: v.string(),
    url: v.string(),
    status: v.union(v.literal("live"), v.literal("upcoming"), v.literal("completed")),
    time: v.union(v.string(), v.null()),
    team1: v.object({ name: v.string(), score: v.number() }),
    team2: v.object({ name: v.string(), score: v.number() }),
    event: v.object({ name: v.string(), series: v.string() }),
});

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