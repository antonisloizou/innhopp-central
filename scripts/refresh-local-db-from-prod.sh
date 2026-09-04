#!/usr/bin/env bash
# Refresh the local PostgreSQL database from the production backend's DATABASE_URL.
#
# Usage:
#   ./scripts/refresh-local-db-from-prod.sh
#
# Optional overrides:
#   PROD_SSH_HOST=innhopp LOCAL_DB_CONTAINER=innhopp-postgres LOCAL_DB_NAME=innhopp \
#     ./scripts/refresh-local-db-from-prod.sh
#
# Set KEEP_DUMP=1 to retain the validated dump in /private/tmp after the restore.

set -euo pipefail

prod_ssh_host="${PROD_SSH_HOST:-innhopp}"
prod_backend_container="${PROD_BACKEND_CONTAINER:-ec2-user-backend-1}"
local_db_container="${LOCAL_DB_CONTAINER:-innhopp-postgres}"
local_db_name="${LOCAL_DB_NAME:-innhopp}"
dump_file="$(mktemp /private/tmp/innhopp-prod.XXXXXX.dump)"

cleanup() {
  if [[ "${KEEP_DUMP:-0}" != "1" ]]; then
    rm -f "$dump_file"
  else
    printf 'Kept production dump: %s\n' "$dump_file"
  fi
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null || {
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  }
}

require_command docker
require_command ssh

if ! docker container inspect "$local_db_container" >/dev/null 2>&1; then
  printf 'Local database container not found: %s\n' "$local_db_container" >&2
  exit 1
fi

if [[ "$(docker inspect --format '{{.State.Running}}' "$local_db_container")" != "true" ]]; then
  printf 'Local database container is not running: %s\n' "$local_db_container" >&2
  exit 1
fi

# Keep the production URL in process memory only: do not echo or log it.
prod_database_url="$(ssh "$prod_ssh_host" \
  "docker inspect '$prod_backend_container' --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^DATABASE_URL=//p' | head -n 1")"

if [[ -z "$prod_database_url" ]]; then
  printf 'DATABASE_URL was not found in production container %s.\n' "$prod_backend_container" >&2
  exit 1
fi

printf 'Creating production dump...\n'
# The RDS instance is private to production, so pg_dump must run from the
# production host. The URL is sent over SSH stdin and is never included in a
# command line or output.
ssh "$prod_ssh_host" \
  'IFS= read -r database_url
   exec docker run --rm -e DATABASE_URL="$database_url" postgres:18 \
     sh -c '\''exec pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL"'\''' \
  <<< "$prod_database_url" > "$dump_file"

if [[ ! -s "$dump_file" ]]; then
  printf 'Production dump is empty; local database was not changed.\n' >&2
  exit 1
fi

printf 'Validating dump...\n'
docker exec -i "$local_db_container" pg_restore --list < "$dump_file" >/dev/null

printf 'Restoring into %s/%s...\n' "$local_db_container" "$local_db_name"
docker exec -i "$local_db_container" pg_restore \
  --clean --if-exists --exit-on-error --no-owner --no-privileges \
  --username=postgres --dbname="$local_db_name" < "$dump_file"

printf 'Local database refresh complete.\n'
