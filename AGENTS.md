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
- API calls use relative `/api/...` URLs. In development, `proxy.conf.json` forwards them to the backend on `http://localhost:5080`.

### Backend

- `Program.cs` configures the pipeline: problem details for errors, health checks on `/api/health`, and OpenAPI at `/openapi/v1.json` in Development only.
- Expose every endpoint under `/api/*`. Controllers go in `src/Erudi.Api/Controllers/`.
- Keep controllers thin and move business logic into injectable services.
- `Directory.Build.props` enables nullable reference types and treats warnings as errors for every project.

## Common Commands

Run these from the repository root.

| Task | Command |
| --- | --- |
| Frontend dev server (port 4200) | `npm run start:front` |
| Backend dev server with hot reload (port 5080) | `npm run start:back` |
| Lint (ESLint + `dotnet format`) | `npm run lint` |
| Tests (Vitest + xUnit) | `npm test` |
| Builds | `npm run build` |

## Coding Guidelines

- Keep changes scoped to the requested area and avoid unrelated refactors.
- When building or changing code, add or update the matching tests in the same change:
  - frontend specs go next to the code as `*.spec.ts`;
  - backend tests go in `backend/tests/`.
- Do not edit generated output (`dist/`, `bin/`, `obj/`), dependency folders, or lockfiles unless the task requires it.
- Never commit secrets:
  - in development, use `dotnet user-secrets` for local backend settings;
  - in production, use environment variables.

## Commits

- Commit as soon as a task is finished and verified with lint, tests and build.
- Write commit titles as `Type: lowercase description`. Types include `Feat`, `Impr`, `Refa`, `Chore`, and `Bugfix`.
- When the title alone does not make the change self-explanatory, add a commit body after a blank line.
- Keep every commit body line at 72 characters or fewer.
