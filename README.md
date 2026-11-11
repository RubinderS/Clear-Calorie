<div align="center">

<img src="docs/logo.svg" alt="ClearCalorie logo" width="96" height="96" />

# ClearCalorie

**A self-hosted calorie, exercise and health tracker with an AI coach.**

Log food and workouts, follow a weekly exercise plan with animated how-tos,
and get an AI-written review of your week, all on your own server.

![Next.js](https://img.shields.io/badge/Next.js_16-000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-149eca?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06b6d4?logo=tailwindcss&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47a248?logo=mongodb&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ed?logo=docker&logoColor=white)

<img src="docs/screenshots/desktop-landing.png" alt="ClearCalorie landing page" width="900">

</div>

## ✨ Features

- **📊 Daily dashboard.** Rings for calories, protein, carbs, fat and today's
  exercise plan, a saturated fat limit, and weekly charts for calories,
  protein, exercise and weight.
- **🍽️ Food logging.** Calories and macros per entry, saved foods for quick
  re-logging, and optional **AI estimates**: type "2 eggs on toast with butter"
  and the AI fills in the numbers for you to review. Each food is matched to
  the bundled AUSNUT food database and the numbers come from there.
- **🏋️ Exercise plan and workouts.** Plan exercises per weekday, run guided
  sets with a tempo, voice or tone cues and music, and compare against last
  week's sets.
- **🐰 3D exercise animations.** Over 40 built-in exercises, each with a looping
  3D how-to, the muscles it works, steps, form tips and common mistakes.
- **⚖️ Body tracking.** Weight trend, waist and body fat measurements.
- **📝 AI weekly reports.** Every Monday you get a review of last week:
  numbers computed in code, a summary written by the AI, the foods to cut back
  on, and up to three goals for the coming week that the next report follows up.
- **💬 AI coach.** Chat about your own data. The coach looks up your logs,
  plan, weight and reports, and can propose entries for you to confirm.
- **🌗 Light and dark themes**, with layouts built for both desktop and mobile.

The AI features work with any OpenAI-compatible API (OpenAI, OpenRouter, Groq,
Gemini, Ollama, LM Studio) and are hidden unless you configure one.

## 📸 Screenshots

### Desktop

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/desktop-dashboard.png" alt="Dashboard"><p align="center"><b>Dashboard</b></p></td>
    <td width="50%"><img src="docs/screenshots/desktop-reports.png" alt="Weekly report"><p align="center"><b>Weekly report</b></p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/desktop-coach.png" alt="AI coach"><p align="center"><b>AI coach</b></p></td>
    <td width="50%" align="center"><img src="docs/screenshots/exercise-animation.gif" alt="3D exercise animation" width="360"><p align="center"><b>3D exercise how-to</b></p></td>
  </tr>
</table>

### Mobile

<table>
  <tr>
    <td width="25%"><img src="docs/screenshots/mobile-dashboard.png" alt="Mobile dashboard"></td>
    <td width="25%"><img src="docs/screenshots/mobile-logs.png" alt="Mobile food log"></td>
    <td width="25%"><img src="docs/screenshots/mobile-reports.png" alt="Mobile weekly report"></td>
    <td width="25%"><img src="docs/screenshots/mobile-coach.png" alt="Mobile AI coach"></td>
  </tr>
  <tr>
    <td align="center"><b>Dashboard</b></td>
    <td align="center"><b>Food log</b></td>
    <td align="center"><b>Weekly report</b></td>
    <td align="center"><b>AI coach</b></td>
  </tr>
</table>

## 🚀 Getting Started

You need Node.js 22 and MongoDB 4.4 or later.

```bash
npm install
cp .env.example .env    # set NEXTAUTH_SECRET and DATABASE_URL, e.g. mongodb://localhost:27017/clearcalorie
npm run db:migrate      # apply data migrations
npm run db:seed         # optional: demo user with sample data
npm run dev             # http://localhost:3000
```

Demo login: `demo@example.com` / `password`

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Build and run for production |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Build and run Playwright end-to-end tests |
| `npm run db:migrate` | Apply pending migrations (`db:migrate:status`, `db:migrate:down`, `db:migrate:create -- <name>`) |
| `npm run db:seed` | Seed the demo user |
| `npm run db:reset` | Empty the database, migrate and seed |
| `npm run reports:generate` | Write any due weekly reports now |

## 🐳 Docker Compose

The image bundles MongoDB, so a single container is all you need. It applies
migrations on start and keeps its data in the mounted volume.

```yaml
services:
  web:
    image: ghcr.io/rubinders/clear-calorie:main
    ports:
      - '3000:3000'
    environment:
      NEXTAUTH_SECRET: change-me-to-a-random-secret-at-least-32-characters
      # The exact origin users open in the browser
      NEXTAUTH_URL: http://localhost:3000
      # Optional: turns on AI estimates, weekly reports and the coach
      # AI_BASE_URL: https://api.openai.com/v1
      # AI_API_KEY: sk-xxxxxxxx
      # AI_MODEL: gpt-4o-mini
      # Optional: use your own MongoDB instead of the bundled one
      # DATABASE_URL: mongodb://user:password@db.example.com:27017/clearcalorie
    volumes:
      - ~/clearcalorie:/app/data
    restart: unless-stopped
    stop_grace_period: 30s
```

```bash
docker compose up -d
```

Then open [http://localhost:3000](http://localhost:3000). The repo's
[docker-compose.yml](docker-compose.yml) lists every option, including rate
limiting (Upstash) and verification emails (Resend).

> The bundled MongoDB needs a CPU with AVX (x86) or ARMv8.2 (ARM). On older
> hardware such as a Raspberry Pi 4, point `DATABASE_URL` at an external
> MongoDB 4.4.

## ⚙️ Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MongoDB connection string, with the database name in the path |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Session signing secret and the app's public origin |
| `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` | OpenAI-compatible endpoint for AI features. The coach needs a model with tool calling and streaming. `AI_API_KEY` is optional for local servers |
| `WEEKLY_REPORTS` | Set to `off` to stop the hourly weekly-report job |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Verification emails |

Health notes, food and exercise logs are sent to the configured AI service
when you use AI estimates, weekly reports or the coach.

### 🥗 Food database

AI estimates take their numbers from [AUSNUT 2023](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/ausnut),
the Australian food composition database from FSANZ. It ships with the app
as `datasets/ausnut.json` (3,741 foods) and is loaded into MongoDB when the
app starts. Nothing to set up; it reloads only when the file changes, and
users' saved matches are kept.

How an estimate uses it:

1. The AI splits the meal into foods, each with an amount. Combined dishes are
   split into their parts: "daal chawal" becomes daal and rice.
2. Each food is matched to a database entry: one remembered from an earlier
   log, or one the AI picks from search results. The AI can only pick entries
   it was shown, or none.
3. Matched foods get their numbers from the database, using its household
   measures for amounts such as "1 cup". Foods it doesn't have (e.g. most
   branded products) keep the AI's numbers.

The food form lists each food with its match, which you can change. When you
log the food, each match is remembered for you, so "chawal" maps to the same
entry next time. The bundled file also has shared matches for common names
such as daal, chawal and roti.

To update it for a new AUSNUT release, download these files from its
[data files page](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/ausnut/data-files)
into `data/ausnut/`, run `npm run foods:build` and commit the new
`datasets/ausnut.json`:

- AUSNUT 2023 - Food details
- AUSNUT 2023 - Food nutrient profiles
- AUSNUT 2023 - Food measures

AUSNUT 2023 © Food Standards Australia New Zealand, used under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). FSANZ doesn't
endorse this app.

## 🧱 Tech Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · MongoDB with
Mongoose and migrate-mongo · NextAuth.js · Recharts · Three.js · Tone.js ·
decimal.js for exact nutrition arithmetic.

## 📁 Project Structure

- `app/`: pages and API routes (App Router)
- `components/`: React components, including the 3D exercise animations
- `lib/`: auth, data access (`lib/data/`), models (`lib/models/`), AI chat tools and the exercise catalog
- `datasets/`: the bundled AUSNUT food database
- `migrations/`: data migrations ([migrations/README.md](migrations/README.md))
- `scripts/`: seed, reset and weekly report scripts
- `docs/`: how the exercise animations are built ([docs/exercise-animations.md](docs/exercise-animations.md))
