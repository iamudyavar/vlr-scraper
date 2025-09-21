import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    matches: defineTable({
        vlrId: v.string(), // VLR.gg match ID
        url: v.string(),
        status: v.union(v.literal("live"), v.literal("upcoming"), v.literal("completed")),
        // Using v.null() makes the type explicit for optional fields
        time: v.union(v.string(), v.null()), // ISO timestamp or null
        team1: v.object({
            name: v.string(),
            score: v.number()
        }),
        team2: v.object({
            name: v.string(),
            score: v.number()
        }),
        event: v.object({
            name: v.string(),
            series: v.string()
        }),
    })
        .index("by_vlr_id", ["vlrId"])
        .index("by_status", ["status"])
        .index("by_time", ["time"])
});