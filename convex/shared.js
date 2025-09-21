import { v } from "convex/values";

// Basic match schema (for list view)
export const matchSchema = v.object({
    vlrId: v.string(),
    url: v.string(),
    status: v.union(v.literal("live"), v.literal("upcoming"), v.literal("completed")),
    time: v.union(v.string(), v.null()),
    team1: v.object({ name: v.string(), score: v.number() }),
    team2: v.object({ name: v.string(), score: v.number() }),
    event: v.object({ name: v.string(), series: v.string() }),
});

// Player stats schema
export const playerStatsSchema = v.object({
    playerName: v.string(),
    teamName: v.string(),
    agent: v.object({
        name: v.union(v.string(), v.null()),
        iconUrl: v.union(v.string(), v.null()),
    }),
    stats: v.object({
        kills: v.number(),
        deaths: v.number(),
        assists: v.number(),
        acs: v.number(),
        adr: v.number(),
        kastPercent: v.number(),
        headshotPercent: v.number(),
        firstKills: v.number(),
        firstDeaths: v.number(),
    }),
});

// Round schema
export const roundSchema = v.object({
    roundNumber: v.number(),
    winningTeam: v.union(v.string(), v.null()),
    winCondition: v.union(v.string(), v.null()),
});

// Map schema
export const mapSchema = v.object({
    name: v.string(),
    status: v.string(),
    pickedBy: v.union(v.string(), v.null()),
    team1Score: v.number(),
    team2Score: v.number(),
    stats: v.array(playerStatsSchema),
    rounds: v.array(roundSchema),
});

// Detailed match schema
export const detailedMatchSchema = v.object({
    vlrId: v.string(),
    overallStatus: v.string(),
    team1: v.object({
        name: v.string(),
        shortName: v.string(),
        logoUrl: v.union(v.string(), v.null()),
        score: v.number(),
    }),
    team2: v.object({
        name: v.string(),
        shortName: v.string(),
        logoUrl: v.union(v.string(), v.null()),
        score: v.number(),
    }),
    maps: v.array(mapSchema),
});