# AGENTS.md

Instructions for AI coding agents working in this repository.

## Repository Layout

- `frontend/` is the Angular 22 application (standalone, zoneless, SCSS, Vitest, angular-eslint).
- `backend/` is the ASP.NET Core 10 Web API solution (`Erudi.slnx`).
  - `backend/src/Erudi.Api/` hosts the API.
  - `backend/tests/Erudi.Api.Tests/` holds the xUnit v3 tests, run through Microsoft.Testing.Platform.
- The root `package.json` provides convenience scripts for both sides.
- Production: `compose.prod.yaml` is the VPS stack, `deploy/` holds its Caddyfile, Mailcow nginx block and database scripts, and `.github/workflows/ci.yml` checks both apps and publishes the images (see Deployment).

## Architecture

### Frontend

- `src/app/app.ts` is the shell; routes live in `src/app/app.routes.ts` and every page is lazy-loaded with `loadComponent`.
- Feature-based layout:
  - `src/app/core/` holds app-wide singletons such as API clients, interceptors and guards.
  - `src/app/features/<feature>/` holds one folder per business feature.
  - `src/app/shared/` holds reusable UI components, pipes and directives.
- Components use `ChangeDetectionStrategy.OnPush`, signals, `inject()` and the built-in control flow.
- Pages load data with `rxResource` over the API services in `core/` (stable in Angular 22). `value()` throws while a resource is in error, so templates check `hasValue()` first; a 404 shows a "not found" `.state-card`, any other error an `.alert--retry` with a retry button.
- API calls use relative `/api/...` URLs. In development, `proxy.conf.json` forwards them to the backend on `http://localhost:5080`, keeping the `Host` header (`changeOrigin: false`): the sign-in callback address is built from it and must stay `http://localhost:4200/api/auth/callback`.
- The design follows the mockup (`Maquette-Boite-de-Leitner.pdf`, screen numbers in component docs). Colors, radii and the Outfit font (`'Outfit Variable'`, bundled from `@fontsource-variable/outfit`) are CSS variables in `src/styles.scss`, with shared `.page`, `.button`, `.field` and `.card` classes; components use the variables, never raw hex values. Plic, the mascot, is `app-plic` with a `mood` (`happy`, `surprised`, `proud`, `sleepy`); it is decorative, so the screen text must say what it means.
- Shared UI: `app-box-meter` (the five box bars), `app-delete-confirmation` (asks before deleting), and the global `.state-card` and `.alert--retry` classes.
- Texts go through Transloco. `src/i18n/fr.json` is the only language for now and loads as a hashed lazy chunk before the first screen. Templates use the `transloco` pipe; validation messages are translation keys. Every TestBed gets the French texts through `src/test-providers.ts` (`providersFile`), so specs assert French strings.
- Counted texts have `.one` and `.other` forms, picked with `countKey()` (`shared/i18n`); French uses the singular for 0 and 1.
- Numbers and dates follow the active language: counts that can pass 999 go through `Intl.NumberFormat` ("2 300"), and "il y a 3 jours" comes from `relativeDay()` (`shared/i18n`), which counts the device's calendar days.
- Auth: learners sign in with their Synapse account (the `synapse-auth` identity service, shared by every Synapse Engineering app), never with a password typed into Erudi. The sign-in screen (`features/auth/sign-in`) sends the browser to `/api/auth/login` through `BROWSER_LOCATION`; the identity pages create accounts, recover passwords and delete accounts, and Settings links to them (`SYNAPSE_ACCOUNT_URL`). The session is then Erudi's own HttpOnly cookie the code never sees. `AuthStore` (`core/auth`) holds the user; `provideAppInitializer` restores it before the first route, so the guards read it synchronously. `signedInGuard` sends a learner who has not accepted Erudi's terms yet (`termsAccepted`, a newcomer from another Synapse app) to `/accept-terms`. Signing out goes on to the identity service's end-session address, which signs out of every app. `sessionExpiryInterceptor` signs out locally on any 401 outside `/api/auth/`.
- Forms use signal forms (`@angular/forms/signals`, stable in Angular 22) with `[formRoot]` and `[formField]`. Show field errors through `visibleError()` (only once touched) and set `aria-invalid`/`aria-describedby`. Server errors about a field are returned from the submission action; errors about the whole form go in a separate `formError` signal, because a root submission error would block re-sending the same values.
- An `<input type="email">` already strips surrounding spaces; do not trim again.
- Signed-in screens sit under one `signedInGuard` route: the tabs are children of `TabShell` (bottom bar), while decks (`decks/...`), study sessions (`study/quiz`, `study/practice`), public decks (`explore/:deckId`, `.../test`, `.../report`), `publish` and `accept-terms` are full-screen. The old `sign-up`, `forgot-password` and `reset-password` addresses lead to `sign-in`, `settings/delete-account` to `settings`. Routes give a translation key as `title`.
- `/terms` (`features/legal`) is public and holds the terms of use and the privacy policy. They state facts: 30-day session cookie, 15-minute sign-in cookies, no password in Erudi, 14-day backups, no third-party service, OVHcloud hosting, what deleting the Synapse account erases. Keep them true when the app or its deployment changes, and move `TERMS_UPDATED_ON` with any change to the `terms` texts. Screens in progress (accept-terms, publish) open them in a new tab.
- Nothing loads from another origin, which the privacy policy promises: no CDN, font service or analytics without changing the terms first.
- Settings (screen 17) has the account, the terms and the link to the Synapse account page; the reminder, notifications, theme, language and Premium rows of the mockup are not built yet.
- Explorer (`features/explore`, `core/explore`): `ExploreApi` covers both the public side (search, sheet, test, copy, report) and the author's publication. The search text and category live in the query string, so "back" finds the same list; the field only follows its own typing, never the address, and the search waits for a pause in typing. `StudySession` runs the public test as a third `mode` (`test`): it posts nothing per card and saves the score at the end.
- Route params, query params (`?deckId=`) and route data (`mode`) reach components as inputs (`withComponentInputBinding()`); specs that render routes must enable it too. Ids from the address bar are encoded before going into an API URL.
- `timeZoneInterceptor` sends the device's IANA time zone in `X-Time-Zone` with every `/api/` call.

