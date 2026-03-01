import type { ImportResult } from "../api/imports.ts";

interface ImportProgressProps {
  status: "idle" | "uploading" | "success" | "error";
  result?: ImportResult;
  error?: string;
  fileName?: string;
}

export function ImportProgress({
  status,
  result,
  error,
  fileName,
}: ImportProgressProps) {
  if (status === "idle") return null;

  return (
    <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {status === "uploading" && (
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-zinc-300 text-sm font-medium">
              Uploading {fileName}...
            </span>
          </div>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
          </div>
        </div>
      )}

      {status === "success" && result && (
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <p className="text-zinc-200 font-medium">Import Successful</p>
              <p className="text-zinc-500 text-sm">{result.file_name}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
                Messages
              </p>
              <p className="text-zinc-100 text-lg font-semibold">
                {result.message_count.toLocaleString()}
              </p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
                Source
              </p>
              <p className="text-zinc-100 text-lg font-semibold capitalize">
                {result.source}
              </p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
                Status
              </p>
              <p className="text-zinc-100 text-lg font-semibold capitalize">
                {result.status}
              </p>
            </div>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <div>
              <p className="text-zinc-200 font-medium">Import Failed</p>
              <p className="text-red-400/80 text-sm">
                {error || "Something went wrong. Please try again."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
