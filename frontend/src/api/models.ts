import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface Model {
  id: string;
  name: string;
  mode: "style" | "insights";
  base_model: string;
  gguf_path: string | null;
  adapter_path: string | null;
  created_at: string;
  is_loaded: boolean;
  training_run_id: string | null;
  config_json: Record<string, unknown> | null;
}

export interface HardwareInfo {
  gpu_type: string;
  gpu_name: string;
  vram_gb: number;
  ram_gb: number;
  cuda_version: string;
  os: string;
  arch: string;
}

export interface DataStats {
  conversations: number;
  total_messages: number;
  by_source: Record<string, number>;
  storage: {
    imports_mb: number;
    parsed_mb: number;
    models_mb: number;
    total_mb: number;
  };
}

export function useModels() {
  return useQuery<Model[]>({
    queryKey: ["models"],
    queryFn: async () => {
      const res = await fetch("/api/models");
      if (!res.ok) throw new Error("Failed to fetch models");
      return res.json();
    },
  });
}

export function useLoadModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (modelId: string) => {
      const res = await fetch(`/api/models/${modelId}/load`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to load model");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
    },
  });
}

export function useUnloadModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (modelId: string) => {
      const res = await fetch(`/api/models/${modelId}/unload`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to unload model");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
    },
  });
}

export function useDeleteModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (modelId: string) => {
      const res = await fetch(`/api/models/${modelId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete model");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
    },
  });
}

export function useHardware() {
  return useQuery<HardwareInfo>({
    queryKey: ["hardware"],
    queryFn: async () => {
      const res = await fetch("/api/system/hardware");
      if (!res.ok) throw new Error("Failed to fetch hardware info");
      return res.json();
    },
  });
}

export function useStorageStats() {
  return useQuery<DataStats>({
    queryKey: ["data-stats"],
    queryFn: async () => {
      const res = await fetch("/api/data/stats");
      if (!res.ok) throw new Error("Failed to fetch data stats");
      return res.json();
    },
  });
}

export function useDeleteAllData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/data", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete data");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-stats"] });
      queryClient.invalidateQueries({ queryKey: ["models"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
