#Requires -Version 5.1
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$ErrorActionPreference = "Stop"

$SELFAI_PORT = 8420
$SELFAI_HOME = "$env:USERPROFILE\.selfai"
$REPO_URL = "https://github.com/tanujdargan/self.ai.git"

function Write-Step($msg)  { Write-Host "`n-> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "  + $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Fail($msg) {
    Write-Host "  x $msg" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Press Enter to exit..." -ForegroundColor Yellow
    Read-Host
    exit 1
}

# ---------------------------------------------------------------------------
function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------------------
function Get-GPU {
    Write-Step "Detecting GPU"

    if (Test-Command "nvidia-smi") {
        try {
            $null = & nvidia-smi 2>&1
            Write-Ok "NVIDIA GPU detected (CUDA 12.1)"
            return @{ Type = "cuda"; IndexUrl = "https://download.pytorch.org/whl/cu121" }
        } catch {}
    }

    Write-Warn "No GPU detected, falling back to CPU"
    return @{ Type = "cpu"; IndexUrl = "https://download.pytorch.org/whl/cpu" }
}

# ---------------------------------------------------------------------------
function Test-Python {
    Write-Step "Checking Python"

    $py = $null
    foreach ($candidate in @("python", "python3")) {
        if (Test-Command $candidate) {
            $py = $candidate
            break
        }
    }

    if (-not $py) {
        Write-Fail "Python not found. Install Python 3.10+ from https://www.python.org/downloads/"
    }

    $ver = & $py -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>&1
    $parts = $ver -split '\.'
    $major = [int]$parts[0]
    $minor = [int]$parts[1]

    if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 10)) {
        Write-Fail "Python $ver found, but 3.10+ required. Download from https://www.python.org/downloads/"
    }

    Write-Ok "Python $ver"
    return $py
}

# ---------------------------------------------------------------------------
function Test-Node {
    Write-Step "Checking Node.js"

    if (-not (Test-Command "node")) {
        Write-Fail "Node.js not found. Install Node 18+ from https://nodejs.org/ or use nvm-windows"
    }

    $ver = (& node -v) -replace '^v', ''
    $major = [int]($ver -split '\.')[0]

    if ($major -lt 18) {
        Write-Fail "Node $ver found, but 18+ required. Download from https://nodejs.org/"
    }

    Write-Ok "Node.js v$ver"

    if (-not (Test-Command "npm")) {
        Write-Fail "npm not found (should be bundled with Node.js)"
    }
    Write-Ok "npm $(& npm -v)"
}

# ---------------------------------------------------------------------------
function Test-Git {
    Write-Step "Checking Git"

    if (-not (Test-Command "git")) {
        Write-Fail "Git not found. Install from https://git-scm.com/download/win"
    }

    Write-Ok "Git $(& git --version)"
}

# ---------------------------------------------------------------------------
function Get-RepoDir {
    Write-Step "Locating Self.ai repository"

    $pyproject = Join-Path $PWD "pyproject.toml"
    if ((Test-Path $pyproject) -and (Select-String -Path $pyproject -Pattern 'name = "selfai"' -Quiet)) {
        Write-Ok "Already in Self.ai repo: $PWD"
        return $PWD
    }

    $parent = Join-Path (Split-Path $PWD) "pyproject.toml"
    if ((Test-Path $parent) -and (Select-String -Path $parent -Pattern 'name = "selfai"' -Quiet)) {
        $dir = Split-Path $PWD
        Write-Ok "Found Self.ai repo: $dir"
        return $dir
    }

    $target = Join-Path $env:USERPROFILE "self.ai"
    if (Test-Path $target) {
        Write-Fail "$target already exists. cd into it and re-run, or remove it first."
    }

    Write-Host "  Cloning repository..." -ForegroundColor Blue
    & git clone $REPO_URL $target
    Write-Ok "Cloned to $target"
    return $target
}

