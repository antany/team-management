#!/usr/bin/env bash
# Dump the team database from the running pod to a folder on the host, keeping the newest N days.
#   BACKUP_DIR   target folder (default ~/backups/team); point it at a share/mount if you like
#   KEEP_DAYS    delete dumps older than this (default 14)
#   CONTAINER    postgres container name (default team-postgres)
# Restore: gunzip -c team_<stamp>.sql.gz | podman exec -i team-postgres psql -U team team
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/team}"
KEEP_DAYS="${KEEP_DAYS:-14}"
CONTAINER="${CONTAINER:-team-postgres}"

# cron has no login session; rootless podman needs this to find its runtime dir.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y-%m-%d_%H%M%S)"
tmp="$BACKUP_DIR/.team_$stamp.sql.gz.part"
out="$BACKUP_DIR/team_$stamp.sql.gz"

# Write to a .part file first so a failed dump never leaves a truncated backup behind.
trap 'rm -f "$tmp"' EXIT
podman exec "$CONTAINER" pg_dump -U team --no-owner team | gzip > "$tmp"

# gzip of an empty dump is ~20 bytes; anything real is larger. Also confirm the archive is intact.
[ "$(stat -c %s "$tmp")" -gt 200 ] || { echo "backup is suspiciously small, keeping nothing" >&2; exit 1; }
gzip -t "$tmp"
mv "$tmp" "$out"
trap - EXIT

find "$BACKUP_DIR" -maxdepth 1 -name 'team_*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "backup written: $out"
