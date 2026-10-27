import { Model } from "./api";

export const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic · Claude",
  openai: "OpenAI · GPT",
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  ollama: "Ollama · on this computer",
  mock: "Offline demo models",
};

/** A sensible starting selection: real free models first, then any real model, then demos. */
export function defaultPick(models: Model[], n = 2): string[] {
  const real = models.filter((m) => m.provider !== "mock" && m.provider !== "ollama");
  const free = real.filter((m) => m.free_tier);
  const pool = free.length ? free : real.length ? real : models;
  // Prefer one model per provider, so the comparison is interesting.
  const picked: Model[] = [];
  for (const m of pool) if (!picked.some((p) => p.provider === m.provider)) picked.push(m);
  for (const m of pool) if (picked.length < n && !picked.includes(m)) picked.push(m);
  return picked.slice(0, n).map((m) => m.id);
}

export const shortLabel = (label: string) => label.replace(/\s*\((free tier|free)\)\s*$/i, "");
