# Valorant Data Scraper

Scrapes Valorant match data from VLR.gg and syncs it to a Convex backend. Designed for continuous operation with a low-frequency scanner and high-frequency trackers.

## Prerequisites

- Node.js 20+ (for local development)
- Docker (for containerized run)
- A Convex deployment (URL + API Key)

## Environment

This service reads configuration from `.env.local`.

```bash
# .env.local
CONVEX_URL=https://your-convex-deployment.convex.cloud
CONVEX_API_KEY=your_convex_function_api_key
```

Note: The worker loads `.env.local` explicitly at runtime. When running with Docker, the file is provided via `--env-file .env.local`.

## Quick start (Docker)

1) Build the image first:
```bash
npm run docker:build
```

2) Run the worker container:
```bash
npm run docker:run
```

To stop the container, use your Docker tooling (the script runs it in foreground). For background usage, you can run:
```bash
docker run -d --env-file .env.local --name vlr-worker esports-tracker-worker
```

To view logs for a background container:
```bash
docker logs -f vlr-worker
```

## Local development

Install dependencies and run tests/utilities locally:

```bash
npm install
npm run test-scraper   # scrape a sample match set
npm run test-convex    # verify Convex connectivity
node worker.js         # run the worker without Docker (uses .env.local)
```

## Architecture

The worker has two cooperating loops: a scanner and trackers.

- Scanner (every ~2 min):
  - Fetches match URLs from the VLR main page (live/upcoming) and results page.
  - Parses full match details for a deduplicated set of URLs.
  - Compares the parsed dataset against an in-memory cache and upserts to Convex only when data actually changes.
  - Detects live matches and ensures a dedicated tracker is running for each.

- Trackers (every ~30 sec per live match):
  - For each live match, poll detailed data and upsert via `matches:upsertMatch`.
  - Stop naturally once the match is no longer live (scanner prunes stale trackers).

- State management:
  - `activeTrackers: Map<vlrId, intervalId>` keeps one interval per live match.
  - An in-memory deep-copied cache avoids unnecessary DB writes when nothing changed.

- Convex integration:
  - Uses `ConvexHttpClient` with `CONVEX_URL`.
  - Mutations require `CONVEX_API_KEY` for authorization.

Key timings (defaults in `worker.js`):
- Scanner interval: ~120s
- Tracker interval: ~30s

## Commands

- `npm run docker:build` – Build Docker image `esports-tracker-worker`.
- `npm run docker:run` – Run the worker using `.env.local`.
- `npm run test-scraper` – Test scraping locally.
- `npm run test-convex` – Test Convex connectivity.

## Healthcheck

The Docker image includes a basic healthcheck that verifies the `worker.js` process is running.
