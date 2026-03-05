import { useState, useCallback, useEffect } from "react";
import { ModelPicker } from "../components/ModelPicker";
import { PresetSelector } from "../components/PresetSelector";
import type { PresetName } from "../components/PresetSelector";
import { AdvancedSettings } from "../components/AdvancedSettings";
import { TrainingDashboard } from "../components/TrainingDashboard";
import {
  useHardware,
  useSelfName,
  useStartTraining,
  useCancelTraining,
  useTrainingProgress,
} from "../api/training";
import { useHfToken } from "../api/models";
import type { TrainingConfig } from "../api/training";

function getPresetOverrides(preset: PresetName): Partial<TrainingConfig> {
  switch (preset) {
    case "quick":
      return { num_epochs: 1, lora_rank: 16, lora_alpha: 32, learning_rate: 0.0003, max_seq_length: 512 };
    case "balanced":
      return { num_epochs: 3, lora_rank: 64, lora_alpha: 128, learning_rate: 0.0002, max_seq_length: 512 };
    case "max_quality":
      return { num_epochs: 5, lora_rank: 128, lora_alpha: 256, learning_rate: 0.0001, max_seq_length: 1024 };
    case "custom":
      return {};
  }
}

const DEFAULT_CONFIG: TrainingConfig = {
  mode: "lora",
  base_model: "meta-llama/Llama-3.2-3B",
  preset: "balanced",
  quantization: "int4",
  lora_rank: 64,
  lora_alpha: 128,
  lora_dropout: 0.05,
  learning_rate: 0.0002,
  lr_scheduler: "cosine",
  num_epochs: 3,
  max_steps: -1,
  batch_size: 4,
  gradient_accumulation_steps: 4,
  max_seq_length: 512,
  packing: true,
  weight_decay: 0.01,
  warmup_ratio: 0.03,
  max_grad_norm: 1.0,
  save_steps: 100,
  logging_steps: 10,
  eval_steps: 100,
  early_stopping: false,
  early_stopping_patience: 3,
  gguf_quantization: "Q4_K_M",
  merge_before_convert: true,
  keep_adapter: true,
};

export function TrainPage() {
  const [config, setConfig] = useState<TrainingConfig>(DEFAULT_CONFIG);
  const [preset, setPreset] = useState<PresetName>("balanced");
  const [runId, setRunId] = useState<string | null>(null);

  const hardware = useHardware();
  const hfToken = useHfToken();
  const selfNameQuery = useSelfName();
  const startTraining = useStartTraining();

  useEffect(() => {
    if (selfNameQuery.data?.self_name && !config.self_name) {
      setConfig((prev) => ({ ...prev, self_name: selfNameQuery.data!.self_name! }));
    }
  }, [selfNameQuery.data]);
  const cancelTraining = useCancelTraining();
  const { events, connected, disconnect } = useTrainingProgress(runId);

  const isTraining = runId !== null;
  const isComplete = events.some((e) => e.event === "complete");
  const hasError = events.some(
    (e) => e.event === "error" || (e.event === "finished" && "return_code" in e && e.return_code !== 0)
  );

  const updateConfig = useCallback(
    <K extends keyof TrainingConfig>(key: K, value: TrainingConfig[K]) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handlePresetChange = useCallback(
    (p: PresetName) => {
      setPreset(p);
      if (p !== "custom") {
        setConfig((prev) => ({
          ...prev,
          preset: p,
          ...getPresetOverrides(p),
        }));
      } else {
        setConfig((prev) => ({ ...prev, preset: p }));
      }
    },
    []
  );

  const handleModelChange = useCallback(
    (modelId: string) => {
      setConfig((prev) => ({ ...prev, base_model: modelId }));
    },
    []
  );

  const handleStart = useCallback(async () => {
    try {
      const result = await startTraining.mutateAsync(config);
      setRunId(result.run_id);
    } catch {
      // error handled by mutation state
    }
  }, [config, startTraining]);

  const handleCancel = useCallback(async () => {
    if (!runId) return;
    try {
      await cancelTraining.mutateAsync(runId);
    } finally {
      disconnect();
      setRunId(null);
    }
  }, [runId, cancelTraining, disconnect]);

  const handleReset = useCallback(() => {
    disconnect();
    setRunId(null);
  }, [disconnect]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-zinc-100">Train Your Model</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Fine-tune a language model on your conversation data
        </p>
      </div>

      {isTraining ? (
        <div className="space-y-4">
          <TrainingDashboard
            events={events}
            connected={connected}
            onCancel={handleCancel}
          />
          {(isComplete || hasError) && (
            <button
              type="button"
              onClick={handleReset}
              className="w-full py-2.5 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-sm font-medium transition-colors"
            >
              Start New Training
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in-up stagger-1">
          <ModelPicker
            value={config.base_model}
            onChange={handleModelChange}
            hardware={hardware.data}
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">
              Your Name in Conversations
            </label>
            <input
              type="text"
              value={config.self_name ?? ""}
              onChange={(e) => updateConfig("self_name", e.target.value || undefined)}
              placeholder={selfNameQuery.isLoading ? "Detecting..." : "e.g. John"}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            />
            <p className="text-xs text-zinc-500">
              {selfNameQuery.data?.self_name
                ? `Auto-detected: ${selfNameQuery.data.self_name}`
                : "Import conversations to auto-detect"}
            </p>
          </div>

          <PresetSelector value={preset} onChange={handlePresetChange} />

          <AdvancedSettings config={config} onChange={updateConfig} />

          <div className="space-y-3">
            {!hfToken.isLoading && !hfToken.data?.has_token && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300">
                No HuggingFace token set. Most models (Llama, Mistral, etc.) require authentication.{" "}
                <a href="/settings" className="underline hover:text-amber-200">Add your token in Settings</a>.
              </div>
            )}
            {startTraining.error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                {startTraining.error.message}
              </div>
            )}
            <button
              type="button"
              onClick={handleStart}
              disabled={startTraining.isPending}
              className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {startTraining.isPending ? "Starting..." : "Start Training"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
