import { defineSchema, defineTable } from "convex/server";
import { matchSchema } from "./shared.js";

export default defineSchema({
    matches: defineTable(matchSchema)
        .index("by_vlr_id", ["vlrId"])
        .index("by_status", ["status"])
        .index("by_time", ["time"])
        .index("by_status_time", ["status", "time"])
        .searchIndex("by_search_terms_and_status", {
            searchField: "searchTerms",
            filterFields: ["status"],
        }),
});