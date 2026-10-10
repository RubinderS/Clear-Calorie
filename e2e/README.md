# End-to-end tests

Playwright tests for the UI, the API routes and what they store. They run against a production build, with every external service (AI, email, rate limiting) either off or replaced by a local mock.

```bash
npx playwright install chromium   # once
npm run test:e2e                  # build, then run everything
npm run test:e2e:only             # rerun against the existing build
npm run test:e2e:ui               # Playwright UI mode
npx playwright test --project=api # one project
npx playwright test --list        # every case, by ID
```

## How it runs

`playwright.config.ts` starts three servers. Each app server has every env var set explicitly, so the real keys in `.env` / `.env.local` never apply. An empty string switches a feature off.

| Server | Port | Database | Features |
|---|---|---|---|
| `mock` | 3199 | — | Fake OpenAI-compatible `/v1/chat/completions` and Resend `/emails` |
| `app` | 3100 | `prisma/e2e.db` | AI, email verification and rate limiting all off |
| `full` | 3101 | `prisma/e2e-full.db` | AI and email verification on, both served by the mock |

Each database is recreated from the migrations on every run (`e2e/scripts/prepare-db.ts`). Your `prisma/dev.db` is never touched.

| Project | Specs | Server |
|---|---|---|
| `api` | `specs/api` (request/response contracts, validation, authorization) | `app` |
| `chromium` | `specs/app` (UI flows, Desktop Chrome) | `app` |
| `mobile` | `specs/app` tests tagged `@mobile` (Pixel 7) | `app` |
| `full` | `specs/full` (AI estimates, sign-up email verification) | `full` |
| `external` | `specs/external` (Upstash rate limits) | opt-in, see below |

### Mock AI scenarios
Put a marker in the food description or exercise name to pick a response: `[ai:error500]`, `[ai:invalid]`, `[ai:empty]`, `[ai:missing-calories]`, `[ai:fenced]`, `[ai:overflow]`, `[ai:strings]`. When health notes are saved, `[ai:avoid]`, `[ai:caution]`, `[ai:ok]` and `[ai:bad-alert]` set the health check. `GET /__requests?contains=…` and `GET /__emails?to=…` return what the app sent, so tests can assert on prompts and verification links.

### External project
Rate limiting needs a real Upstash database. Set `E2E_UPSTASH_REDIS_REST_URL` and `E2E_UPSTASH_REDIS_REST_TOKEN` to a **test-only** instance, and the `external` project and its server (port 3102) are added automatically.

## Writing tests
- Import `test` and `expect` from `fixtures/test.ts`.
  - `user` is a fresh verified user per test, so tests run in parallel without sharing data.
  - `authedPage` is a page already signed in as that user.
  - `api` / `apiAs(user, {timeZone})` are signed-in request contexts.
  - `db` is Prisma on the project's database.
  - `mock` reads the mock server's logs.
- Use `fixtures/db.ts` to seed rows the API can't create, such as past dates, tokens and plan snapshots. Use `fixtures/dates.ts` for timezone-aware dates.
- Uncaught page errors and hydration warnings fail the test. Opt out with `test.use({allowPageErrors: true})`.
- `window.confirm` is auto-dismissed. Use `onNextDialog(page, 'accept')` to accept it and read its message.
- Workout timers are driven with `page.clock` (see `workout.spec.ts`).
- Test titles start with a case ID (`FOOD-03`, `SEC-04`, …) so a failure maps back to the catalog.

## Current findings
Tests marked `// FINDING:` assert today's behaviour, which looks unintended. Fix the app, then update the test.

| ID | Finding |
|---|---|
| FA-06 | `DELETE /api/food` deletes past entries. Exercise returns 403, and the UI disables the button. |
| FOOD-12 | The food form shows nothing when logging fails; the exercise form shows the error. |
| SEC-04 | Deleting another user's saved item returns `{success: true}` although nothing is deleted. |
| GA-03 | Saturated fat goal ≤ fat goal is enforced only in the form, not by `/api/goals`. |
| REG-A3, FA-07 | Malformed JSON returns 500 instead of 400. |
| REG-09 | `/register` doesn't redirect signed-in users (`/login` does). |
| Q-02b | White on the brand green is 3.33:1 (light) and 2.3:1 (dark); WCAG AA needs 4.5:1. Marked `test.fail()`. |
| RL-03 | Rate limits are keyed on the client-supplied `x-forwarded-for` header (external project). |
