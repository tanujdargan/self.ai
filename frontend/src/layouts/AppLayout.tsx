import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "../components/Sidebar";
import { ListPanel } from "../components/ListPanel";

export function AppLayout() {
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <div className="animate-slide-in-left">
        <Sidebar />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="animate-slide-in-left stagger-1">
          <ListPanel />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="page-enter">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
