#!/usr/bin/env bash
#
# Pick free ports for a throwaway local Supabase.
#
#   pick_db_ports <preferred-base>
#
# Prints six numbers, space separated, in the order the config rewrite expects:
#
#   <db> <shadow> <api> <studio> <inbucket> <analytics>
#
# The Supabase CLI's defaults are 54322 (db), 54320 (shadow), 54321 (api),
# 54323 (studio), 54324 (inbucket) and 54327 (analytics). A local stack is
# moved onto another base so two throwaway databases can run side by side --
# and so that a stray stack somebody left running on the usual port cannot
# break the gate for everybody else.
#
# That is not hypothetical: a stack left on 56322 made scripts/db-tests.sh
# fail with an opaque "Starting database... Stopping containers..." while
# every check it actually ran was fine.
#
# Ports are probed with bash's /dev/tcp, which exists on macOS and on the
# Linux runners, so the check does not depend on lsof or nc being installed.

# The six ports the CLI binds, in the order the callers read them: db, shadow,
# api, studio, inbucket, analytics. The base is the db port.
_kfd_db_port_offsets=(0 -2 -1 1 2 5)

_kfd_port_is_free() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1 && return 1
  return 0
}

# Echo the six ports for the first free base, or fail.
pick_db_ports() {
  local preferred="${1:-56322}"
  local base
  for base in "$preferred" 57322 58322 59322 60322 61322 62322; do
    local free=1
    local offset port
    for offset in "${_kfd_db_port_offsets[@]}"; do
      port=$((base + offset))
      if ! _kfd_port_is_free "$port"; then
        free=0
        break
      fi
    done
    if [ "$free" = "1" ]; then
      local ports=()
      for offset in "${_kfd_db_port_offsets[@]}"; do
        ports+=("$((base + offset))")
      done
      echo "${ports[*]}"
      return 0
    fi
  done

  echo "Could not find six free ports for a throwaway database." >&2
  return 1
}
