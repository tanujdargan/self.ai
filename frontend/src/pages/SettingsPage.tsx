import { useState } from "react";
import { useHardware, useStorageStats, useDeleteAllData, useHfToken, useSaveHfToken, useDeleteHfToken } from "../api/models";

export function SettingsPage() {
  const { data: hardware, isLoading: hwLoading } = useHardware();
  const { data: stats, isLoading: statsLoading } = useStorageStats();
  const deleteAll = useDeleteAllData();
  const hfToken = useHfToken();
  const saveHfToken = useSaveHfToken();
  const deleteHfToken = useDeleteHfToken();
  const [tokenInput, setTokenInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const apiEndpoint = "http://127.0.0.1:8420";

  function handleCopy() {
    navigator.clipboard.writeText(apiEndpoint).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDeleteAll() {
    deleteAll.mutate(undefined, {
      onSuccess: () => setShowDeleteConfirm(false),
    });
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-zinc-500 text-sm mb-8">System info and data management.</p>
      </div>

      <div className="space-y-6">
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-fade-in-up stagger-1">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">API Endpoint</h2>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-200 text-sm font-mono">
              {apiEndpoint}
            </code>
            <button
              onClick={handleCopy}
              className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm font-medium transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </section>

        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-fade-in-up stagger-2">
          <h2 className="text-sm font-medium text-zinc-400 mb-2">HuggingFace Token</h2>
          <p className="text-xs text-zinc-500 mb-3">
            Required to download gated models like Llama. Get yours at{" "}
            <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
              huggingface.co/settings/tokens
            </a>
          </p>
          {hfToken.data?.has_token ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-200 text-sm font-mono">
                {hfToken.data.masked}
              </code>
              <button
                onClick={() => deleteHfToken.mutate()}
                disabled={deleteHfToken.isPending}
                className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-medium transition-colors"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="hf_..."
                className="flex-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm font-mono placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
              />
              <button
                onClick={() => {
                  if (tokenInput.trim()) {
                    saveHfToken.mutate(tokenInput.trim(), { onSuccess: () => setTokenInput("") });
                  }
                }}
                disabled={!tokenInput.trim() || saveHfToken.isPending}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveHfToken.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </section>

        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-fade-in-up stagger-3">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Hardware</h2>
          {hwLoading && <p className="text-zinc-500 text-sm">Loading...</p>}
          {hardware && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="GPU" value={hardware.gpu_name || hardware.gpu_type} />
              <InfoRow label="VRAM" value={`${hardware.vram_gb} GB`} />
              <InfoRow label="RAM" value={`${hardware.ram_gb} GB`} />
              <InfoRow label="CUDA" value={hardware.cuda_version || "N/A"} />
              <InfoRow label="OS" value={hardware.os} />
              <InfoRow label="Arch" value={hardware.arch} />
            </div>
          )}
        </section>

        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-fade-in-up stagger-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Storage</h2>
          {statsLoading && <p className="text-zinc-500 text-sm">Loading...</p>}
          {stats && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="Imports" value={`${stats.storage.imports_mb.toFixed(1)} MB`} />
                <InfoRow label="Parsed" value={`${stats.storage.parsed_mb.toFixed(1)} MB`} />
                <InfoRow label="Models" value={`${stats.storage.models_mb.toFixed(1)} MB`} />
                <InfoRow label="Total" value={`${stats.storage.total_mb.toFixed(1)} MB`} />
              </div>
              <div className="text-sm text-zinc-500 pt-1">
                {stats.conversations} conversations, {stats.total_messages.toLocaleString()} messages
              </div>
            </div>
          )}
        </section>

        <section className="bg-zinc-900 border border-red-500/20 rounded-xl p-5 animate-fade-in-up stagger-5">
          <h2 className="text-sm font-medium text-red-400 mb-2">Danger Zone</h2>
          <p className="text-zinc-500 text-sm mb-4">
            Permanently delete all imported data, conversations, and trained models. This cannot be undone.
          </p>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 text-sm font-medium transition-colors"
            >
              Delete All Data
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteAll}
                disabled={deleteAll.isPending}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteAll.isPending ? "Deleting..." : "Yes, Delete Everything"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-zinc-500 text-xs">{label}</span>
      <span className="text-zinc-200">{value}</span>
    </div>
  );
}
