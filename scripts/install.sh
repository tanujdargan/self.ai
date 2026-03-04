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

    if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
        GPU="cuda"
        TORCH_INDEX="https://download.pytorch.org/whl/cu121"
        ok "NVIDIA GPU detected (CUDA 12.1)"
        return
    fi

    if command -v rocm-smi &>/dev/null && rocm-smi &>/dev/null; then
        GPU="rocm"
        TORCH_INDEX="https://download.pytorch.org/whl/rocm6.0"
        ok "AMD GPU detected (ROCm 6.0)"
        return
    fi

    TORCH_INDEX="https://download.pytorch.org/whl/cpu"
    warn "No GPU detected, falling back to CPU"
}

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

    if [ ! -d ".venv" ]; then
        log "Creating virtual environment..."
        $PYTHON -m venv .venv
    fi
    ok "Virtual environment ready"

    source .venv/bin/activate

    if [ -n "$TORCH_INDEX" ]; then
        log "Installing PyTorch ($GPU)..."
        pip install torch --index-url "$TORCH_INDEX" --quiet
    else
        log "Installing PyTorch (MPS / default)..."
        pip install torch --quiet
    fi
    ok "PyTorch installed"

    if [ -f "requirements.txt" ]; then
        log "Installing backend dependencies..."
        pip install -r requirements.txt --quiet
        ok "Backend dependencies installed"
    else
        warn "No requirements.txt found, skipping pip install -r"
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
    npm install --silent 2>&1 | tail -1 || npm install
    ok "npm packages installed"

    if npm run build --if-present 2>/dev/null; then
        ok "Frontend built"
    else
        warn "Frontend build skipped (no build script or build failed)"
    fi

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
main() {
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
