"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Change, Comparison, Run } from "@/lib/api";

const LABEL: Record<Change, string> = {
  regressed: "Got worse (passed before, fails now)",
  improved: "Got better (failed before, passes now)",
  still_failing: "Still failing",
  still_passing: "Still passing",
};

/** "This change improved 8 cases but broke 3 — here they are." */
export function RegressionPanel({ run, defaultBase, labels = {} }: { run: Run; defaultBase: number | null; labels?: Record<string, string> }) {
  const [candidates, setCandidates] = useState<Run[]>([]);
  const [base, setBase] = useState<number | null>(defaultBase);
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<Change>("regressed");

  useEffect(() => {
    api.runs(run.dataset_id).then((rs) => setCandidates(rs.filter((r) => r.id !== run.id && r.status === "completed"))).catch(() => {});
  }, [run.dataset_id, run.id]);

  useEffect(() => {
    if (!base) return;
    setError(null);
    api.compare(run.id, base).then(setData).catch((e) => setError((e as Error).message));
  }, [run.id, base]);

  if (!candidates.length && !defaultBase) {
    return (
      <div className="card">
        <p>This is your first evaluation on these test inputs, so there&apos;s nothing to compare with yet.</p>
        <p className="muted">Next step: edit your prompt and run it again on the same inputs. This section will then show exactly which answers got better and which got worse.</p>
        <Link className="btn primary" href={`/runs/new?from=${run.id}`}>Edit prompt &amp; run again</Link>
      </div>
    );
  }

  const rows = data?.rows.filter((r) => r.change === show) ?? [];
  return (
    <div className="card">
      <div className="row spread">
        <div className="row">
          <span>Compare with evaluation</span>
          <select style={{ width: "auto" }} value={base ?? ""} onChange={(e) => setBase(Number(e.target.value))}>
            {!base && <option value="">choose a run</option>}
            {candidates.map((c) => <option key={c.id} value={c.id}>#{c.id} {c.label}</option>)}
          </select>
        </div>
        <Link className="btn" href={`/runs/new?from=${run.id}`}>Edit prompt &amp; run again</Link>
      </div>
      {error && <div className="error">{error}</div>}
      {data && (
        <>
          <h2 style={{ marginTop: 16 }}>{data.headline}</h2>
          <p className="hint">Each test input is compared for each AI that was in both evaluations: {data.models_compared.map((m) => labels[m] ?? m).join(", ") || "none"}.</p>
          <div className="tabs">
            {(Object.keys(LABEL) as Change[]).map((k) => (
              <button key={k} className={show === k ? "on" : ""} onClick={() => setShow(k)}>
                {LABEL[k]} ({data.totals[k]})
              </button>
            ))}
          </div>
          {rows.length === 0 ? <p className="muted">No cases in this group.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Model</th><th>Input</th><th>Before (#{data.base_run_id})</th><th>After (#{data.head_run_id})</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.case_id}:${r.model}`}>
                      <td className="num">{r.position}</td>
                      <td>{labels[r.model] ?? r.model}</td>
                      <td className="clip">{r.input}</td>
                      <td className="clip"><span className="badge">{r.base_score ?? "–"}/10</span><pre className="out">{r.base_output}</pre><span className="hint">{r.base_reasoning}</span></td>
                      <td className="clip"><span className={`badge ${r.score_delta < 0 ? "bad" : r.score_delta > 0 ? "good" : ""}`}>{r.head_score ?? "–"}/10</span><pre className="out">{r.head_output}</pre><span className="hint">{r.head_reasoning}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
