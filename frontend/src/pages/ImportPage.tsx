import { useState } from "react";
import { FileDropZone } from "../components/FileDropZone.tsx";
import { ImportProgress } from "../components/ImportProgress.tsx";
import { useMultiImportUpload, usePathImport, useConversations } from "../api/imports.ts";
import type { Source } from "../api/imports.ts";

const SOURCES: { id: Source; label: string; icon: React.ReactNode }[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    id: "imessage",
    label: "iMessage",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M8.235 1.559a.75.75 0 00-.53 0C3.413 3.063 0 7.085 0 12c0 2.98 1.255 5.672 3.265 7.57l-.58 2.598a1.24 1.24 0 001.752 1.396l3.042-1.39A11.923 11.923 0 0012 23.5c5.523 0 10-4.477 10-10S17.523 3.5 12 3.5c-1.327 0-2.593.258-3.765.724V1.559z" />
      </svg>
    ),
  },
  {
    id: "discord",
    label: "Discord",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
      </svg>
    ),
  },
  {
    id: "email",
    label: "Email",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    ),
  },
];

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  imessage: "iMessage",
  discord: "Discord",
  email: "Email",
};

type ImportMode = "upload" | "path";

export function ImportPage() {
  const [importMode, setImportMode] = useState<ImportMode>("upload");
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [serverPath, setServerPath] = useState("");
  const { state: multiState, upload, reset: resetMulti } = useMultiImportUpload();
  const pathImport = usePathImport();
  const conversations = useConversations();

  const handleFilesDrop = (files: File[]) => {
    // If a previous import finished, auto-reset so new files aren't silently ignored
    if (!multiState.isUploading && multiState.totalFiles > 0) {
      resetMulti();
    }
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const handleSourceSelect = (source: Source) => {
    setSelectedSource(source);
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0 && selectedSource) {
      upload(selectedFiles, selectedSource);
    }
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setSelectedSource(null);
    resetMulti();
  };

  const handlePathImport = () => {
    if (serverPath.trim() && selectedSource) {
      pathImport.mutate({ path: serverPath.trim(), source: selectedSource });
    }
  };

  const handlePathReset = () => {
    setServerPath("");
    setSelectedSource(null);
    pathImport.reset();
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const isDone = !multiState.isUploading && multiState.totalFiles > 0;
  const isIdle = multiState.totalFiles === 0;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8 animate-fade-in-up">
        <h1 className="text-2xl font-bold text-zinc-100">Import Chats</h1>
        <p className="text-zinc-500 mt-1">
          Upload your conversation exports to train your personal AI.
        </p>
      </div>

      <div className="mb-6 animate-fade-in-up stagger-1">
        <label className="block text-sm font-medium text-zinc-400 mb-3">
          Select source
        </label>
        <div className="flex flex-wrap gap-2">
          {SOURCES.map((source) => (
            <button
              key={source.id}
              onClick={() => handleSourceSelect(source.id)}
              disabled={multiState.isUploading || pathImport.isPending}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-200 active:scale-95
                ${
                  selectedSource === source.id
                    ? "bg-zinc-100 text-zinc-900"
                    : "bg-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }
                ${multiState.isUploading || pathImport.isPending ? "opacity-50 cursor-not-allowed" : ""}
              `}
            >
              {source.icon}
              {source.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 animate-fade-in-up stagger-2">
        <div className="flex rounded-lg bg-zinc-800/50 p-1">
          <button
            onClick={() => setImportMode("upload")}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              importMode === "upload"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Upload Files
          </button>
          <button
            onClick={() => setImportMode("path")}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              importMode === "path"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Server Path
          </button>
        </div>
      </div>

      {importMode === "upload" ? (
        <div className="animate-fade-in-up">
          <FileDropZone
            onFilesDrop={handleFilesDrop}
            disabled={multiState.isUploading}
          />
        </div>
      ) : (
        <div className="animate-fade-in-up space-y-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              File or directory path on the server
            </label>
            <input
              type="text"
              value={serverPath}
              onChange={(e) => setServerPath(e.target.value)}
              placeholder="/root/data/whatsapp_chats/"
              disabled={pathImport.isPending}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 disabled:opacity-50"
            />
            <p className="text-xs text-zinc-500 mt-2">
              Enter the path to a file or directory on the server. Useful for remote training setups where data was copied via SCP.
            </p>
          </div>

          {pathImport.error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              {pathImport.error.message}
            </div>
          )}

          {pathImport.data && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-zinc-200">
                  Imported {pathImport.data.imported.length} file{pathImport.data.imported.length !== 1 ? "s" : ""} — {pathImport.data.total_messages.toLocaleString()} messages
                </span>
              </div>
              {pathImport.data.imported.map((f) => (
                <div key={f.import_id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400 font-mono truncate">{f.file_name}</span>
                  <span className="text-zinc-500 shrink-0 ml-2">{f.message_count.toLocaleString()} msgs</span>
                </div>
              ))}
              {pathImport.data.errors.map((e, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400 font-mono truncate">{e.file}</span>
                  <span className="text-red-400 shrink-0 ml-2">{e.error}</span>
                </div>
              ))}
            </div>
          )}

          {!pathImport.data ? (
            <button
              onClick={handlePathImport}
              disabled={!serverPath.trim() || !selectedSource || pathImport.isPending}
              className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pathImport.isPending ? "Importing..." : !selectedSource ? "Select a source first" : "Import from Path"}
            </button>
          ) : (
            <button
              onClick={handlePathReset}
              className="w-full py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Import More Files
            </button>
          )}
        </div>
      )}

      {importMode === "upload" && selectedFiles.length > 0 && isIdle && (
        <div className="mt-4 space-y-2">
          {selectedFiles.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 rounded-lg p-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-zinc-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-zinc-300 text-sm font-medium">
                    {file.name}
                  </p>
                  <p className="text-zinc-600 text-xs">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRemoveFile(i)}
                className="text-zinc-600 hover:text-zinc-400 transition-colors p-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between pt-2">
            <span className="text-zinc-500 text-sm">
              {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected
            </span>
            {selectedSource ? (
              <button
                onClick={handleUpload}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Upload {selectedFiles.length > 1 ? `${selectedFiles.length} Files` : ""}
              </button>
            ) : (
              <span className="text-zinc-500 text-sm">Select a source first</span>
            )}
          </div>
        </div>
      )}

      <ImportProgress state={multiState} />

      {isDone && (
        <button
          onClick={handleReset}
          className="mt-4 w-full py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          Import More Files
        </button>
      )}

      {conversations.data && conversations.data.length > 0 && (
        <div className="mt-8 animate-fade-in-up">
          <h2 className="text-lg font-semibold text-zinc-200 mb-3">Import History</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800/50">
            {conversations.data.map((convo) => (
              <div key={convo.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                  {SOURCE_LABELS[convo.source] ?? convo.source}
                </span>
                <span className="text-sm text-zinc-300 truncate">{convo.file_name}</span>
                <span className="text-xs text-zinc-500 ml-auto shrink-0">
                  {convo.message_count.toLocaleString()} msgs
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
