import type { MultiImportState } from "../api/imports.ts";

interface ImportProgressProps {
  state: MultiImportState;
}

export function ImportProgress({ state }: ImportProgressProps) {
  if (state.totalFiles === 0) return null;

  const isDone = !state.isUploading;
  const hasErrors = state.errorCount > 0;
  const successCount = state.files.filter((f) => f.status === "done").length;

  return (
    <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {state.isUploading && (
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-zinc-300 text-sm font-medium">
              Uploading file {state.currentIndex + 1} of {state.totalFiles}...
            </span>
          </div>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{
                width: `${((state.currentIndex) / state.totalFiles) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {state.isUploading && state.files.length > 1 && (
        <div className="px-5 pb-4 space-y-1.5">
          {state.files.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {entry.status === "done" && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {entry.status === "uploading" && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
              )}
              {entry.status === "pending" && (
                <div className="w-4 h-4 rounded-full border border-zinc-700 shrink-0" />
              )}
              {entry.status === "error" && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className={entry.status === "pending" ? "text-zinc-600" : "text-zinc-400"}>
                {entry.file.name}
              </span>
              {entry.result && (
                <span className="text-zinc-600 text-xs ml-auto">
                  {entry.result.message_count.toLocaleString()} messages
                </span>
              )}
              {entry.error && (
                <span className="text-red-400/80 text-xs ml-auto truncate max-w-48">
                  {entry.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {isDone && (
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${hasErrors ? "bg-amber-500/20" : "bg-emerald-500/20"}`}>
              {hasErrors ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-zinc-200 font-medium">
                {hasErrors ? "Import Completed with Errors" : "Import Successful"}
              </p>
              <p className="text-zinc-500 text-sm">
                {successCount} of {state.totalFiles} file{state.totalFiles !== 1 ? "s" : ""} imported
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
                Messages
              </p>
              <p className="text-zinc-100 text-lg font-semibold">
                {state.totalMessages.toLocaleString()}
              </p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
                Files
              </p>
              <p className="text-zinc-100 text-lg font-semibold">
                {successCount}
              </p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
                Errors
              </p>
              <p className={`text-lg font-semibold ${state.errorCount > 0 ? "text-red-400" : "text-zinc-100"}`}>
                {state.errorCount}
              </p>
            </div>
          </div>

          {state.files.length > 1 && (
            <div className="space-y-1.5">
              {state.files.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {entry.status === "done" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className="text-zinc-400">{entry.file.name}</span>
                  {entry.result && (
                    <span className="text-zinc-600 text-xs ml-auto">
                      {entry.result.message_count.toLocaleString()} messages
                    </span>
                  )}
                  {entry.error && (
                    <span className="text-red-400/80 text-xs ml-auto truncate max-w-48">
                      {entry.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
