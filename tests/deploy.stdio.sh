#!/bin/sh
set -eu

# Reproduce hosted microVM stdio owned by root but inherited by non-root nginx.
# Reopening /dev/stdout or /dev/stderr fails even though writing the inherited
# descriptor works. nginx -t opens the configured logs, catching that regression.
docker run --rm --network none --user 0 --entrypoint sh "${1:-compare-images:production}" -c '
  touch /tmp/root-owned-stdio
  chmod 600 /tmp/root-owned-stdio
  if ! su -s /bin/sh nginx -c "/docker-entrypoint.sh nginx -e stderr -t" >/tmp/root-owned-stdio 2>&1; then
    cat /tmp/root-owned-stdio
    exit 1
  fi
  echo "PASS: non-root nginx config with inherited root-owned stdio"
'
