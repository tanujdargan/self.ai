import { useState } from "react";
import type { Model } from "../api/models";
import { useLoadModel, useUnloadModel, useDeleteModel } from "../api/models";

export function ModelCard({ model }: { model: Model }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const loadModel = useLoadModel();
  const unloadModel = useUnloadModel();
  const deleteModel = useDeleteModel();

  const isToggling = loadModel.isPending || unloadModel.isPending;

  function handleToggleLoad() {
    if (model.is_loaded) {
      unloadModel.mutate(model.id);
    } else {
      loadModel.mutate(model.id);
    }
  }

  function handleExport() {
    window.open(`/api/models/${model.id}/export`, "_blank");
  }

  function handleDelete() {
    deleteModel.mutate(model.id, {
      onSuccess: () => setShowDeleteConfirm(false),
    });
  }

  const createdDate = new Date(model.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 hover:border-zinc-700 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-zinc-100 truncate">{model.name}</h3>
          <p className="text-sm text-zinc-500 mt-0.5">{model.base_model}</p>
        </div>
        <span
          className={`shrink-0 ml-3 px-2.5 py-0.5 rounded-full text-xs font-medium ${
            model.mode === "style"
              ? "bg-violet-500/15 text-violet-400"
              : "bg-blue-500/15 text-blue-400"
          }`}
        >
          {model.mode}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm text-zinc-400">
        <span className="flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {createdDate}
        </span>
        {model.is_loaded && (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Loaded
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleToggleLoad}
          disabled={isToggling}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
            model.is_loaded
              ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          {isToggling ? "..." : model.is_loaded ? "Unload" : "Load"}
        </button>

        {model.gguf_path && (
          <button
            onClick={handleExport}
            className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm font-medium transition-colors"
            title="Export GGUF"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        )}

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-red-500/15 hover:text-red-400 text-sm font-medium transition-colors"
            title="Delete model"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              disabled={deleteModel.isPending}
              className="px-3 py-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {deleteModel.isPending ? "..." : "Confirm"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
