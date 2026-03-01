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
    *)
        echo "Usage: selfai [start|stop|status]"
        ;;
esac
