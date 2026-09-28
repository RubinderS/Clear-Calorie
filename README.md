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

## Demo Credentials

- Email: `demo@example.com`
- Password: `password`

## Available Scripts

- `npm run dev` — Start development server with Turbopack
- `npm run build` — Build for production
- `npm run start` — Start production server
- `npm run lint` — Run ESLint
- `npm run db:migrate` — Run Prisma migrations
- `npm run db:studio` — Open Prisma Studio
- `npm run db:seed` — Seed the database

## Project Structure

- `app/` — Next.js App Router pages and layouts
- `components/` — Reusable React components
- `lib/` — Utility functions, Prisma client, and auth configuration
- `prisma/` — Prisma schema and migrations
- `public/` — Static assets
- `types/` — TypeScript declarations
