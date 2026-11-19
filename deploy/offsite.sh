#!/bin/sh
set -eu
: "${RESTIC_REPOSITORY:?Configura RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD:?Configura RESTIC_PASSWORD}"
# Initialize the repository explicitly once using `restic init` before this service.
while true; do
  if restic backup /source --exclude '*.partial' --tag atencion; then
    restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
    restic check
    mkdir -p /status
    date +%s > /status/offsite-success
  else
    echo 'ERROR: falló la copia externa de Atencion' >&2
    exit 1
  fi
  sleep 21600
done
