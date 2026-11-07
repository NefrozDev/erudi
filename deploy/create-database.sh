#!/bin/sh
# Creates Erudi's role and database inside Plano's PostgreSQL container, once.
# Run as root (Docker access) from Erudi's folder on the VPS, after filling .env:
#   sh deploy/create-database.sh
# The role is not a superuser and owns only its database: it cannot read Plano's
# tables. Plano's database itself is left untouched.
set -eu

cd "$(dirname "$0")/.."
container="${PLANO_DB_CONTAINER:-plano-prod-db-1}"
password=$(sed -n 's/^ERUDI_DB_PASSWORD=//p' .env)

# Hex only: it goes into the connection string, and into the SQL below.
case "$password" in
  '' | *[!0-9a-f]*)
    echo "ERUDI_DB_PASSWORD in .env must be hex (openssl rand -hex 32)." >&2
    exit 1
    ;;
esac

# Sent through stdin, so the password never shows in the process list.
docker exec -i "$container" psql -U plano -d postgres -v ON_ERROR_STOP=1 --quiet <<SQL
CREATE ROLE erudi LOGIN PASSWORD '$password';
CREATE DATABASE erudi OWNER erudi;
-- Any role may connect to a new database by default: keep it to erudi.
REVOKE CONNECT, TEMPORARY ON DATABASE erudi FROM PUBLIC;
SQL

echo "Role and database erudi created in $container."
