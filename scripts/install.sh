#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SELFAI_PORT=8420
SELFAI_HOME="$HOME/.selfai"
SELFAI_BIN="$HOME/.local/bin"
REPO_URL="https://github.com/tanujdargan/self.ai.git"
VERBOSE=false
MIN_DISK_MB=5000

# PyTorch CUDA wheel URLs — single source of truth
# See https://pytorch.org/get-started/locally/ for current versions
TORCH_CU130="https://download.pytorch.org/whl/cu130"
TORCH_CU128="https://download.pytorch.org/whl/cu128"
TORCH_CU126="https://download.pytorch.org/whl/cu126"
TORCH_ROCM="https://download.pytorch.org/whl/rocm7.1"

# Max supported Python for PyTorch (#9 review)
MAX_PYTHON_MINOR=13

cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo -e "\n${RED}Installation failed (exit code: $exit_code)${NC}"
        echo -e "${YELLOW}Check the output above for details.${NC}"
    fi
}
trap cleanup EXIT

log()   { echo -e "${BLUE}[self.ai]${NC} $*"; }
ok()    { echo -e "${GREEN}  ✓${NC} $*"; }
warn()  { echo -e "${YELLOW}  ⚠${NC} $*"; }
fail()  { echo -e "${RED}  ✗ $*${NC}" >&2; exit 1; }
step()  { echo -e "\n${BOLD}${CYAN}→ $*${NC}"; }

# ---------------------------------------------------------------------------
# Helpers
# #1 fix: run pip in subshell to capture exit code cleanly (no pipefail toggle)
# #4 fix: --allow-fail is a proper first-arg flag (not env var)
# ---------------------------------------------------------------------------
run_pip() {
    local exit_code=0
    if [ "$VERBOSE" = true ]; then
        pip "$@" || exit_code=$?
    else
        # subshell captures pip's exit code without toggling pipefail
        exit_code=$(pip "$@" --quiet 2>/dev/null; echo $?)
    fi
    if [ "$exit_code" -ne 0 ]; then
        fail "pip $1 failed (exit code $exit_code). Re-run with --verbose for details."
    fi
}

run_npm() {
    local allow_fail=false
    if [ "${1:-}" = "--allow-fail" ]; then
        allow_fail=true
        shift
    fi
    local exit_code=0
    if [ "$VERBOSE" = true ]; then
        npm "$@" || exit_code=$?
    else
        exit_code=$(npm "$@" --silent 2>/dev/null; echo $?)
    fi
    if [ "$exit_code" -ne 0 ]; then
        if [ "$allow_fail" = true ]; then
            return 1
        fi
        fail "npm $1 failed (exit code $exit_code). Re-run with --verbose for details."
    fi
}

# ---------------------------------------------------------------------------
# #2 fix: check multiple hosts + detect captive portals
# ---------------------------------------------------------------------------
check_network() {
    step "Checking network connectivity"

    local check_url response
    local reachable=0
    for check_url in "https://pypi.org/simple/" "https://github.com" "https://download.pytorch.org"; do
        if command -v curl &>/dev/null; then
            response="$(curl -sf --max-time 10 "$check_url" 2>/dev/null | head -c 200)" || { warn "Cannot reach $check_url"; continue; }
            # captive portal detection
            if echo "$response" | grep -qi '<html' 2>/dev/null; then
                warn "$check_url returned HTML — possible captive portal"
                continue
            fi
            reachable=$((reachable + 1))
        elif command -v wget &>/dev/null; then
            wget -q --timeout=10 --spider "$check_url" 2>/dev/null && reachable=$((reachable + 1)) || warn "Cannot reach $check_url"
        fi
    done

    if [ "$reachable" -eq 0 ]; then
        fail "No network connectivity. Check your internet connection and try again."
    elif [ "$reachable" -lt 3 ]; then
        warn "Some hosts unreachable — installation may fail at certain steps"
    else
        ok "Network reachable"
    fi
}

