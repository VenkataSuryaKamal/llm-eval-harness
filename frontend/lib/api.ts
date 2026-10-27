// Typed client for the backend (always via the same-origin /api proxy).

export type Model = { id: string; provider: string; label: string; input_per_mtok: number; output_per_mtok: number; free_tier: boolean };
export type Dataset = { id: number; name: string; created_at: string; case_count: number };
export type Case = { id: number; position: number; input: string; expected: string | null; variables: Record<string, string> };
export type Result = {
  id: number; case_id: number; model: string; output: string; error: string | null; latency_ms: number;
  input_tokens: number; output_tokens: number; cost_usd: number; score: number | null; passed: boolean; judge_reasoning: string;
};
export type ModelSummary = {
  model: string; cases: number; passed: number; pass_rate: number; avg_score: number | null;
  avg_latency_ms: number; p95_latency_ms: number; total_cost_usd: number; judge_cost_usd: number; errors: number; ungraded: number;
};
export type Run = {
  id: number; dataset_id: number; label: string; prompt_template: string; system_prompt: string; models: string[];
  judge_model: string; judge_criteria: string; pass_threshold: number; status: "queued" | "running" | "completed" | "failed";
  error: string | null; total_calls: number; completed_calls: number; created_at: string; finished_at: string | null;
};
export type RunDetail = Run & { summary: Record<string, ModelSummary>; results: Result[]; cases: Case[]; previous_run_id: number | null };
export type Change = "improved" | "regressed" | "still_passing" | "still_failing";
export type CompareRow = {
  case_id: number; position: number | null; input: string; model: string; change: Change;
  base_score: number | null; head_score: number | null; score_delta: number;
  base_output: string; head_output: string; base_reasoning: string; head_reasoning: string;
};
export type Comparison = {
  base_run_id: number; head_run_id: number; models_compared: string[]; headline: string;
  totals: Record<Change, number>; skipped: number; rows: CompareRow[];
};
export type PublicConfig = { demo_mode?: boolean; judge_model: string | null; judge_options: string[]; providers: string[]; max_models_per_run: number; max_calls_per_run: number; max_cases_per_dataset: number; max_upload_bytes: number };

export type PlaygroundResult = {
  model: string; label: string; provider: string; free_tier: boolean; output: string; error: string | null;
  latency_ms: number; input_tokens: number; output_tokens: number; cost_usd: number;
  score: number | null; judge_reasoning: string; judge_cost_usd: number;
};
export type PlaygroundResponse = { rendered_prompt: string; judge_model: string | null; results: PlaygroundResult[] };
export type DatasetDetail = Dataset & { cases: Case[] };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path}`, { cache: "no-store", ...init });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") msg = data.detail;
      else if (Array.isArray(data.detail)) msg = data.detail.map((d: { loc?: string[]; msg: string }) => `${d.loc?.slice(-1)[0] ?? ""}: ${d.msg}`).join("; ");
    } catch { /* not JSON */ }
    throw new ApiError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  models: () => request<Model[]>("models"),
  config: () => request<PublicConfig>("config"),
  datasets: () => request<Dataset[]>("datasets"),
  dataset: (id: number) => request<DatasetDetail>(`datasets/${id}`),
  playground: (body: Record<string, unknown>) =>
    request<PlaygroundResponse>("playground", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  uploadDataset: (form: FormData) => request<Dataset>("datasets", { method: "POST", body: form }),
  deleteDataset: (id: number) => request<void>(`datasets/${id}`, { method: "DELETE" }),
  runs: (datasetId?: number) => request<Run[]>(`runs${datasetId ? `?dataset_id=${datasetId}` : ""}`),
  run: (id: number) => request<RunDetail>(`runs/${id}`),
  createRun: (body: Record<string, unknown>) =>
    request<Run>("runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  compare: (id: number, base?: number) => request<Comparison>(`runs/${id}/compare${base ? `?base=${base}` : ""}`),
  deleteRun: (id: number) => request<void>(`runs/${id}`, { method: "DELETE" }),
};

export const fmtCost = (usd: number) =>
  usd === 0 ? "$0" : usd < 0.00001 ? "<$0.00001" : usd < 0.01 ? `$${usd.toFixed(5)}` : `$${usd.toFixed(3)}`;
export const fmtPct = (x: number) => `${Math.round(x * 100)}%`;
export const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
export const fmtDate = (iso: string) => new Date(iso).toLocaleString();