# ---------------------------------------------------------------------------
function Install-Backend($repoDir, $py, $gpu) {
    Write-Step "Setting up backend"

    $backendDir = Join-Path $repoDir "backend"
    Push-Location $backendDir

    $venvDir = Join-Path $backendDir ".venv"
    if (-not (Test-Path $venvDir)) {
        Write-Host "  Creating virtual environment..." -ForegroundColor Blue
        & $py -m venv .venv
    }
    Write-Ok "Virtual environment ready"

    $activate = Join-Path $venvDir "Scripts\Activate.ps1"
    & $activate

    $origEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    Write-Host "  Installing PyTorch ($($gpu.Type))..." -ForegroundColor Blue
    if ($gpu.IndexUrl) {
        & pip install torch --index-url $gpu.IndexUrl --quiet 2>&1 | Out-Null
    } else {
        & pip install torch --quiet 2>&1 | Out-Null
    }
    if ($LASTEXITCODE -ne 0) { Write-Fail "PyTorch installation failed (exit code $LASTEXITCODE)" }
    Write-Ok "PyTorch installed"

    $reqFile = Join-Path $backendDir "requirements.txt"
    if (Test-Path $reqFile) {
        Write-Host "  Installing backend dependencies..." -ForegroundColor Blue
        & pip install -r requirements.txt --quiet 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Fail "Backend dependency installation failed (exit code $LASTEXITCODE)" }
        Write-Ok "Backend dependencies installed"
    } else {
        Write-Warn "No requirements.txt found, skipping"
    }

    $ErrorActionPreference = $origEAP

    & deactivate
    Pop-Location
}

# ---------------------------------------------------------------------------
function Install-Frontend($repoDir) {
    Write-Step "Setting up frontend"

    $frontendDir = Join-Path $repoDir "frontend"
    $pkgJson = Join-Path $frontendDir "package.json"

    if (-not (Test-Path $pkgJson)) {
        Write-Warn "No package.json found in frontend/, skipping"
        return
    }

    Push-Location $frontendDir
    $origEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    Write-Host "  Installing frontend dependencies..." -ForegroundColor Blue
    & npm install --silent 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed (exit code $LASTEXITCODE)" }
    Write-Ok "npm packages installed"

    & npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Frontend built"
    } else {
        Write-Warn "Frontend build skipped"
    }

    $ErrorActionPreference = $origEAP
    Pop-Location
}

# ---------------------------------------------------------------------------
function New-Directories {
    Write-Step "Creating Self.ai directories"

    foreach ($sub in @("models", "datasets", "runs", "config")) {
        $dir = Join-Path $SELFAI_HOME $sub
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
    Write-Ok "$SELFAI_HOME\ created"
}

# ---------------------------------------------------------------------------
function Install-Launcher($repoDir) {
    Write-Step "Installing launcher"

    $batSource = Join-Path $repoDir "scripts\selfai.bat"
    if (-not (Test-Path $batSource)) {
        Write-Warn "selfai.bat not found, skipping launcher install"
        return
    }

    $destDir = Join-Path $env:USERPROFILE ".local\bin"
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    Copy-Item $batSource (Join-Path $destDir "selfai.bat") -Force
    Write-Ok "Copied selfai.bat to $destDir"

    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($currentPath -notlike "*$destDir*") {
        Write-Warn "$destDir is not in your PATH. Add it:"
        Write-Host "    `$env:PATH = `"$destDir;`$env:PATH`"" -ForegroundColor Cyan
    }
}

# ---------------------------------------------------------------------------
function Write-Success($repoDir, $gpu) {
    Write-Host ""
    Write-Host "  ================================================" -ForegroundColor Green
    Write-Host "    Self.ai installed successfully!" -ForegroundColor Green
    Write-Host "  ================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  GPU:       $($gpu.Type)"
    Write-Host "  Directory: $repoDir"
    Write-Host "  Data:      $SELFAI_HOME"
    Write-Host "  Port:      $SELFAI_PORT"
    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor Cyan
    Write-Host "    selfai start    Launch Self.ai"
    Write-Host "    selfai stop     Stop the server"
    Write-Host ""
}

# ===========================================================================
function Main {
    Write-Host ""
    Write-Host "  ____       _  __           _ " -ForegroundColor Cyan
    Write-Host " / ___|  ___| |/ _|   __ _ (_)" -ForegroundColor Cyan
    Write-Host " \___ \ / _ \ | |_   / _`` || |" -ForegroundColor Cyan
    Write-Host "  ___) |  __/ |  _| | (_| || |" -ForegroundColor Cyan
    Write-Host " |____/ \___|_|_|    \__,_|/ |" -ForegroundColor Cyan
    Write-Host "                         |__/ " -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Local LLM Finetuning Platform" -ForegroundColor White
    Write-Host ""

    $gpu = Get-GPU
    $py = Test-Python
    Test-Node
    Test-Git
    $repoDir = Get-RepoDir
    Install-Backend $repoDir $py $gpu
    Install-Frontend $repoDir
    New-Directories
    Install-Launcher $repoDir
    Write-Success $repoDir $gpu
}

try {
    Main
} catch {
    Write-Host ""
    Write-Host "  x Installation failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Press Enter to exit..." -ForegroundColor Yellow
    Read-Host
    exit 1
}
