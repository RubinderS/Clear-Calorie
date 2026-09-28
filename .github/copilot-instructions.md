# ClearCalorie — Next.js Calorie & Health Tracking Web App

## Project Overview

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS 4
- **Database:** SQLite via Prisma ORM
- **Authentication:** NextAuth.js (Credentials provider)
- **Charts:** Recharts
- **Package Manager:** npm

## Tech Stack

- Next.js with App Router
- TypeScript
- Tailwind CSS
- Prisma ORM + SQLite
- NextAuth.js v4
- Recharts
- date-fns
- Zod

## Commands

- `npm run dev` — Start development server
- `npm run build` — Build for production
- `npm run start` — Start production server
- `npm run lint` — Run ESLint
- `npx prisma migrate dev` — Run database migrations
- `npx prisma studio` — Open Prisma Studio
- `npm run db:seed` — Seed the database with demo data

## Project Structure

- `app/` — Next.js App Router pages and layouts
- `components/` — React components (UI + feature components)
- `lib/` — Utility functions, Prisma client, auth config
- `prisma/` — Prisma schema and migrations
- `public/` — Static assets
- `types/` — TypeScript type definitions

## Demo Login

- Demo credentials: `demo@example.com` / `password` (defined in `prisma/seed.ts`).
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
- Exercise logging with calories burned
- Weight tracking over time
- Daily goals configuration
