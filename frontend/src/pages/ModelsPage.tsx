import { useModels } from "../api/models";
import { ModelCard } from "../components/ModelCard";

export function ModelsPage() {
  const { data: models, isLoading, error } = useModels();

  return (
    <div className="p-6 max-w-4xl">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold mb-1">Models</h1>
        <p className="text-zinc-500 text-sm mb-6">Your fine-tuned models, ready to load and chat with.</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          Loading models...
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm">
          Failed to load models. Make sure the backend is running.
        </div>
      )}

      {models && models.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up stagger-1">
          <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-zinc-300 mb-1">No models yet</h3>
          <p className="text-zinc-500 text-sm max-w-xs">
            Import your chat data and start a training run to create your first personal model.
          </p>
        </div>
      )}

      {models && models.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {models.map((model, i) => (
            <div key={model.id} className={`animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}>
              <ModelCard model={model} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
