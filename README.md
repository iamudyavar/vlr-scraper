# Esports Data Tracker

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