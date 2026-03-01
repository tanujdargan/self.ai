import type { TrainingEvent } from "../api/training";

interface TrainingDashboardProps {
  events: TrainingEvent[];
  connected: boolean;
  onCancel: () => void;
}

export function TrainingDashboard({ events, connected, onCancel }: TrainingDashboardProps) {
  const progressEvents = events.filter(
    (e): e is Extract<TrainingEvent, { event: "progress" }> => e.event === "progress"
  );
  const latest = progressEvents.length > 0 ? progressEvents[progressEvents.length - 1] : null;
  const isComplete = events.some((e) => e.event === "complete");
  const errorEvent = events.find(
    (e): e is Extract<TrainingEvent, { event: "error" }> => e.event === "error"
  );

  const progress = latest && latest.total_steps > 0
    ? Math.round((latest.step / latest.total_steps) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium text-zinc-200">Training Progress</h3>
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${
              isComplete
                ? "bg-emerald-500/10 text-emerald-400"
                : errorEvent
                  ? "bg-red-500/10 text-red-400"
                  : connected
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-zinc-700/50 text-zinc-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isComplete
                  ? "bg-emerald-400"
                  : errorEvent
                    ? "bg-red-400"
                    : connected
                      ? "bg-blue-400 animate-pulse"
                      : "bg-zinc-500"
              }`}
            />
            {isComplete ? "Complete" : errorEvent ? "Error" : connected ? "Training" : "Connecting"}
          </span>
        </div>
        {!isComplete && !errorEvent && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {errorEvent && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          {errorEvent.message}
        </div>
      )}

      <div>
        <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
          <span>
            {latest ? `Step ${latest.step} / ${latest.total_steps}` : "Waiting for data..."}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isComplete ? "bg-emerald-500" : errorEvent ? "bg-red-500" : "bg-blue-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {latest && (
        <div className="grid grid-cols-4 gap-4">
          <Stat label="Epoch" value={latest.epoch.toFixed(2)} />
          <Stat label="Step" value={`${latest.step}`} />
          <Stat label="Loss" value={latest.loss.toFixed(4)} />
          <Stat label="Learning Rate" value={latest.learning_rate.toExponential(2)} />
        </div>
      )}

      {isComplete && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300">
          Training complete! Your model is ready.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-800">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-sm font-mono text-zinc-200">{value}</div>
    </div>
  );
}
