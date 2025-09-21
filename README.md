# VLR.gg Esports Tracker

Scrapes Valorant match data from VLR.gg and syncs with Convex database. Runs as a containerized Deno worker with cron scheduling.

## Quick Start

1. **Set up Convex:**
   ```bash
   npm install -g convex
   convex dev
   # Copy CONVEX_URL from dashboard
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Add your CONVEX_URL to .env
   ```

3. **Run with Docker:**
   ```bash
   npm run docker:up
   ```

## Commands

- `npm run docker:up` - Start worker
- `npm run docker:down` - Stop worker  
- `npm run docker:logs` - View logs
- `npm run test-scraper` - Test scraping locally

## Architecture

- **denoWorker.js** - Main worker with cron (every minute)
- **syncMatchData.js** - VLR.gg scraping logic
- **convex/** - Database schema and operations
- **Docker** - Containerized deployment

## Database Schema

```javascript
{
  vlrId: string,
  url: string,
  status: "live" | "upcoming" | "completed",
  time: string | null,
  team1: { name: string, score: number },
  team2: { name: string, score: number },
  event: { name: string, series: string }
}
```