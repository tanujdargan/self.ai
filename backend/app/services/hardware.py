import platform
import subprocess
import shutil
import psutil


def detect_hardware() -> dict:
    info = {
        "gpu_type": "cpu",
        "gpu_name": None,
        "vram_gb": None,
        "ram_gb": round(psutil.virtual_memory().total / (1024**3), 1),
        "cuda_version": None,
        "rocm_version": None,
        "os": platform.system(),
        "arch": platform.machine(),
    }

    # Check NVIDIA
    if shutil.which("nvidia-smi"):
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                parts = result.stdout.strip().split(",")
                info["gpu_type"] = "nvidia"
                info["gpu_name"] = parts[0].strip()
                info["vram_gb"] = round(float(parts[1].strip()) / 1024, 1)

                cuda_result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
                    capture_output=True, text=True, timeout=10,
                )
                if cuda_result.returncode == 0:
                    info["cuda_version"] = cuda_result.stdout.strip()
        except Exception:
            pass

    # Check Apple Silicon
    elif platform.system() == "Darwin" and platform.machine() == "arm64":
        info["gpu_type"] = "apple_silicon"
        info["gpu_name"] = "Apple Silicon (MPS)"
        info["vram_gb"] = info["ram_gb"]

    # Check AMD ROCm
    elif shutil.which("rocm-smi"):
        try:
            result = subprocess.run(
                ["rocm-smi", "--showproductname"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                info["gpu_type"] = "amd"
                info["gpu_name"] = result.stdout.strip().split("\n")[-1].strip()
                vram_result = subprocess.run(
                    ["rocm-smi", "--showmeminfo", "vram", "--csv"],
                    capture_output=True, text=True, timeout=10,
                )
                if vram_result.returncode == 0:
                    for line in vram_result.stdout.strip().split("\n"):
                        if "Total" in line or line.replace(",", "").strip().isdigit():
                            try:
                                vram_bytes = int(line.replace(",", "").strip())
                                info["vram_gb"] = round(vram_bytes / (1024**3), 1)
                            except ValueError:
                                pass
        except Exception:
            pass

    return info
