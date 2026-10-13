# ClearCalorie

A Next.js web app for tracking calories, exercise, weight, and health goals.

## Features

- User authentication (sign up / sign in) with NextAuth.js
- Dashboard with daily calorie summary and progress charts
- Food logging with calories and macros
- Exercise logging with calories burned and duration
- Weight tracking over time
- Daily nutrition goals

## Tech Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS 4
- Prisma ORM with SQLite
- NextAuth.js (credentials provider)
- Recharts for data visualization

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables:

```bash
cp .env.example .env.local
```

Edit `.env.local` and set a strong `NEXTAUTH_SECRET`.

3. Run the database migration:

```bash
npx prisma migrate dev
```

4. Seed the database with a demo user (optional):

```bash
npm run db:seed
```

5. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## AI Food Estimates (optional)

When configured, the food form shows an **Estimate** button. Describe what you
ate (e.g. "2 eggs on toast with butter" or "Coles chicken caesar wrap") and the
AI fills in calories, protein, carbs, fat and saturated fat for you to review
before logging. The prompt is tuned for Australian foods, brands and serving
sizes.

On the Goals page you can add **Health notes** (e.g. "high LDL cholesterol").
When notes are set, each AI estimate also checks the food against them and shows
a "Heads up" alert if it may not suit you. Notes are sent to the configured AI
service with each estimate. The field is hidden when AI is off.

The feature is off unless both `AI_BASE_URL` and `AI_MODEL` are set. It works
with any OpenAI-compatible `/chat/completions` endpoint (OpenAI, OpenRouter,
Groq, Gemini's OpenAI-compatible API, Ollama, LM Studio):

```bash
AI_BASE_URL="https://api.openai.com/v1"
AI_API_KEY="sk-xxxxxxxx"   # optional for local servers
AI_MODEL="gpt-4o-mini"
```

These are read at runtime, so the Docker image picks them up from the container
environment without a rebuild (see `docker-compose.yml`). Requests are limited to
20 per user every 10 minutes when Upstash rate limiting is configured.

## Weekly Reports (optional)

When AI is configured, a **Reports** page appears. Early each Monday (in the
user's own timezone) the server writes a review of the previous Monday–Sunday
week: calories and macros against goals, the foods that pushed saturated fat or
other limits over, exercise plan adherence, strength progress and weight, all
related to the user's health notes.

- **Numbers come from code, words from the AI.** Metrics, top food sources and
  strength progress are computed in `lib/weekly-report-metrics.ts`; the AI only
  writes the summary and proposes up to three measurable goals for the next week
  (e.g. "paneer at most once", "average 140 g protein").
- **Each report follows up on the last.** The next report checks those goals
  against the logs in code (met / improved / missed, with a streak) and the AI
  writes the follow-up. The Reports page also shows progress on them so far
  this week.
- **Timing.** The browser's timezone is saved on the user when they open the
  app, along with when they were last seen. A job inside the server checks
  hourly and writes last week's report for users whose week has ended, skipping
  users with no saved timezone, users inactive for 30 days and weeks with no
  food, exercise or weight logged.

Health notes and the week's food and exercise logs are sent to the configured
AI service. Set `WEEKLY_REPORTS=off` to turn the hourly job off. To run it once
by hand, or for one user and week:

```bash
npm run reports:generate
npm run reports:generate -- --email you@example.com --week 2026-10-05 --timezone Australia/Sydney
```

## Demo Credentials

- Email: `demo@example.com`
- Password: `password`

## Available Scripts

- `npm run dev` — Start development server with Turbopack
- `npm run build` — Build for production
- `npm run start` — Start production server
- `npm run lint` — Run ESLint
- `npm test` — Run decimal arithmetic regression tests
- `npm run db:migrate` — Run Prisma migrations
- `npm run db:studio` — Open Prisma Studio
- `npm run db:seed` — Seed the database
- `npm run reports:generate` — Write any due weekly reports now

## Numeric Calculations

Health totals, net calories, goal percentages, remaining amounts, chart bounds,
and exercise rounding use `decimal.js` with 40 significant digits. Decimal
accumulators are converted to numbers only for component, API, and chart
boundaries. Food nutrition is still stored as Prisma `Float` / SQLite `REAL`;
this prevents arithmetic rounding artifacts, not arbitrary-precision storage.

## Project Structure

- `app/` — Next.js App Router pages and layouts
- `components/` — Reusable React components
- `lib/` — Utility functions, Prisma client, and auth configuration
- `prisma/` — Prisma schema and migrations
- `public/` — Static assets
- `types/` — TypeScript declarations
