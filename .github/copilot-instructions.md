# ClearCalorie — Next.js Calorie & Health Tracking Web App

## Project Overview

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS 4
- **Database:** MongoDB via Mongoose
- **Authentication:** NextAuth.js (Credentials provider)
- **Charts:** Recharts
- **Package Manager:** npm

## Tech Stack

- Next.js with App Router
- TypeScript
- Tailwind CSS
- MongoDB + Mongoose, migrations by migrate-mongo
- NextAuth.js v4
- Recharts
- date-fns
- Zod

## Commands

- `npm run dev` — Start development server
- `npm run build` — Build for production
- `npm run start` — Start production server
- `npm run lint` — Run ESLint
- `npm run db:migrate` — Apply pending data migrations (see `migrations/README.md`)
- `npm run db:reset` — Empty the database, migrate, and seed
- `npm run db:seed` — Seed the database with demo data

## Project Structure

- `app/` — Next.js App Router pages and layouts
- `components/` — React components (UI + feature components)
- `lib/` — Utility functions, database connection, auth config
  - `lib/models/` — Mongoose schemas and indexes
  - `lib/data/` — All database queries
- `migrations/` — Data migrations (migrate-mongo)
- `scripts/` — Seed, reset and weekly reports
- `public/` — Static assets
- `types/` — TypeScript type definitions

## Demo Login

- Demo credentials: `demo@example.com` / `password` (defined in `scripts/seed.ts`).
- If login with the demo user fails, the database likely hasn't been seeded yet — run `npm run db:seed`.

## Development Notes

- Use the App Router pattern (`app/` directory)
- Prefer server components; use client components only for interactivity
- Use `@/` import alias for project imports
- Keep components small and focused on a single responsibility
- Validate user input on both client and server with Zod
- Use `getServerSession(authOptions)` for protected server components

## Features

- User authentication (sign up / sign in)
- Dashboard with daily summary and progress charts
- Food logging with calories and macros
- Exercise logging with sets, reps, weight and duration
- Weight tracking over time
- Daily goals configuration
