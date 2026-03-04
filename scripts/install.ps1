#Requires -Version 5.1
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$ErrorActionPreference = "Continue"

$SELFAI_PORT = 8420
$SELFAI_HOME = "$env:USERPROFILE\.selfai"
$REPO_URL = "https://github.com/tanujdargan/self.ai.git"
$script:Verbose = $false
$script:Unattended = [Environment]::GetCommandLineArgs() -contains "-NonInteractive"
$MIN_DISK_GB = 5

# PyTorch CUDA wheel URLs — single source of truth
# See https://pytorch.org/get-started/locally/ for current versions
$TORCH_CU130 = "https://download.pytorch.org/whl/cu130"
$TORCH_CU128 = "https://download.pytorch.org/whl/cu128"
$TORCH_CU126 = "https://download.pytorch.org/whl/cu126"

# Max supported Python for PyTorch (#9 review)
$MAX_PYTHON_MINOR = 13

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
function Write-Step($msg)  { Write-Host "`n-> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "  + $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "  ! $msg" -ForegroundColor Yellow }

function Write-Fail($msg) {
    Write-Host "  x $msg" -ForegroundColor Red
    if (-not $script:Unattended) {
        Write-Host ""
        Write-Host "  Press Enter to exit..." -ForegroundColor Yellow
        Read-Host
    }
    exit 1
}

# ---------------------------------------------------------------------------
# Helpers — #6 fix: build complete arg list, only branch on output handling
# ---------------------------------------------------------------------------
function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Invoke-Pip {
    param([string[]]$Arguments)
    $pipArgs = $Arguments + $(if (-not $script:Verbose) { @("--quiet") } else { @() })
    if ($script:Verbose) {
        & pip @pipArgs
    } else {
        & pip @pipArgs 2>&1 | Out-Null
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "pip $($Arguments[0]) failed (exit code $LASTEXITCODE). Re-run with verbose mode for details."
    }
}

function Invoke-Npm {
    param([string[]]$Arguments, [switch]$AllowFail)
    $npmArgs = $Arguments + $(if (-not $script:Verbose) { @("--silent") } else { @() })
    if ($script:Verbose) {
        & npm @npmArgs
    } else {
        & npm @npmArgs 2>&1 | Out-Null
    }
    if ($LASTEXITCODE -ne 0 -and -not $AllowFail) {
        Write-Fail "npm $($Arguments[0]) failed (exit code $LASTEXITCODE). Re-run with verbose mode for details."
    }
    return $LASTEXITCODE
}

# ---------------------------------------------------------------------------
# #2 fix: check multiple hosts + detect captive portals
# ---------------------------------------------------------------------------
function Test-Network {
    Write-Step "Checking network connectivity"

    $hosts = @("https://pypi.org/simple/", "https://github.com", "https://download.pytorch.org")
    $reachable = 0

    foreach ($url in $hosts) {
        try {
            $response = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
            $body = $response.Content
            if ($body -and $body.Length -gt 0 -and $body -match '(?i)<html') {
                # pypi/github legitimately return HTML, only flag pytorch.org
                if ($url -like "*pytorch*") {
                    Write-Warn "$url returned HTML - possible captive portal"
                    continue
                }
            }
            $reachable++
        } catch {
            Write-Warn "Cannot reach $url"
        }
    }

    if ($reachable -eq 0) {
        Write-Fail "No network connectivity. Check your internet connection and try again."
    } elseif ($reachable -lt $hosts.Count) {
        Write-Warn "Some hosts unreachable - installation may fail at certain steps"
    } else {
        Write-Ok "Network reachable"
    }
}

# ---------------------------------------------------------------------------
# #8 fix: use WMI for disk space (works on UNC paths and network drives)
# ---------------------------------------------------------------------------
function Test-DiskSpace {
    Write-Step "Checking disk space"

    try {
        $profilePath = $env:USERPROFILE
        if ($profilePath -match '^([A-Za-z]):') {
            $driveLetter = $Matches[1]
            $disk = Get-PSDrive $driveLetter -ErrorAction Stop
            $freeGB = [math]::Round($disk.Free / 1GB, 1)
        } else {
            # UNC path or network drive — use .NET to check
            $driveInfo = [System.IO.DriveInfo]::GetDrives() | Where-Object { $profilePath.StartsWith($_.RootDirectory.FullName) } | Select-Object -First 1
            if ($driveInfo) {
                $freeGB = [math]::Round($driveInfo.AvailableFreeSpace / 1GB, 1)
            } else {
                Write-Warn "Could not determine available disk space for $profilePath, continuing anyway"
                return
            }
        }

        if ($freeGB -lt $MIN_DISK_GB) {
            Write-Fail "Insufficient disk space: ${freeGB}GB available, ${MIN_DISK_GB}GB required (PyTorch alone is ~2GB)"
        }
        Write-Ok "${freeGB}GB available"
    } catch {
        Write-Warn "Could not determine available disk space, continuing anyway"
    }
}