# ---------------------------------------------------------------------------
# #3 fix: use df -Pk for portable single-line output
# ---------------------------------------------------------------------------
check_disk_space() {
    step "Checking disk space"

    local avail_kb
    avail_kb="$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')" || true

    if [ -n "$avail_kb" ]; then
        local avail_mb=$((avail_kb / 1024))
        if [ "$avail_mb" -lt "$MIN_DISK_MB" ]; then
            fail "Insufficient disk space: ${avail_mb}MB available, ${MIN_DISK_MB}MB required (PyTorch alone is ~2GB)"
        fi
        ok "${avail_mb}MB available"
    else
        warn "Could not determine available disk space, continuing anyway"
    fi
}

# ---------------------------------------------------------------------------
detect_platform() {
    step "Detecting platform"

    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux*)  OS="linux" ;;
        Darwin*) OS="macos" ;;
        *)       fail "Unsupported OS: $OS" ;;
    esac

    case "$ARCH" in
        x86_64|amd64)  ARCH="x86_64" ;;
        arm64|aarch64) ARCH="arm64" ;;
        *)             fail "Unsupported architecture: $ARCH" ;;
    esac

    ok "OS: $OS | Arch: $ARCH"
}

# ---------------------------------------------------------------------------
# GPU detection — portable sed (no grep -P), correct version comparison
# ---------------------------------------------------------------------------
detect_gpu() {
    step "Detecting GPU"

    GPU="cpu"
    TORCH_INDEX=""

    if [ "$OS" = "macos" ] && [ "$ARCH" = "arm64" ]; then
        GPU="mps"
        TORCH_INDEX=""
        ok "Apple Silicon detected (MPS)"
        return
    fi

    if command -v nvidia-smi &>/dev/null; then
        local smi_output
        if smi_output="$(nvidia-smi 2>&1)"; then
            GPU="cuda"
            local cuda_ver
            cuda_ver="$(echo "$smi_output" | sed -n 's/.*CUDA Version:[[:space:]]*\([0-9]*\.[0-9]*\).*/\1/p' | head -1)"

            if [ -n "$cuda_ver" ]; then
                local cuda_major cuda_minor
                cuda_major="${cuda_ver%%.*}"
                cuda_minor="${cuda_ver#*.}"
                cuda_minor="${cuda_minor%%.*}"
                ok "NVIDIA GPU detected (CUDA $cuda_ver)"

                # match to nearest supported PyTorch CUDA wheel
                if [ "$cuda_major" -ge 13 ]; then
                    TORCH_INDEX="$TORCH_CU130"
                elif [ "$cuda_major" -eq 12 ] && [ "$cuda_minor" -ge 8 ]; then
                    TORCH_INDEX="$TORCH_CU128"
                elif [ "$cuda_major" -eq 12 ]; then
                    TORCH_INDEX="$TORCH_CU126"
                else
                    warn "CUDA $cuda_ver is too old for current PyTorch, trying cu126"
                    TORCH_INDEX="$TORCH_CU126"
                fi
            else
                warn "nvidia-smi found but could not parse CUDA version, defaulting to cu126"
                TORCH_INDEX="$TORCH_CU126"
                ok "NVIDIA GPU detected"
            fi
            return
        else
            warn "nvidia-smi found but failed: $smi_output"
            warn "Falling back to CPU (check your NVIDIA drivers)"
        fi
    fi

    if command -v rocm-smi &>/dev/null; then
        if rocm-smi &>/dev/null; then
            GPU="rocm"
            TORCH_INDEX="$TORCH_ROCM"
            ok "AMD GPU detected (ROCm 6.0)"
            return
        else
            warn "rocm-smi found but failed. Falling back to CPU."
        fi
    fi

    TORCH_INDEX=""
    warn "No GPU detected, installing CPU-only PyTorch"
}

