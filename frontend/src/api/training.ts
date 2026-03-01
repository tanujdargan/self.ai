import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

export interface TrainingConfig {
  mode: string;
  base_model: string;
  preset: string;
  quantization: string;
  lora_rank: number;
  lora_alpha: number;
  lora_dropout: number;
  learning_rate: number;
  lr_scheduler: string;
  num_epochs: number;
  max_steps: number;
  batch_size: number;
  gradient_accumulation_steps: number;
  max_seq_length: number;
  packing: boolean;
  weight_decay: number;
  warmup_ratio: number;
  max_grad_norm: number;
  save_steps: number;
  logging_steps: number;
  eval_steps: number;
  early_stopping: boolean;
  early_stopping_patience: number;
  gguf_quantization: string;
  merge_before_convert: boolean;
  keep_adapter: boolean;
}

export interface TrainStartResponse {
  run_id: string;
  status: string;
}

export interface HardwareInfo {
  gpu_type: string;
  gpu_name: string;
  vram_gb: number;
  ram_gb: number;
}

export type TrainingEvent =
  | { event: "start"; run_id: string }
  | { event: "progress"; step: number; total_steps: number; loss: number; epoch: number; learning_rate: number }
  | { event: "complete"; run_id: string; output_path: string }
  | { event: "error"; message: string };

export function useHardware() {
  return useQuery<HardwareInfo>({
    queryKey: ["hardware"],
    queryFn: async () => {
      const res = await fetch("/api/system/hardware");
      if (!res.ok) throw new Error("Failed to fetch hardware info");
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function useStartTraining() {
  return useMutation<TrainStartResponse, Error, TrainingConfig>({
    mutationFn: async (config) => {
      const res = await fetch("/api/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to start training");
      }
      return res.json();
    },
  });
}

export function useCancelTraining() {
  return useMutation<void, Error, string>({
    mutationFn: async (runId) => {
      const res = await fetch(`/api/train/${runId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to cancel training");
      }
    },
  });
}

export function useTrainingProgress(runId: string | null) {
  const [events, setEvents] = useState<TrainingEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!runId) {
      disconnect();
      return;
    }

    setEvents([]);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/train/${runId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as TrainingEvent;
        setEvents((prev) => [...prev, data]);
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [runId, disconnect]);

  const latest = events.length > 0 ? events[events.length - 1] : null;

  return { events, latest, connected, disconnect };
}
