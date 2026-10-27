"use client";

import { fmtCost, Model } from "@/lib/api";
import { PROVIDER_NAMES, shortLabel } from "@/lib/models";

type Props = { models: Model[]; selected: string[]; onChange: React.Dispatch<React.SetStateAction<string[]>>; max: number };

export function ModelPicker({ models, selected, onChange, max }: Props) {
  const groups = models.reduce<Record<string, Model[]>>((acc, m) => ((acc[m.provider] ??= []).push(m), acc), {});
  // Functional update: fast consecutive clicks each see the latest selection.
  const toggle = (id: string) =>
    onChange((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < max ? [...cur, id] : cur));
  const free = models.filter((m) => m.free_tier && m.provider !== "ollama").map((m) => m.id);

  if (!models.length) {
    return <p className="muted">No models are available. Add an API key to the backend settings file (free Gemini and Groq keys work) and restart the backend.</p>;
  }
  return (
    <div>
      <div className="row" style={{ marginBottom: 10, gap: 8 }}>
        {free.length > 0 && <button type="button" className="small" onClick={() => onChange(free.slice(0, Math.min(3, max)))}>Pick free models</button>}
        {selected.length > 0 && <button type="button" className="small" onClick={() => onChange([])}>Clear</button>}
        <span className="hint">{selected.length} selected · up to {max}</span>
      </div>
      {Object.entries(groups).map(([provider, ms]) => (
        <div key={provider} className="picker-group">
          <div className="picker-title">{PROVIDER_NAMES[provider] ?? provider}</div>
          <div className="chips">
            {ms.map((m) => {
              const on = selected.includes(m.id);
              const full = !on && selected.length >= max;
              return (
                <button type="button" key={m.id} className={`chip ${on ? "on" : ""}`} aria-pressed={on} disabled={full}
                  title={full ? `You can pick up to ${max} models` : m.id} onClick={() => toggle(m.id)}>
                  <span className="chip-check" aria-hidden>{on ? "✓" : "+"}</span>
                  {shortLabel(m.label)}
                  <span className={`chip-meta ${m.free_tier ? "free" : ""}`}>
                    {m.free_tier ? "free" : m.provider === "mock" ? "demo" : `${fmtCost(m.input_per_mtok)}/${fmtCost(m.output_per_mtok)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="hint">Paid prices are per 1 million tokens (input/output). Ollama models run on your computer and can be slow.</p>
    </div>
  );
}
