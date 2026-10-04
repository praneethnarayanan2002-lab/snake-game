#!/usr/bin/env bash
# One-command local dev: Postgres → migrations → seed → API (:8000) + web (:5173).
#
#   ./dev.sh            start everything (seeds on first run)
#   ./dev.sh --reseed   wipe data and reseed before starting
#   ./dev.sh --no-docker  use an already-running Postgres (STUDYVAULT_DATABASE_URL)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
RESEED=0
USE_DOCKER=1
for arg in "$@"; do
  case "$arg" in
    --reseed) RESEED=1 ;;
    --no-docker) USE_DOCKER=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

say() { printf '\033[1;35m▸\033[0m %s\n' "$*"; }

# 1. Postgres
if [[ $USE_DOCKER == 1 ]] && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  say "Starting Postgres (docker compose)…"
  docker compose -f "$ROOT/docker-compose.yml" up -d --wait db
else
  say "Using existing Postgres at ${STUDYVAULT_DATABASE_URL:-postgresql+psycopg://studyvault:studyvault@localhost:5432/studyvault}"
fi

# 2. Backend deps, migrations, seed
cd "$BACKEND"
if [[ ! -d .venv ]]; then
  say "Creating Python virtualenv…"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
if [[ ! -f .venv/.deps-installed ]] || [[ requirements.txt -nt .venv/.deps-installed ]]; then
  say "Installing backend dependencies…"
  pip install -q -r requirements.txt
  touch .venv/.deps-installed
fi
say "Running migrations…"
alembic upgrade head
if [[ $RESEED == 1 ]]; then
  say "Reseeding…"
  python -m scripts.seed --reset
else
  python -m scripts.seed
fi

# 3. Frontend deps
cd "$FRONTEND"
if [[ ! -d node_modules ]]; then
  say "Installing frontend dependencies…"
  npm install --silent
fi

# 4. Run both; Ctrl-C stops both.
say "API → http://localhost:8000/docs   Web → http://localhost:5173"
cd "$BACKEND"
uvicorn app.main:app --reload --port 8000 &
API_PID=$!
cd "$FRONTEND"
npm run dev -- --strictPort &
WEB_PID=$!
trap 'kill $API_PID $WEB_PID 2>/dev/null; exit 0' INT TERM
wait -n $API_PID $WEB_PID
kill $API_PID $WEB_PID 2>/dev/null || true
