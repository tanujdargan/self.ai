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
    const err = await res.text();
    throw new Error(err || "Upload failed");
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
