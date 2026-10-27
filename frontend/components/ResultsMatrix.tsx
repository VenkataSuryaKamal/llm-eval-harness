"use client";

import { Fragment, useMemo, useState } from "react";
import { Case, fmtCost, Result } from "@/lib/api";

function ScoreBadge({ r }: { r?: Result }) {
  if (!r) return <span className="muted">…</span>;
  if (r.score === null) return <span className="badge warn" title="The model or judge call failed">not graded</span>;
  return <span className={`badge ${r.passed ? "good" : "bad"}`}>{r.score}/10{r.error ? " ⚠" : ""}</span>;
}

/** Rows = test cases, columns = models. Click a cell to read the output and the judge's reasoning. */
export function ResultsMatrix({ cases, results, models, labels = {} }: { cases: Case[]; results: Result[]; models: string[]; labels?: Record<string, string> }) {
  const [filter, setFilter] = useState<"all" | "failing" | "disagree">("all");
  const [open, setOpen] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(results.map((r) => [`${r.case_id}:${r.model}`, r])), [results]);

  const visible = cases.filter((c) => {
    const rs = models.map((m) => byKey.get(`${c.id}:${m}`)).filter(Boolean) as Result[];
    if (filter === "failing") return rs.some((r) => !r.passed);
    if (filter === "disagree") return rs.some((r) => r.passed) && rs.some((r) => !r.passed);
    return true;
  });

  return (
    <>
      <div className="tabs">
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All answers ({cases.length} inputs)</button>
        <button className={filter === "failing" ? "on" : ""} onClick={() => setFilter("failing")}>Inputs with a failed answer</button>
        {models.length > 1 && <button className={filter === "disagree" ? "on" : ""} onClick={() => setFilter("disagree")}>AIs disagree</button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>#</th><th>Input</th>{models.map((m) => <th key={m} title={m}>{labels[m] ?? m}</th>)}</tr>
          </thead>
          <tbody>
            {visible.map((c) => {
              const openModel = open?.startsWith(`${c.id}:`) ? open.split(":").slice(1).join(":") : null;
              const r = openModel ? byKey.get(`${c.id}:${openModel}`) : undefined;
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td className="num">{c.position}</td>
                    <td className="clip">{c.input}</td>
                    {models.map((m) => (
                      <td key={m} className="cell" onClick={() => setOpen(open === `${c.id}:${m}` ? null : `${c.id}:${m}`)}>
                        <ScoreBadge r={byKey.get(`${c.id}:${m}`)} />
                      </td>
                    ))}
                  </tr>
                  {r && (
                    <tr>
                      <td></td>
                      <td colSpan={models.length + 1}>
                        <strong>{labels[r.model] ?? r.model}</strong> <span className="hint">· {r.latency_ms} ms · {r.input_tokens}+{r.output_tokens} tokens · {fmtCost(r.cost_usd)}</span>
                        {r.error && <div className="error">{r.error}</div>}
                        {/* Model output is rendered as plain text (React escapes it), never as HTML. */}
                        <pre className="out">{r.output || "(empty)"}</pre>
                        {c.expected && <><span className="hint">Ideal answer</span><pre className="out">{c.expected}</pre></>}
                        <span className="hint">Why this grade</span><pre className="out">{r.judge_reasoning}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
