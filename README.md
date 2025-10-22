# Valorant Data Scraper

This is a live scraper that pulls data from VLR.gg and syncs it to a Convex backend.

## Prerequisites

- Node.js 20+ (for local development)
- Docker (for containerized run)
- A Convex deployment (URL + API Key)
- (Optional) A webhook to get notifications from the scraper

## Environment

This service reads configuration from `.env.local`.

```bash
# .env.local
CONVEX_URL=https://your-convex-deployment.convex.cloud
CONVEX_API_KEY=your_convex_function_api_key
WEBHOOK_URL=your_webhook_url
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

## Local development

Install dependencies and run tests/utilities locally:

```bash
npm install
npm run test-scraper   # scrape a sample match set
npm run test-convex    # verify Convex connectivity
node worker.js         # run the worker without Docker (uses .env.local)
```

## Commands

- `npm run docker:build` – Build Docker image `esports-tracker-worker`.
- `npm run docker:run` – Run the worker using `.env.local`.
- `npm run test-scraper` – Test scraping locally.
- `npm run test-convex` – Test Convex connectivity.