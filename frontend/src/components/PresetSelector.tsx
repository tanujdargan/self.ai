export type PresetName = "quick" | "balanced" | "max_quality" | "custom";

interface Preset {
  id: PresetName;
  label: string;
  description: string;
  details: string;
}

const PRESETS: Preset[] = [
  {
    id: "quick",
    label: "Quick Start",
    description: "Fast iteration, good for testing",
    details: "1 epoch, rank 16, lr 3e-4",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Good quality, reasonable time",
    details: "3 epochs, rank 64, lr 2e-4",
  },
  {
    id: "max_quality",
    label: "Max Quality",
    description: "Best results, longer training",
    details: "5 epochs, rank 128, lr 1e-4",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Full control over all settings",
    details: "Configure manually",
  },
];

interface PresetSelectorProps {
  value: PresetName;
  onChange: (preset: PresetName) => void;
}

export function PresetSelector({ value, onChange }: PresetSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-zinc-300">
        Training Preset
      </label>
      <div className="grid grid-cols-2 gap-3">
        {PRESETS.map((preset) => {
          const selected = value === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(preset.id)}
              className={`p-4 rounded-lg border text-left transition-colors ${
                selected
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
              }`}
            >
              <div className="text-sm font-medium text-zinc-200">
                {preset.label}
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                {preset.description}
              </div>
              <div className="text-xs text-zinc-500 mt-2 font-mono">
                {preset.details}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
