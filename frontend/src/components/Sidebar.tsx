import { Link, useMatchRoute } from "@tanstack/react-router";
import type { JSX } from "react";

const NAV_ITEMS = [
  { path: "/", icon: "chat", label: "Chat", fuzzy: false },
  { path: "/import", icon: "import", label: "Import", fuzzy: true },
  { path: "/train", icon: "train", label: "Train", fuzzy: true },
  { path: "/models", icon: "models", label: "Models", fuzzy: true },
  { path: "/settings", icon: "settings", label: "Settings", fuzzy: true },
] as const;

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const matchRoute = useMatchRoute();

  return (
    <div className="w-44 h-full bg-zinc-900 border-r border-zinc-800 flex flex-col py-4 gap-1 px-3">
      <Link
        to="/"
        onClick={onNavigate}
        className="h-9 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center gap-2.5 px-2.5 mb-3 transition-all active:scale-95"
      >
        <span className="text-sm font-bold text-zinc-300">S</span>
        <span className="text-sm font-semibold text-zinc-300">Self.ai</span>
      </Link>

      {NAV_ITEMS.map((item) => {
        const isActive = matchRoute({ to: item.path, fuzzy: item.fuzzy });
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={`h-9 rounded-lg flex items-center gap-2.5 px-2.5 transition-all active:scale-95 text-sm font-medium ${
              isActive
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            }`}
          >
            <IconForNav icon={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function IconForNav({ icon }: { icon: string }) {
  const icons: Record<string, JSX.Element> = {
    chat: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
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
    ),
    import: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
        />
      </svg>
    ),
    train: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
    ),
    models: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
    ),
    settings: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  };
  return icons[icon] || <span>?</span>;
}
