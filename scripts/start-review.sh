#!/usr/bin/env bash
# start-review.sh — bring up the SCORM Studio review app on http://localhost:3100
# if it is not already running. Invoked by a SessionStart hook so the reviewer is
# always available when Claude opens. Serves the course named in <studio>/.active-course.
# Idempotent: no-ops when port 3100 is already serving.
PORT=3100
STUDIO="/d/Claude/SCORM Studio"
NODE="$STUDIO/runtime/node/node.exe"
CWD="$STUDIO/app/review-app"
LOG="$STUDIO/logs/review-server.log"

# already listening? do nothing.
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  exec 3>&- 3<&- 2>/dev/null
  echo "review app already running on http://localhost:$PORT"
  exit 0
fi

[ -x "$NODE" ] || NODE="node"   # fall back to PATH node if the vendored runtime is missing
cd "$CWD" 2>/dev/null || { echo "review-app not found at $CWD"; exit 0; }
nohup "$NODE" node_modules/next/dist/bin/next dev -p "$PORT" > "$LOG" 2>&1 &
disown 2>/dev/null
echo "starting review app on http://localhost:$PORT (serving active course)"
exit 0
