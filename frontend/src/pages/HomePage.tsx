import { useState, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChatInput } from "../components/ChatInput";
import { SuggestionChips } from "../components/SuggestionChips";
import { AiDisclaimer } from "../components/AiDisclaimer";
import { Sidebar } from "../components/Sidebar";

export function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 relative overflow-hidden">
      {/* Sidebar overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 animate-backdrop-in"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed left-0 top-0 bottom-0 z-50 animate-slide-sidebar-in">
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* Top bar */}
      <div className={`absolute top-0 left-0 right-0 flex justify-between items-center p-4 ${mounted ? "animate-fade-in-down" : "opacity-0"}`}>
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-zinc-800 active:scale-95 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link to="/settings" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 text-sm transition-all active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </Link>
      </div>

      {/* Main content */}
      <div className="flex flex-col items-center max-w-2xl w-full -mt-16">
        {/* Logo */}
        <div className={`w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-6 ${mounted ? "animate-scale-in" : "opacity-0"}`}>
          <span className="text-2xl font-bold text-zinc-200">S</span>
        </div>

        <h1 className={`text-3xl md:text-4xl font-semibold text-center mb-1 ${mounted ? "animate-fade-in-up" : "opacity-0"}`}>
          Good to See You!
        </h1>
        <h2 className={`text-2xl md:text-3xl font-semibold text-center text-zinc-300 mb-3 ${mounted ? "animate-fade-in-up stagger-1" : "opacity-0"}`}>
          How Can I Assist You?
        </h2>
        <p className={`text-zinc-500 text-center mb-10 ${mounted ? "animate-fade-in-up stagger-2" : "opacity-0"}`}>
          I'm your personal AI, trained on your conversations. Ask me anything.
        </p>

        <div className={mounted ? "animate-fade-in-up stagger-3 w-full flex justify-center" : "opacity-0"}>
          <ChatInput onSubmit={() => navigate({ to: "/chat/$sessionId", params: { sessionId: "new" } })} />
        </div>

        <div className={mounted ? "animate-fade-in-up stagger-4" : "opacity-0"}>
          <SuggestionChips />
        </div>
      </div>

      <div className={mounted ? "animate-fade-in stagger-5" : "opacity-0"}>
        <AiDisclaimer />
      </div>
    </div>
  );
}
