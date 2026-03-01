import { useState } from "react";

export function ChatInput({ onSubmit }: { onSubmit?: (message: string) => void } = {}) {
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    const msg = value.trim();
    if (msg && onSubmit) {
      onSubmit(msg);
      setValue("");
    }
  };

  return (
    <div className="w-full max-w-xl">
      <div className="flex items-center gap-3 bg-zinc-800/80 border border-zinc-700/50 rounded-xl px-4 py-3 focus-within:border-zinc-600 transition-all focus-within:shadow-lg focus-within:shadow-zinc-900/50">
        <button className="text-zinc-500 hover:text-zinc-300 transition-colors active:scale-90">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Ask anything ..."
          className="flex-1 bg-transparent outline-none text-zinc-200 placeholder-zinc-500"
        />
        {value.trim() ? (
          <button
            onClick={handleSubmit}
            className="text-zinc-300 hover:text-zinc-100 transition-all active:scale-90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        ) : (
          <button className="text-zinc-500 hover:text-zinc-300 transition-colors active:scale-90">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