### Backend

- `Program.cs` configures the pipeline: problem details for errors, health checks on `/api/health`, and OpenAPI at `/openapi/v1.json` in Development only. No HTTPS redirection or HSTS: the proxies in front handle both (see Deployment).
- Expose every endpoint under `/api/*`. Controllers go in `src/Erudi.Api/Controllers/`.
- Keep controllers thin and move business logic into injectable services.
- `Directory.Build.props` enables nullable reference types and treats warnings as errors for every project.
- Data: PostgreSQL 18 through EF Core (Npgsql) with snake_case names (`EFCore.NamingConventions`). Migrations live in `src/Erudi.Api/Data/Migrations/` and run at startup. Add one with `dotnet ef migrations add <Name> --project src/Erudi.Api --output-dir Data/Migrations` from `backend/` (`dotnet-ef` is a local tool: `dotnet tool restore` once). Read services from configuration lazily (inside the factory), so test hosts can override them.
- In production Erudi has its own database and role inside Plano's Postgres container, next to the identity service's. `users` holds a copy of the Synapse account (its `sub` is the id; username and e-mail are refreshed at each sign-in, so they are not unique) and when Erudi's terms were accepted. Never touch Plano's database.
- Auth: an opaque 32-byte token in the `erudi_session` cookie (HttpOnly, SameSite=Lax, path `/api`, Secure outside Development), stored only as its SHA-256. `SessionAuthenticationHandler` turns it into `HttpContext.User`, so endpoints only need `[Authorize]` and `User.GetUserId()`. Each session keeps the identity session id (`oidc_sid`) that opened it.
- `AllowedOriginMiddleware` refuses state-changing requests whose Origin or Referer is not `Frontend:Url` (CSRF). Running the Angular app on another port or domain means setting `Frontend__Url`.
- `[EnableRateLimiting(AuthSetup.RateLimitPolicy)]` limits auth endpoints per client IP (`Auth:RateLimitPerMinute`). The IP comes from `X-Forwarded-For` of private-network proxies only (`SecuritySetup`).
- Sign-in (`AuthSetup`): ASP.NET Core's OpenID Connect handler, with the `Identity` settings (`Issuer`, `ClientId`, `ClientSecret`), the code flow with PKCE and `ResponseMode = Query` (a form POST from the identity service's origin would be refused by `AllowedOriginMiddleware`). Its state and nonce cookies are SameSite=Lax on `/api/auth/callback`. `OnTicketReceived` opens Erudi's session and returns to `returnTo` (`ReturnPath.Safe`: this site's paths only); a cancelled or failed sign-in comes back to `/sign-in?signIn=cancelled|failed`.
- The identity service calls the API directly, server to server: `POST /api/auth/backchannel-logout` (a logout token ends the sessions of that identity session, or of the whole account) and `POST /api/auth/account-deleted` (a signed deletion notice). `IdentityTokens` checks both against the keys the service publishes. Production reaches them as `http://erudi-api:8080` over Plano's network, as `synapse-auth`'s clients file says.
- `POST /api/account/terms` records that the learner accepted Erudi's terms. Deleting the Synapse account deletes the learner here: everything a learner owns goes with them through ON DELETE CASCADE, as the terms promise: a new table holding a learner's data must cascade from `users`, or from a table that does.
- Use `TimeProvider` for the current time, never `DateTime.UtcNow`, so tests can move the clock.
- Decks and cards (`Decks/`) belong to one user: every query filters on the owner, and someone else's deck or card answers 404, never 403. `DeckRules` holds the lengths and the anti-abuse limits (200 decks, 2000 cards per deck).
- Leitner (`Study/`): `LeitnerSchedule` holds the five boxes and their intervals (1, 2, 4, 7, 14 days). Due dates are `DateOnly` days of the learner; get "today" from `StudyCalendar`, which reads `X-Time-Zone` and falls back to Europe/Brussels. A quiz answer moves the card with a conditional update (only if it is still where it was read), so it never moves twice; `card_reviews` logs each answer and keeps it when the card is deleted. Practice writes nothing.
- Explorer (`Explore/`): a publication shows the owner's deck as it is now (never its boxes) under its own title, category and description; a deck that is not published answers 404 to every public endpoint, and the Explorer lists only decks with cards. `deck_uses` counts each learner once per deck (the author never) and keeps their best score; a copy is a new deck of the learner's, in box 1 and due today. Reports are one per learner and deck and are only logged as warnings: there is no moderation screen yet. `Deck.UpdatedAt` dates changes to the name or the cards' text, not box moves.
- Upserts (`INSERT … ON CONFLICT`) use `Database.ExecuteSqlAsync` with an interpolated string, which EF Core turns into parameters; keep the table and column names in step with the model.
- Errors returned to the frontend are problem details in English; the frontend picks the French text from the status code and the `errors` keys (JSON names, e.g. `username`).