# ---------------------------------------------------------------------------
# #9 fix: warn on Python > MAX_PYTHON_MINOR (PyTorch compatibility)
# ---------------------------------------------------------------------------
check_python() {
    step "Checking Python"

    local py=""
    for candidate in python3 python; do
        if command -v "$candidate" &>/dev/null; then
            py="$candidate"
            break
        fi
    done

    if [ -z "$py" ]; then
        fail "Python not found. Install Python 3.10+ or use pyenv:\n  curl https://pyenv.run | bash\n  pyenv install 3.12 && pyenv global 3.12"
    fi

    PYTHON="$py"
    local ver
    ver="$($PYTHON -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    local major minor
    major="${ver%%.*}"
    minor="${ver##*.}"

    if [ "$major" -lt 3 ] || { [ "$major" -eq 3 ] && [ "$minor" -lt 10 ]; }; then
        fail "Python $ver found, but 3.10+ is required.\nInstall with pyenv:\n  curl https://pyenv.run | bash\n  pyenv install 3.12 && pyenv global 3.12"
    fi

    if [ "$major" -eq 3 ] && [ "$minor" -gt "$MAX_PYTHON_MINOR" ]; then
        warn "Python $ver detected — PyTorch may not support versions above 3.$MAX_PYTHON_MINOR yet"
    fi

    ok "Python $ver ($($PYTHON --version 2>&1))"
}

# ---------------------------------------------------------------------------
check_node() {
    step "Checking Node.js"

    if ! command -v node &>/dev/null; then
        fail "Node.js not found. Install Node 18+ or use nvm:\n  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash\n  nvm install 20"
    fi

    local ver
    ver="$(node -v | sed 's/^v//')"
    local major="${ver%%.*}"

    if [ "$major" -lt 18 ]; then
        fail "Node $ver found, but 18+ is required.\nUpdate with nvm:\n  nvm install 20 && nvm use 20"
    fi

    ok "Node.js v$ver"

    if ! command -v npm &>/dev/null; then
        fail "npm not found (should be bundled with Node.js)"
    fi
    ok "npm $(npm -v)"
}

# ---------------------------------------------------------------------------
ensure_repo() {
    step "Locating Self.ai repository"

    if [ -f "pyproject.toml" ] && grep -q 'name = "selfai"' pyproject.toml 2>/dev/null; then
        SELFAI_DIR="$(pwd)"
        ok "Already in Self.ai repo: $SELFAI_DIR"
        return
    fi

    if [ -f "../pyproject.toml" ] && grep -q 'name = "selfai"' ../pyproject.toml 2>/dev/null; then
        SELFAI_DIR="$(cd .. && pwd)"
        ok "Found Self.ai repo: $SELFAI_DIR"
        return
    fi

    log "Cloning repository..."
    local target="$HOME/self.ai"
    if [ -d "$target" ]; then
        fail "$target already exists. cd into it and re-run, or remove it first."
    fi

    git clone "$REPO_URL" "$target"
    SELFAI_DIR="$target"
    ok "Cloned to $SELFAI_DIR"
}

# ---------------------------------------------------------------------------
setup_backend() {
    step "Setting up backend"

    cd "$SELFAI_DIR/backend"

    # wipe broken venv on retry
    if [ -d ".venv" ] && [ ! -f ".venv/bin/python" ]; then
        warn "Removing broken virtual environment..."
        rm -rf .venv
    fi

    if [ ! -d ".venv" ]; then
        log "Creating virtual environment..."
        $PYTHON -m venv .venv
    fi
    ok "Virtual environment ready"

    source .venv/bin/activate

    if [ -n "$TORCH_INDEX" ]; then
        log "Installing PyTorch ($GPU)..."
        run_pip install torch --index-url "$TORCH_INDEX"
    else
        log "Installing PyTorch ($GPU)..."
        run_pip install torch
    fi
    ok "PyTorch installed"

    if [ -f "requirements.txt" ]; then
        log "Installing backend dependencies..."
        run_pip install -r requirements.txt
        ok "Backend dependencies installed"
    else
        warn "No requirements.txt found, skipping"
    fi

    deactivate
    cd "$SELFAI_DIR"
}

