import type { HardwareInfo } from "../api/training";

interface ModelOption {
  id: string;
  name: string;
  params: string;
  vram: number;
}

const MODELS: ModelOption[] = [
  { id: "TinyLlama/TinyLlama-1.1B-Chat-v1.0", name: "TinyLlama-1.1B", params: "1.1B", vram: 2 },
  { id: "microsoft/Phi-3.5-mini-instruct", name: "Phi-3.5-mini-instruct", params: "3.8B", vram: 4 },
  { id: "meta-llama/Llama-3.2-3B", name: "Llama-3.2-3B", params: "3B", vram: 4 },
  { id: "meta-llama/Llama-3.1-8B", name: "Llama-3.1-8B", params: "8B", vram: 8 },
  { id: "mistralai/Mistral-7B-v0.3", name: "Mistral-7B-v0.3", params: "7B", vram: 8 },
  { id: "meta-llama/Llama-3.1-70B", name: "Llama-3.1-70B", params: "70B", vram: 40 },
];

interface ModelPickerProps {
  value: string;
  onChange: (modelId: string) => void;
  hardware: HardwareInfo | undefined;
}

export function ModelPicker({ value, onChange, hardware }: ModelPickerProps) {
  const availableVram = hardware?.vram_gb ?? 0;

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-zinc-300">Base Model</label>
      <div className="grid gap-2">
        {MODELS.map((model) => {
          const fits = availableVram === 0 || model.vram <= availableVram;
          const selected = value === model.id;

          return (
            <button
              key={model.id}
              type="button"
              onClick={() => onChange(model.id)}
              className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                selected
                  ? "border-blue-500 bg-blue-500/10"
                  : fits
                    ? "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                    : "border-zinc-800 bg-zinc-900/50 opacity-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    fits ? "bg-emerald-400" : "bg-red-400"
                  }`}
                />
                <div>
                  <div className="text-sm font-medium text-zinc-200">
                    {model.name}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {model.params} parameters
                  </div>
                </div>
              </div>
              <div className="text-xs text-zinc-500">
                ~{model.vram}GB VRAM
              </div>
            </button>
          );
        })}
      </div>
      {hardware && (
        <p className="text-xs text-zinc-500">
          Detected: {hardware.gpu_name || hardware.gpu_type} ({hardware.vram_gb}GB VRAM)
        </p>
      )}
    </div>
  );
}
