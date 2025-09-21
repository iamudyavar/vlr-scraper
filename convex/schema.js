import { defineSchema, defineTable } from "convex/server";
import { matchSchema, detailedMatchSchema } from "./shared.js";


export default defineSchema({
    matches: defineTable(matchSchema)
        .index("by_vlr_id", ["vlrId"])
        .index("by_status", ["status"])
        .index("by_time", ["time"]),

    matchDetails: defineTable(detailedMatchSchema)
        .index("by_vlr_id", ["vlrId"]),
});