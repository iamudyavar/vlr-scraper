import { v } from "convex/values";

// Player stats schema with playerId
export const playerStatsSchema = v.object({
    playerId: v.union(v.string(), v.null()),
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

// Unified match schema
export const matchSchema = v.object({
    vlrId: v.string(),
    status: v.union(v.literal("live"), v.literal("upcoming"), v.literal("completed")),
    time: v.string(),
    team1: v.object({
        teamId: v.union(v.string(), v.null()),
        name: v.string(),
        shortName: v.string(),
        score: v.number(),
        logoUrl: v.string()
    }),
    team2: v.object({
        teamId: v.union(v.string(), v.null()),
        name: v.string(),
        shortName: v.string(),
        score: v.number(),
        logoUrl: v.string()
    }),
    event: v.object({
        eventId: v.union(v.string(), v.null()),
        name: v.string(),
        series: v.string()
    }),
    maps: v.array(mapSchema),
});