# ---------------------------------------------------------------------------
# CUDA version logic: cudaMajor > 12 OR (== 12 AND minor >= 4)
# Uses constants from top of file
# ---------------------------------------------------------------------------
function Get-GPU {
    Write-Step "Detecting GPU"

    if (Test-Command "nvidia-smi") {
        try {
            $smiOutput = & nvidia-smi 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "nvidia-smi found but failed: $smiOutput"
                Write-Warn "Falling back to CPU (check your NVIDIA drivers)"
            } else {
                $cudaMatch = [regex]::Match($smiOutput, 'CUDA Version:\s+(\d+)\.(\d+)')
                if ($cudaMatch.Success) {
                    $cudaMajor = [int]$cudaMatch.Groups[1].Value
                    $cudaMinor = [int]$cudaMatch.Groups[2].Value
                    Write-Ok "NVIDIA GPU detected (CUDA $cudaMajor.$cudaMinor)"

                    # match to nearest supported PyTorch CUDA wheel
                    if ($cudaMajor -ge 13) {
                        return @{ Type = "cuda"; IndexUrl = $TORCH_CU130 }
                    } elseif ($cudaMajor -eq 12 -and $cudaMinor -ge 8) {
                        return @{ Type = "cuda"; IndexUrl = $TORCH_CU128 }
                    } elseif ($cudaMajor -eq 12) {
                        return @{ Type = "cuda"; IndexUrl = $TORCH_CU126 }
                    } else {
                        Write-Warn "CUDA $cudaMajor.$cudaMinor is too old for current PyTorch, trying cu126"
                        return @{ Type = "cuda"; IndexUrl = $TORCH_CU126 }
                    }
                } else {
                    Write-Warn "nvidia-smi found but could not parse CUDA version"
                    Write-Warn "Falling back to CPU"
                }
            }
        } catch {
            Write-Warn "nvidia-smi threw an exception: $_"
            Write-Warn "Falling back to CPU (check your NVIDIA drivers)"
        }
    }

    Write-Warn "No GPU detected, installing CPU-only PyTorch"
    return @{ Type = "cpu"; IndexUrl = "" }
}

# ---------------------------------------------------------------------------
# #9 fix: warn on Python > MAX_PYTHON_MINOR
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

    if ($major -eq 3 -and $minor -gt $MAX_PYTHON_MINOR) {
        Write-Warn "Python $ver detected - PyTorch may not support versions above 3.$MAX_PYTHON_MINOR yet"
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
    if ($LASTEXITCODE -ne 0) { Write-Fail "git clone failed" }
    Write-Ok "Cloned to $target"
    return $target
}

# ---------------------------------------------------------------------------
# #7/#10 fix: use -CommandType Function for explicit deactivate check
# ---------------------------------------------------------------------------
function Install-Backend($repoDir, $py, $gpu) {
    Write-Step "Setting up backend"

    $backendDir = Join-Path $repoDir "backend"
    Push-Location $backendDir

    $venvDir = Join-Path $backendDir ".venv"

    # wipe broken venv on retry
    if ((Test-Path $venvDir) -and -not (Test-Path (Join-Path $venvDir "Scripts\python.exe"))) {
        Write-Warn "Removing broken virtual environment..."
        Remove-Item -Recurse -Force $venvDir
    }

    if (-not (Test-Path $venvDir)) {
        Write-Host "  Creating virtual environment..." -ForegroundColor Blue
        & $py -m venv .venv
        if ($LASTEXITCODE -ne 0) { Write-Fail "Failed to create virtual environment" }
    }
    Write-Ok "Virtual environment ready"

    $activate = Join-Path $venvDir "Scripts\Activate.ps1"
    . $activate

    Write-Host "  Installing PyTorch ($($gpu.Type))..." -ForegroundColor Blue
    if ($gpu.IndexUrl) {
        Invoke-Pip -Arguments @("install", "torch", "--index-url", $gpu.IndexUrl)
    } else {
        Invoke-Pip -Arguments @("install", "torch")
    }
    Write-Ok "PyTorch installed"

    $reqFile = Join-Path $backendDir "requirements.txt"
    if (Test-Path $reqFile) {
        Write-Host "  Installing backend dependencies..." -ForegroundColor Blue
        Invoke-Pip -Arguments @("install", "-r", "requirements.txt")
        Write-Ok "Backend dependencies installed"
    } else {
        Write-Warn "No requirements.txt found, skipping"
    }

    if (Get-Command -Name deactivate -CommandType Function -ErrorAction SilentlyContinue) {
        deactivate
    }
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

    Write-Host "  Installing frontend dependencies..." -ForegroundColor Blue
    Invoke-Npm -Arguments @("install")
    Write-Ok "npm packages installed"

    Write-Host "  Building frontend..." -ForegroundColor Blue
    & npm run build 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Frontend built"
    } else {
        Write-Fail "Frontend build failed (exit code $LASTEXITCODE). Check the output above."
    }

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
        [Environment]::SetEnvironmentVariable("PATH", "$destDir;$currentPath", "User")
        $env:PATH = "$destDir;$env:PATH"
        Write-Ok "Added $destDir to user PATH"
        Write-Warn "Restart your terminal for PATH changes to take effect"
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

    if (-not $script:Unattended) {
        $choice = Read-Host "  Enable verbose output? (y/N)"
        if ($choice -match '^[yY]') {
            $script:Verbose = $true
            Write-Ok "Verbose mode enabled"
        }
        Write-Host ""
    }

    Test-Network
    Test-DiskSpace
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
    if (-not $script:Unattended) {
        Write-Host ""
        Write-Host "  Press Enter to exit..." -ForegroundColor Yellow
        Read-Host
    }
    exit 1
}
