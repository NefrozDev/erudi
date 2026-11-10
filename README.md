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
npm run test:e2e   # accessibility in Chromium (once: npx --prefix frontend playwright install chromium)
```

## Deployment

Erudi runs on the VPS next to Plano and Mailcow, with its own database in Plano's
PostgreSQL. Learners sign in with their Synapse account: the identity service
(`synapse-auth`, at auth.synapseengineering.dev) must be deployed first, with
Erudi's client in its clients file. AGENTS.md explains the setup; nothing below touches Plano's database or
Mailcow's ports.

### First deployment

1. **GitHub**: create the `nefrozdev/erudi` repository and push `main`. Once every
   check passes, CI publishes `ghcr.io/nefrozdev/erudi-api` and `erudi-web`. The
   packages of a private repository are private: make them public in their GitHub
   settings, or run `docker login ghcr.io` on the VPS with a token limited to
   `read:packages`.
2. **DNS** (Cloudflare): an `A` record `erudi` to the VPS address, DNS only (grey
   cloud), like `plano`.
3. **VPS**, as root:

   ```sh
   git clone <repository URL> /home/ubuntu/erudi && cd /home/ubuntu/erudi
   cp .env.production.example .env && chmod 600 .env
   # Fill in .env: ERUDI_DB_PASSWORD from `openssl rand -hex 32`, and
   # IDENTITY_CLIENT_SECRET, the ERUDI_CLIENT_SECRET of synapse-auth's .env.
   docker network ls && docker ps   # check PLANO_NETWORK, MAILCOW_NETWORK, plano-prod-db-1
   sh deploy/create-database.sh     # once: Erudi's role and database
   docker compose -f compose.prod.yaml pull
   docker compose -f compose.prod.yaml up -d --wait
   ```

4. **Mailcow**, as for Plano: add `erudi.synapseengineering.dev` to `ADDITIONAL_SAN`
   in `mailcow.conf`, apply it as Mailcow documents (`docker compose up -d` in its
   folder) and wait for the certificate (`docker compose logs acme-mailcow`). Then
   copy `deploy/mailcow-erudi.conf` to `data/conf/nginx/erudi.conf`, run
   `docker compose exec nginx-mailcow nginx -t` and, if it passes,
   `docker compose exec nginx-mailcow nginx -s reload`.
5. **Backups**: add the cron line given at the top of `deploy/backup.sh`.
6. **Check**: open https://erudi.synapseengineering.dev, sign in with a Synapse
   account, accept the terms, then sign out from Settings: the identity service
   should end the session of every app.

### Updates

Once CI is green on `main`:

```sh
cd /home/ubuntu/erudi && git pull
docker compose -f compose.prod.yaml pull && docker compose -f compose.prod.yaml up -d --wait
```

Migrations run when the API starts. If `erudi-api` stays unhealthy,
`docker compose -f compose.prod.yaml logs erudi-api` says why, and
`docker inspect erudi-prod-erudi-api-1` should list both its networks.
