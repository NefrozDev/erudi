# AGENTS.md

Instructions for AI coding agents working in this repository.

## Repository Layout

- `frontend/` is the Angular 22 application (standalone, zoneless, SCSS, Vitest, angular-eslint).
- `backend/` is the ASP.NET Core 10 Web API solution (`Erudi.slnx`).
  - `backend/src/Erudi.Api/` hosts the API.
  - `backend/tests/Erudi.Api.Tests/` holds the xUnit v3 tests, run through Microsoft.Testing.Platform.
- The root `package.json` provides convenience scripts for both sides.

## Architecture

### Frontend

- `src/app/app.ts` is the shell; routes live in `src/app/app.routes.ts` and every page is lazy-loaded with `loadComponent`.
- Feature-based layout:
  - `src/app/core/` holds app-wide singletons such as API clients, interceptors and guards.
  - `src/app/features/<feature>/` holds one folder per business feature.
  - `src/app/shared/` holds reusable UI components, pipes and directives.
- Components use `ChangeDetectionStrategy.OnPush`, signals, `inject()` and the built-in control flow.
- Pages load data with `rxResource` over the API services in `core/` (stable in Angular 22). `value()` throws while a resource is in error, so templates check `hasValue()` first; a 404 shows a "not found" `.state-card`, any other error an `.alert--retry` with a retry button.
- API calls use relative `/api/...` URLs. In development, `proxy.conf.json` forwards them to the backend on `http://localhost:5080`.
- The design follows the mockup (`Maquette-Boite-de-Leitner.pdf`, screen numbers in component docs). Colors, radii and the Outfit font are CSS variables in `src/styles.scss`, with shared `.page`, `.button`, `.field` and `.card` classes; components use the variables, never raw hex values. Plic, the mascot, is `app-plic` with a `mood` (`happy`, `surprised`, `proud`, `sleepy`); it is decorative, so the screen text must say what it means.
- Shared UI: `app-box-meter` (the five box bars), `app-delete-confirmation` (asks before deleting), and the global `.state-card` and `.alert--retry` classes.
- Texts go through Transloco. `src/i18n/fr.json` is the only language for now and loads as a hashed lazy chunk before the first screen. Templates use the `transloco` pipe; validation messages are translation keys. Every TestBed gets the French texts through `src/test-providers.ts` (`providersFile`), so specs assert French strings.
- Counted texts have `.one` and `.other` forms, picked with `countKey()` (`shared/i18n`); French uses the singular for 0 and 1.
- Auth: the session is an HttpOnly cookie the code never sees. `AuthStore` (`core/auth`) holds the user; `provideAppInitializer` restores it before the first route, so `signedInGuard`/`signedOutGuard` read it synchronously. `sessionExpiryInterceptor` signs out locally on any 401 outside `/api/auth/`.
- Forms use signal forms (`@angular/forms/signals`, stable in Angular 22) with `[formRoot]` and `[formField]`. Show field errors through `visibleError()` (only once touched) and set `aria-invalid`/`aria-describedby`. Server errors about a field are returned from the submission action; errors about the whole form go in a separate `formError` signal, because a root submission error would block re-sending the same values.
- An `<input type="email">` already strips surrounding spaces; do not trim again.
- Signed-in screens sit under one `signedInGuard` route: the tabs are children of `TabShell` (bottom bar), while decks (`decks/...`) and study sessions (`study/quiz`, `study/practice`) are full-screen. Routes give a translation key as `title`.
- Route params, query params (`?deckId=`) and route data (`mode`) reach components as inputs (`withComponentInputBinding()`); specs that render routes must enable it too. Ids from the address bar are encoded before going into an API URL.
- `timeZoneInterceptor` sends the device's IANA time zone in `X-Time-Zone` with every `/api/` call.

### Backend