# ---------------------------------------------------------------------------
setup_frontend() {
    step "Setting up frontend"

    cd "$SELFAI_DIR/frontend"

    if [ ! -f "package.json" ]; then
        warn "No package.json found in frontend/, skipping"
        cd "$SELFAI_DIR"
        return
    fi

    log "Installing frontend dependencies..."
    run_npm install
    ok "npm packages installed"

    log "Building frontend..."
    npm run build || fail "Frontend build failed. Check the output above."
    ok "Frontend built"

    cd "$SELFAI_DIR"
}

# ---------------------------------------------------------------------------
create_directories() {
    step "Creating Self.ai directories"

    mkdir -p "$SELFAI_HOME"/{models,datasets,runs,config}
    ok "$SELFAI_HOME/ created"

    mkdir -p "$SELFAI_BIN"
    ok "$SELFAI_BIN/ ready"
}

# ---------------------------------------------------------------------------
install_launcher() {
    step "Installing launcher"

    local launcher="$SELFAI_DIR/scripts/selfai.sh"

    if [ ! -f "$launcher" ]; then
        fail "Launcher script not found at $launcher"
    fi

    chmod +x "$launcher"

    ln -sf "$launcher" "$SELFAI_BIN/selfai"
    ok "Linked selfai → $launcher"

    if ! echo "$PATH" | tr ':' '\n' | grep -qx "$SELFAI_BIN"; then
        warn "$SELFAI_BIN is not in your PATH. Add it:"
        echo -e "    ${CYAN}export PATH=\"$SELFAI_BIN:\$PATH\"${NC}"
    fi
}

# ---------------------------------------------------------------------------
print_success() {
    echo ""
    echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}${BOLD}  Self.ai installed successfully!${NC}"
    echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  GPU:       ${BOLD}$GPU${NC}"
    echo -e "  Directory: ${BOLD}$SELFAI_DIR${NC}"
    echo -e "  Data:      ${BOLD}$SELFAI_HOME${NC}"
    echo -e "  Port:      ${BOLD}$SELFAI_PORT${NC}"
    echo ""
    echo -e "  ${CYAN}Next steps:${NC}"
    echo -e "    ${BOLD}selfai start${NC}    Launch Self.ai"
    echo -e "    ${BOLD}selfai stop${NC}     Stop the server"
    echo ""
}

# ===========================================================================
# #5/#8 fix: parse flags first, only prompt on real interactive TTY
# ===========================================================================
main() {
    for arg in "$@"; do
        case "$arg" in
            -v|--verbose) VERBOSE=true ;;
        esac
    done

    echo -e "${BOLD}${CYAN}"
    echo "  ____       _  __           _ "
    echo " / ___|  ___| |/ _|   __ _ (_)"
    echo " \\___ \\ / _ \\ | |_   / _\` || |"
    echo "  ___) |  __/ |  _| | (_| || |"
    echo " |____/ \\___|_|_|    \\__,_|/ |"
    echo "                         |__/ "
    echo -e "${NC}"
    echo -e "${BOLD}  Local LLM Finetuning Platform${NC}"
    echo ""

    # only prompt if both stdin AND stdout are a real terminal
    if [ "$VERBOSE" = false ] && [ -t 0 ] && [ -t 1 ]; then
        read -rp "  Enable verbose output? (y/N) " choice
        if [[ "$choice" =~ ^[yY] ]]; then
            VERBOSE=true
        fi
    fi

    if [ "$VERBOSE" = true ]; then
        ok "Verbose mode enabled"
    fi
    echo ""

    check_network
    check_disk_space
    detect_platform
    detect_gpu
    check_python
    check_node
    ensure_repo
    setup_backend
    setup_frontend
    create_directories
    install_launcher
    print_success
}

main "$@"
