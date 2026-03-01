interface ChatStreamProps {
  content: string;
}

export function ChatStream({ content }: ChatStreamProps) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-zinc-800/70 text-zinc-300 border border-zinc-700/50">
        {content ? (
          <span className="whitespace-pre-wrap">{content}</span>
        ) : (
          <span className="flex items-center gap-1.5 text-zinc-500">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" />
            <span
              className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse"
              style={{ animationDelay: "0.2s" }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse"
              style={{ animationDelay: "0.4s" }}
            />
          </span>
        )}
        <span className="inline-block w-0.5 h-4 bg-zinc-400 animate-pulse ml-0.5 align-text-bottom" />
      </div>
    </div>
  );
}
