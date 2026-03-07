import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type Source = "whatsapp" | "instagram" | "discord" | "email" | "imessage";

export interface ImportResult {
  import_id: string;
  source: Source;
  file_name: string;
  message_count: number;
  status: string;
}

export interface Conversation {
  id: string;
  source: Source;
  file_name: string;
  message_count: number;
  participants: string[];
}

export interface DataStats {
  total_messages: number;
  total_conversations: number;
  sources: Record<Source, { messages: number; conversations: number }>;
}

async function uploadImport(file: File, source: Source): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("source", source);

  const res = await fetch("/api/import", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || "Upload failed");
  }

  return res.json();
}

export function useImportUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, source }: { file: File; source: Source }) =>
      uploadImport(file, source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["data-stats"] });
    },
  });
}

export type FileStatus = "pending" | "uploading" | "done" | "error";

export interface FileUploadEntry {
  file: File;
  status: FileStatus;
  result?: ImportResult;
  error?: string;
}

export interface MultiImportState {
  files: FileUploadEntry[];
  currentIndex: number;
  totalFiles: number;
  isUploading: boolean;
  totalMessages: number;
  errorCount: number;
}

export function useMultiImportUpload() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<MultiImportState>({
    files: [],
    currentIndex: 0,
    totalFiles: 0,
    isUploading: false,
    totalMessages: 0,
    errorCount: 0,
  });

  const upload = useCallback(
    async (files: File[], source: Source) => {
      const entries: FileUploadEntry[] = files.map((file) => ({
        file,
        status: "pending" as FileStatus,
      }));

      setState({
        files: entries,
        currentIndex: 0,
        totalFiles: files.length,
        isUploading: true,
        totalMessages: 0,
        errorCount: 0,
      });

      let totalMessages = 0;
      let errorCount = 0;

      for (let i = 0; i < files.length; i++) {
        setState((prev) => ({
          ...prev,
          currentIndex: i,
          files: prev.files.map((f, idx) =>
            idx === i ? { ...f, status: "uploading" } : f
          ),
        }));

        try {
          const result = await uploadImport(files[i], source);
          totalMessages += result.message_count;
          setState((prev) => ({
            ...prev,
            totalMessages,
            files: prev.files.map((f, idx) =>
              idx === i ? { ...f, status: "done", result } : f
            ),
          }));
        } catch (err) {
          errorCount++;
          const message =
            err instanceof Error ? err.message : "Upload failed";
          setState((prev) => ({
            ...prev,
            errorCount,
            files: prev.files.map((f, idx) =>
              idx === i ? { ...f, status: "error", error: message } : f
            ),
          }));
        }
      }

      setState((prev) => ({ ...prev, isUploading: false }));
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["data-stats"] });
    },
    [queryClient]
  );

  const reset = useCallback(() => {
    setState({
      files: [],
      currentIndex: 0,
      totalFiles: 0,
      isUploading: false,
      totalMessages: 0,
      errorCount: 0,
    });
  }, []);

  return { state, upload, reset };
}

export interface PathImportResult {
  source: Source;
  imported: { import_id: string; file_name: string; message_count: number }[];
  errors: { file: string; error: string }[];
  total_files: number;
  total_messages: number;
}

export function usePathImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, source }: { path: string; source: Source }): Promise<PathImportResult> => {
      const res = await fetch("/api/import/from-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, source }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Import failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["data-stats"] });
    },
  });
}

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: async () => {
      const res = await fetch("/api/data/conversations");
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
  });
}

export function useDataStats() {
  return useQuery<DataStats>({
    queryKey: ["data-stats"],
    queryFn: async () => {
      const res = await fetch("/api/data/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });
}