## Common Commands

Run these from the repository root.

| Task | Command |
| --- | --- |
| Local PostgreSQL (Docker, port 5433) | `npm run db:start`, `npm run db:stop` |
| Frontend dev server (port 4200) | `npm run start:front` |
| Backend dev server with hot reload (port 5080) | `npm run start:back` |
| Lint (ESLint + `dotnet format`) | `npm run lint` |
| Tests (Vitest + xUnit) | `npm test` |
| Builds | `npm run build` |

## Deployment

- Target: the OVH VPS shared with Mailcow and Plano (see Plano's AGENTS.md), at `erudi.synapseengineering.dev`. Its Cloudflare record is the owner's to set (DNS only, like Plano's). Never change DNS, the firewall, Mailcow's ports or its certificate flow: a mistake breaks e-mail. The README has the first-deployment steps.
- Flow: CI (`.github/workflows/ci.yml`) lints, tests and builds both apps, then, only on `main`, pushes `ghcr.io/nefrozdev/erudi-api` and `erudi-web`. Keep its commands in step with the package scripts. Never build images on the VPS; there: `git pull`, then `docker compose -f compose.prod.yaml pull && docker compose -f compose.prod.yaml up -d --wait`.
- Stack: `erudi-web` (Caddy, `frontend/Dockerfile`, `deploy/Caddyfile`) serves Angular and proxies `/api` to `erudi-api` (`backend/Dockerfile`, port 8080). Both images build from the repository root and run unprivileged; keep `mem_limit` on both. Service names stay `erudi-*`: a service name becomes a host name on Plano's and Mailcow's networks, where `api` or `web` would also answer for Plano's.
- Database: Erudi's own role and database in Plano's PostgreSQL, created once by `deploy/create-database.sh`. The API joins Plano's network (`PLANO_NETWORK`) and reaches it as `db`. `deploy/backup.sh` dumps it nightly and keeps 14 days, as the terms say.
- HTTPS: Mailcow's nginx terminates it (`deploy/mailcow-erudi.conf`, domain in Mailcow's `ADDITIONAL_SAN`) and reaches `erudi-web` over the Mailcow network. Caddy keeps nginx's `X-Forwarded-For` (`trusted_proxies`) and `SecuritySetup` trusts two private hops: keep both, or every user shares one rate-limit bucket.
- Settings come from the VPS `.env` only (template: `.env.production.example`), passed as `ConnectionStrings__Erudi`, `Frontend__Url` and `Identity__*` (`IDENTITY_CLIENT_SECRET` is the `ERUDI_CLIENT_SECRET` of synapse-auth's `.env`). The database password is hex: it sits in the connection string.

## Coding Guidelines

- Keep changes scoped to the requested area and avoid unrelated refactors.
- When building or changing code, add or update the matching tests in the same change:
  - frontend specs go next to the code as `*.spec.ts`;
  - backend tests go in `backend/tests/`. They need Docker running: Testcontainers starts one PostgreSQL 18 container per run, and `ErudiApiFactory` gives each test class its own database, a `FakeTimeProvider` clock and a `FakeIdentityProvider` (discovery, keys, token endpoint) that signs ID tokens, logout tokens and deletion notices. `factory.SignInDirectlyAsync(TestAccounts.NewIdentity())` opens a session without the redirects; `factory.SignInNewLearnerAsync()`, `CreateDeckAsync()`, `AddCardAsync()`, `PublishAsync()` and `factory.Today()` (`TestDecks`) set up a learner and their decks.
- Tests check the behaviour around the result too: what is sent or stored, what must not be called, and the error cases.
- Do not edit generated output (`dist/`, `bin/`, `obj/`), dependency folders, or lockfiles unless the task requires it.
- Never commit secrets:
  - in development, use `dotnet user-secrets` for local backend settings; the only exception is the throwaway `erudi/erudi` login of the local compose database in `appsettings.Development.json`;
  - in production, use the VPS `.env` (environment variables of `compose.prod.yaml`).

## Commits

- Commit as soon as a task is finished and verified with lint, tests and build.
- Write commit titles as `Type: lowercase description`. Types include `Feat`, `Impr`, `Refa`, `Chore`, and `Bugfix`.
- When the title alone does not make the change self-explanatory, add a commit body after a blank line.
- Keep every commit body line at 72 characters or fewer.
