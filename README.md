# Erudi

Angular 22 frontend and ASP.NET Core 10 API.

## Prerequisites

- Node.js `^22.22.3 || ^24.15.0 || >=26`
- .NET SDK 10.0.403 or a later 10.0 feature band (pinned in `backend/global.json`)

## Getting started

```sh
npm --prefix frontend install
npm run start:back    # http://localhost:5080
npm run start:front   # http://localhost:4200, proxies /api to the backend
```

## Checks

```sh
npm run lint
npm test
npm run build
```