- `Program.cs` configures the pipeline: problem details for errors, health checks on `/api/health`, and OpenAPI at `/openapi/v1.json` in Development only.
- Expose every endpoint under `/api/*`. Controllers go in `src/Erudi.Api/Controllers/`.
- Keep controllers thin and move business logic into injectable services.
- `Directory.Build.props` enables nullable reference types and treats warnings as errors for every project.
- Data: PostgreSQL 18 through EF Core (Npgsql) with snake_case names (`EFCore.NamingConventions`). Migrations live in `src/Erudi.Api/Data/Migrations/` and run at startup. Add one with `dotnet ef migrations add <Name> --project src/Erudi.Api --output-dir Data/Migrations` from `backend/` (`dotnet-ef` is a local tool: `dotnet tool restore` once). Read services from configuration lazily (inside the factory), so test hosts can override them.
- In production Erudi has its own database and role inside Plano's Postgres container, with the same account model as Plano (`users`, `sessions`, `password_resets`) but separate accounts. Never touch Plano's database.
- Auth: an opaque 32-byte token in the `erudi_session` cookie (HttpOnly, SameSite=Lax, path `/api`, Secure outside Development), stored only as its SHA-256. `SessionAuthenticationHandler` turns it into `HttpContext.User`, so endpoints only need `[Authorize]` and `User.GetUserId()`. Passwords use ASP.NET Core Identity's `PasswordHasher`; unknown e-mails are verified against a dummy hash so timing reveals nothing.
- `AllowedOriginMiddleware` refuses state-changing requests whose Origin or Referer is not `Frontend:Url` (CSRF). Running the Angular app on another port or domain means setting `Frontend__Url`.
- `[EnableRateLimiting(AuthSetup.RateLimitPolicy)]` limits auth endpoints per client IP (`Auth:RateLimitPerMinute`). The IP comes from `X-Forwarded-For` of private-network proxies only (`SecuritySetup`).
- Password recovery always answers 204. The link puts a single-use, 30-minute token in the URL fragment; using it ends every session. E-mails go through `IMailQueue` (a background channel drained by `MailDispatcher`, sent with MailKit) so requests never wait on SMTP. Without `Smtp:Host`, Development logs the reset link instead.
- Use `TimeProvider` for the current time, never `DateTime.UtcNow`, so tests can move the clock.
- Decks and cards (`Decks/`) belong to one user: every query filters on the owner, and someone else's deck or card answers 404, never 403. `DeckRules` holds the lengths and the anti-abuse limits (200 decks, 2000 cards per deck).
- Leitner (`Study/`): `LeitnerSchedule` holds the five boxes and their intervals (1, 2, 4, 7, 14 days). Due dates are `DateOnly` days of the learner; get "today" from `StudyCalendar`, which reads `X-Time-Zone` and falls back to Europe/Brussels. A quiz answer moves the card with a conditional update (only if it is still where it was read), so it never moves twice; `card_reviews` logs each answer and keeps it when the card is deleted. Practice writes nothing.
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

## Coding Guidelines

- Keep changes scoped to the requested area and avoid unrelated refactors.
- When building or changing code, add or update the matching tests in the same change:
  - frontend specs go next to the code as `*.spec.ts`;
  - backend tests go in `backend/tests/`. They need Docker running: Testcontainers starts one PostgreSQL 18 container per run, and `ErudiApiFactory` gives each test class its own database, a `FakeTimeProvider` clock and a `RecordingMailQueue`. `factory.SignInNewLearnerAsync()`, `CreateDeckAsync()`, `AddCardAsync()` and `factory.Today()` (`TestDecks`) set up a learner.
- Tests check the behaviour around the result too: what is sent or stored, what must not be called, and the error cases.
- Do not edit generated output (`dist/`, `bin/`, `obj/`), dependency folders, or lockfiles unless the task requires it.
- Never commit secrets:
  - in development, use `dotnet user-secrets` for local backend settings; the only exception is the throwaway `erudi/erudi` login of the local compose database in `appsettings.Development.json`;
  - in production, use environment variables.

## Commits

- Commit as soon as a task is finished and verified with lint, tests and build.
- Write commit titles as `Type: lowercase description`. Types include `Feat`, `Impr`, `Refa`, `Chore`, and `Bugfix`.
- When the title alone does not make the change self-explanatory, add a commit body after a blank line.
- Keep every commit body line at 72 characters or fewer.
