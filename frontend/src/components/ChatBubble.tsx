interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
}

export function ChatBubble({ role, content }: ChatBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in-up`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-zinc-700 text-zinc-100"
            : "bg-zinc-800/70 text-zinc-300 border border-zinc-700/50"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
