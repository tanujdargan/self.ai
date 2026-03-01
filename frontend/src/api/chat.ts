import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Model {
  id: string;
  name: string;
  mode: string;
  base_model: string;
  is_loaded: boolean;
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

interface UseChatStreamOptions {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export function useChatStream() {
  const wsRef = useRef<WebSocket | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const send = useCallback(
    (
      modelId: string,
      messages: ChatMessage[],
      { onToken, onDone, onError }: UseChatStreamOptions
    ) => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      setIsStreaming(true);

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            model_id: modelId,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          })
        );
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "token") {
          onToken(data.content);
        } else if (data.type === "done") {
          setIsStreaming(false);
          onDone();
          ws.close();
        } else if (data.type === "error") {
          setIsStreaming(false);
          onError(data.message);
          ws.close();
        }
      };

      ws.onerror = () => {
        setIsStreaming(false);
        onError("WebSocket connection failed");
      };

      ws.onclose = () => {
        setIsStreaming(false);
        wsRef.current = null;
      };
    },
    []
  );

  const cancel = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  return { send, cancel, isStreaming };
}
