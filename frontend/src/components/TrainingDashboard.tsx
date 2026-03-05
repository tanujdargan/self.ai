import type { TrainingEvent } from "../api/training";

interface TrainingDashboardProps {
  events: TrainingEvent[];
  connected: boolean;
  onCancel: () => void;
}

export function TrainingDashboard({ events, connected, onCancel }: TrainingDashboardProps) {
  const metricsEvents = events.filter(
    (e): e is Extract<TrainingEvent, { event: "metrics" }> => e.event === "metrics"
  );
  const latestMetrics = metricsEvents.length > 0 ? metricsEvents[metricsEvents.length - 1] : null;
  const latestStatus = [...events].reverse().find((e) => e.event === "progress" || e.event === "start");
  const isComplete = events.some((e) => e.event === "complete");
  const errorEvent = events.find(
    (e): e is Extract<TrainingEvent, { event: "error" }> => e.event === "error"
  );
  const finishedEvent = events.find(
    (e): e is Extract<TrainingEvent, { event: "finished" }> => e.event === "finished"
  );

  const progress = latestMetrics
    ? latestMetrics.percent ?? (latestMetrics.total_steps > 0
      ? Math.round((latestMetrics.step / latestMetrics.total_steps) * 100)
      : 0)
    : (latestStatus && "percent" in latestStatus ? (latestStatus.percent ?? 0) : 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium text-zinc-200">Training Progress</h3>
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${
              isComplete
                ? "bg-emerald-500/10 text-emerald-400"
                : (errorEvent || (finishedEvent && finishedEvent.return_code !== 0))
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
                  : (errorEvent || (finishedEvent && finishedEvent.return_code !== 0))
                    ? "bg-red-400"
                    : connected
                      ? "bg-blue-400 animate-pulse"
                      : "bg-zinc-500"
              }`}
            />
            {isComplete ? "Complete" : (errorEvent || (finishedEvent && finishedEvent.return_code !== 0)) ? "Error" : connected ? "Training" : "Connecting"}
          </span>
        </div>
        {!isComplete && !errorEvent && !(finishedEvent && finishedEvent.return_code !== 0) && (
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

      {finishedEvent && finishedEvent.return_code !== 0 && !errorEvent && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300 space-y-1">
          <div>Worker crashed (exit code {finishedEvent.return_code})</div>
          {finishedEvent.stderr && (
            <pre className="text-xs text-red-400/80 whitespace-pre-wrap font-mono mt-1">{finishedEvent.stderr}</pre>
          )}
        </div>
      )}

      <div>
        <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
          <span>
            {latestMetrics
              ? `Step ${latestMetrics.step} / ${latestMetrics.total_steps}`
              : latestStatus && "message" in latestStatus
                ? latestStatus.message
                : "Waiting for data..."}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isComplete ? "bg-emerald-500" : (errorEvent || (finishedEvent && finishedEvent.return_code !== 0)) ? "bg-red-500" : "bg-blue-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {latestMetrics && (
        <div className="grid grid-cols-4 gap-4">
          <Stat label="Epoch" value={latestMetrics.epoch?.toFixed(2) ?? "-"} />
          <Stat label="Step" value={`${latestMetrics.step}`} />
          <Stat label="Loss" value={latestMetrics.loss?.toFixed(4) ?? "-"} />
          <Stat label="Learning Rate" value={latestMetrics.learning_rate?.toExponential(2) ?? "-"} />
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
