import { useState } from "react";
import type { TrainingConfig } from "../api/training";

type ConfigKey = keyof TrainingConfig;

interface AdvancedSettingsProps {
  config: TrainingConfig;
  onChange: <K extends ConfigKey>(key: K, value: TrainingConfig[K]) => void;
}

function NumberInput({
  label,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        min={min}
        max={max}
        className="w-full px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
      />
    </div>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs text-zinc-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-xs text-zinc-400">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? "bg-blue-500" : "bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
    </label>
  );
}

export function AdvancedSettings({ config, onChange }: AdvancedSettingsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-zinc-800 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors"
      >
        <span>Advanced Settings</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-6">
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
              LoRA Configuration
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <SelectInput
                label="Mode"
                value={config.mode}
                onChange={(v) => onChange("mode", v)}
                options={[
                  { value: "lora", label: "LoRA" },
                  { value: "qlora", label: "QLoRA" },
                ]}
              />
              <NumberInput
                label="Rank"
                value={config.lora_rank}
                onChange={(v) => onChange("lora_rank", v)}
                min={4}
                max={256}
                step={8}
              />
              <NumberInput
                label="Alpha"
                value={config.lora_alpha}
                onChange={(v) => onChange("lora_alpha", v)}
                min={8}
                max={512}
                step={8}
              />
              <NumberInput
                label="Dropout"
                value={config.lora_dropout}
                onChange={(v) => onChange("lora_dropout", v)}
                min={0}
                max={0.5}
                step={0.01}
              />
              <SelectInput
                label="Quantization"
                value={config.quantization}
                onChange={(v) => onChange("quantization", v)}
                options={[
                  { value: "none", label: "None" },
                  { value: "int4", label: "INT4" },
                  { value: "int8", label: "INT8" },
                ]}
              />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
              Training Hyperparameters
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <NumberInput
                label="Learning Rate"
                value={config.learning_rate}
                onChange={(v) => onChange("learning_rate", v)}
                min={0.00001}
                max={0.01}
                step={0.00001}
              />
              <SelectInput
                label="LR Scheduler"
                value={config.lr_scheduler}
                onChange={(v) => onChange("lr_scheduler", v)}
                options={[
                  { value: "cosine", label: "Cosine" },
                  { value: "linear", label: "Linear" },
                  { value: "constant", label: "Constant" },
                ]}
              />
              <NumberInput
                label="Epochs"
                value={config.num_epochs}
                onChange={(v) => onChange("num_epochs", v)}
                min={1}
                max={50}
              />
              <NumberInput
                label="Max Steps (-1 = auto)"
                value={config.max_steps}
                onChange={(v) => onChange("max_steps", v)}
                min={-1}
              />
              <NumberInput
                label="Batch Size"
                value={config.batch_size}
                onChange={(v) => onChange("batch_size", v)}
                min={1}
                max={64}
              />
              <NumberInput
                label="Gradient Accum Steps"
                value={config.gradient_accumulation_steps}
                onChange={(v) => onChange("gradient_accumulation_steps", v)}
                min={1}
                max={64}
              />
              <NumberInput
                label="Max Seq Length"
                value={config.max_seq_length}
                onChange={(v) => onChange("max_seq_length", v)}
                min={128}
                max={8192}
                step={128}
              />
              <NumberInput
                label="Weight Decay"
                value={config.weight_decay}
                onChange={(v) => onChange("weight_decay", v)}
                min={0}
                max={1}
                step={0.01}
              />
              <NumberInput
                label="Warmup Ratio"
                value={config.warmup_ratio}
                onChange={(v) => onChange("warmup_ratio", v)}
                min={0}
                max={0.5}
                step={0.01}
              />
              <NumberInput
                label="Max Grad Norm"
                value={config.max_grad_norm}
                onChange={(v) => onChange("max_grad_norm", v)}
                min={0}
                max={10}
                step={0.1}
              />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
              Logging & Checkpoints
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <NumberInput
                label="Save Steps"
                value={config.save_steps}
                onChange={(v) => onChange("save_steps", v)}
                min={10}
              />
              <NumberInput
                label="Logging Steps"
                value={config.logging_steps}
                onChange={(v) => onChange("logging_steps", v)}
                min={1}
              />
              <NumberInput
                label="Eval Steps"
                value={config.eval_steps}
                onChange={(v) => onChange("eval_steps", v)}
                min={10}
              />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
              Options
            </h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Toggle
                label="Packing"
                checked={config.packing}
                onChange={(v) => onChange("packing", v)}
              />
              <Toggle
                label="Early Stopping"
                checked={config.early_stopping}
                onChange={(v) => onChange("early_stopping", v)}
              />
              <Toggle
                label="Merge Before Convert"
                checked={config.merge_before_convert}
                onChange={(v) => onChange("merge_before_convert", v)}
              />
              <Toggle
                label="Keep Adapter"
                checked={config.keep_adapter}
                onChange={(v) => onChange("keep_adapter", v)}
              />
              {config.early_stopping && (
                <NumberInput
                  label="Early Stopping Patience"
                  value={config.early_stopping_patience}
                  onChange={(v) => onChange("early_stopping_patience", v)}
                  min={1}
                  max={20}
                />
              )}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
              Export
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <SelectInput
                label="GGUF Quantization"
                value={config.gguf_quantization}
                onChange={(v) => onChange("gguf_quantization", v)}
                options={[
                  { value: "Q4_K_M", label: "Q4_K_M" },
                  { value: "Q5_K_M", label: "Q5_K_M" },
                  { value: "Q8_0", label: "Q8_0" },
                  { value: "F16", label: "F16" },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
