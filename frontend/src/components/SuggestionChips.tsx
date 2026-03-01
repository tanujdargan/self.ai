const SUGGESTIONS = [
  { icon: "\u{1F4AC}", label: "Any advice for me?" },
  { icon: "\u{1F50D}", label: "Patterns in my chats" },
  { icon: "\u{1F4CA}", label: "Life lessons from me" },
];

export function SuggestionChips() {
  return (
    <div className="flex flex-wrap justify-center gap-2 mt-6">
      {SUGGESTIONS.map((s) => (
        <button
          key={s.label}
          className={`flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800/60 border border-zinc-700/40 text-zinc-400 text-sm hover:bg-zinc-800 hover:text-zinc-300 hover:border-zinc-600 active:scale-95 transition-all duration-200`}
        >
          <span>{s.icon}</span>
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  );
}
