#!/bin/sh
# Nightly dump of Erudi's database (inside Plano's PostgreSQL). Run as root
# (Docker access). Cron:
#   45 3 * * * sh /home/ubuntu/erudi/deploy/backup.sh >> /root/erudi-backups/backup.log 2>&1
# Restore, with the API stopped (docker compose -f compose.prod.yaml stop erudi-api):
#   gunzip -c <dump> | docker exec -i plano-prod-db-1 psql -U erudi -d erudi -v ON_ERROR_STOP=1
set -eu

container="${PLANO_DB_CONTAINER:-plano-prod-db-1}"
# Dumps contain e-mails and password hashes: owner-only access.
umask 077
backup_dir="${BACKUP_DIR:-$HOME/erudi-backups}"
mkdir -p "$backup_dir"

file="$backup_dir/erudi-$(date +%Y%m%d-%H%M%S).sql.gz"
partial="$file.partial"
trap 'rm -f "$partial"' EXIT

# Dump to a plain file first: in `pg_dump | gzip`, a failing pg_dump would
# still produce a valid-looking archive and the script would report success.
docker exec "$container" pg_dump --clean --if-exists -U erudi -d erudi > "$partial"
gzip -c "$partial" > "$file"

# The terms promise a deleted account leaves the backups within 14 days: a dump
# goes on the first nightly run once it is 13 full days old (-mtime +12).
find "$backup_dir" -name 'erudi-*.sql.gz' -mtime +12 -delete
echo "$(date '+%F %T') Backup written to $file ($(du -h "$file" | cut -f1))"
