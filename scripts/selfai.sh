#!/usr/bin/env bash
set -euo pipefail

SELFAI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELFAI_PORT=8420
PIDFILE="$HOME/.selfai/selfai.pid"

case "${1:-start}" in
    start)
        if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            echo "Self.ai is already running (PID: $(cat "$PIDFILE"))"
            echo "  http://localhost:$SELFAI_PORT"
            exit 0
        fi

        cd "$SELFAI_DIR/backend"
        source .venv/bin/activate
        uvicorn app.main:app --host 127.0.0.1 --port "$SELFAI_PORT" &
        PID=$!
        echo "$PID" > "$PIDFILE"

        sleep 2
        python -c "import webbrowser; webbrowser.open('http://localhost:$SELFAI_PORT')"

        echo "Self.ai running at http://localhost:$SELFAI_PORT (PID: $PID)"
        echo "Press Ctrl+C to stop"

        trap 'kill $PID 2>/dev/null; rm -f "$PIDFILE"; echo "Self.ai stopped"' INT TERM
        wait $PID
        rm -f "$PIDFILE"
        ;;
    stop)
        if [ -f "$PIDFILE" ]; then
            PID="$(cat "$PIDFILE")"
            if kill -0 "$PID" 2>/dev/null; then
                kill "$PID"
                rm -f "$PIDFILE"
                echo "Self.ai stopped (PID: $PID)"
            else
                rm -f "$PIDFILE"
                echo "Self.ai is not running (stale PID file removed)"
            fi
        else
            pkill -f "uvicorn app.main:app.*$SELFAI_PORT" 2>/dev/null && echo "Self.ai stopped" || echo "Self.ai is not running"
        fi
        ;;
    status)
        if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            echo "Self.ai is running (PID: $(cat "$PIDFILE"))"
            echo "  http://localhost:$SELFAI_PORT"
        else
            echo "Self.ai is not running"
        fi
        ;;
    update)
        WAS_RUNNING=false
        if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
            WAS_RUNNING=true
            echo "Stopping Self.ai before update..."
            kill "$(cat "$PIDFILE")"
            rm -f "$PIDFILE"
        fi

        cd "$SELFAI_DIR"

        echo "Pulling latest changes..."
        git pull --ff-only || { echo "Error: git pull failed. You may have local changes — commit or stash them first."; exit 1; }

        echo "Updating backend dependencies..."
        cd "$SELFAI_DIR/backend"
        source .venv/bin/activate
        pip install -q -r requirements.txt

        if [ -f "$SELFAI_DIR/frontend/package.json" ]; then
            echo "Updating frontend..."
            cd "$SELFAI_DIR/frontend"
            npm install --silent
            npm run build
        fi

        echo "Update complete."

        if [ "$WAS_RUNNING" = true ]; then
            echo "Restarting Self.ai..."
            exec "$0" start
        fi
        ;;
    *)
        echo "Usage: selfai [start|stop|status|update]"
        ;;
esac
