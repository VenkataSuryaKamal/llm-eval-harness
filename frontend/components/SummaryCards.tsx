import { fmtCost, fmtMs, fmtPct, ModelSummary } from "@/lib/api";

/** One report card per model, with "best at" badges. */
export function SummaryCards({ summary, labels = {} }: { summary: Record<string, ModelSummary>; labels?: Record<string, string> }) {
  const list = Object.values(summary);
  if (!list.length) return null;
  const best = (pick: (s: ModelSummary) => number, low = false) => {
    const sorted = [...list].sort((a, b) => (low ? pick(a) - pick(b) : pick(b) - pick(a)));
    return list.length > 1 ? sorted[0].model : null;
  };
  const accurate = best((s) => s.avg_score ?? 0);
  const fastest = best((s) => s.avg_latency_ms, true);
  const cheapest = best((s) => s.total_cost_usd, true);

  return (
    <div className="grid">
      {list.map((s) => (
        <div className="card" key={s.model}>
          <div className="row spread"><strong title={s.model}>{labels[s.model] ?? s.model}</strong></div>
          <div className="row" style={{ gap: 6, margin: "6px 0 10px", minHeight: 22 }}>
            {s.model === accurate && <span className="badge good">Most accurate</span>}
            {s.model === fastest && <span className="badge">Fastest</span>}
            {s.model === cheapest && <span className="badge">Cheapest</span>}
          </div>
          <div className="stat">{fmtPct(s.pass_rate)} <span className="hint">passed ({s.passed} of {s.cases})</span></div>
          <dl className="kv">
            <dt>Average grade</dt><dd>{s.avg_score ?? "–"} / 10</dd>
            <dt>Average time</dt><dd>{fmtMs(s.avg_latency_ms)}</dd>
            <dt title="95% of answers were faster than this">Slowest answers</dt><dd>{fmtMs(s.p95_latency_ms)}</dd>
            <dt>Cost of answers</dt><dd>{fmtCost(s.total_cost_usd)}</dd>
            <dt>Cost of grading</dt><dd>{fmtCost(s.judge_cost_usd)}</dd>
            <dt>Failed calls</dt><dd>{s.errors}</dd>
            {s.ungraded > 0 && <><dt>Not graded</dt><dd>{s.ungraded}</dd></>}
          </dl>
        </div>
      ))}
    </div>
  );
}
