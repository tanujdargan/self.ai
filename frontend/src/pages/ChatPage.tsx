import { useEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { ChatBubble } from "../components/ChatBubble";
import { ChatStream } from "../components/ChatStream";
import { useChatStream, useModels } from "../api/chat";
import type { ChatMessage } from "../api/chat";

export function ChatPage() {
  const { sessionId } = useParams({ from: "/app-layout/chat/$sessionId" });
  const { data: models, isLoading: modelsLoading } = useModels();
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streamContent, setStreamContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { send, cancel, isStreaming } = useChatStream();

  useEffect(() => {
    if (models && models.length > 0 && !selectedModelId) {
      setSelectedModelId(models[0].id);
    }
  }, [models, selectedModelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

  useEffect(() => {
    setMessages([]);
    setStreamContent("");
    setError(null);
  }, [sessionId]);

  const selectedModel = models?.find((m) => m.id === selectedModelId);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !selectedModelId) return;

    if (selectedModel && !selectedModel.is_loaded) {
      setError(`Model "${selectedModel.name}" is not loaded. Please load it from the Models page first.`);
      return;
    }

    setError(null);
    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setStreamContent("");

    send(selectedModelId, updatedMessages, {
      onToken: (token) => {
        setStreamContent((prev) => prev + token);
      },
      onDone: () => {
        setStreamContent((prev) => {
          setMessages((msgs) => [...msgs, { role: "assistant", content: prev }]);
          return "";
        });
      },
      onError: (message) => {
        setStreamContent("");
        setError(message);
      },
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-zinc-400">Chat</h2>
          <span className="text-xs text-zinc-600 font-mono">{sessionId}</span>
        </div>
        <div className="flex items-center gap-2">
          {modelsLoading ? (
            <span className="text-xs text-zinc-500">Loading models...</span>
          ) : (
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="bg-zinc-800 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-300 outline-none focus:border-zinc-600 transition-colors"
            >
              {!models?.length && (
                <option value="">No models available</option>
              )}
              {models?.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                  {!model.is_loaded ? " (not loaded)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && !isStreaming && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-zinc-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <p className="text-zinc-500 text-sm">
                Start a conversation with your AI
              </p>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg, i) => (
            <ChatBubble key={i} role={msg.role} content={msg.content} />
          ))}
          {isStreaming && <ChatStream content={streamContent} />}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 ml-3"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}

      <div className="px-4 py-3 border-t border-zinc-800/50">
        <div className="max-w-2xl mx-auto flex items-center gap-3 bg-zinc-800/80 border border-zinc-700/50 rounded-xl px-4 py-3 focus-within:border-zinc-600 transition-colors">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isStreaming}
            className="flex-1 bg-transparent outline-none text-zinc-200 placeholder-zinc-500 disabled:opacity-50"
          />
          {isStreaming ? (
            <button
              onClick={cancel}
              className="p-1.5 rounded-lg bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
              title="Stop generating"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <rect x="5" y="5" width="10" height="10" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || !selectedModelId}
              className="p-1.5 rounded-lg bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Send message"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14M12 5l7 7-7 7"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
