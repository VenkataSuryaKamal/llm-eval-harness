"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, fmtDate, RunDetail } from "@/lib/api";
import { RegressionPanel } from "@/components/RegressionPanel";
import { ResultsMatrix } from "@/components/ResultsMatrix";
import { StatusBadge } from "@/components/StatusBadge";
import { SummaryCards } from "@/components/SummaryCards";
import { Help } from "@/components/Help";
import { shortLabel } from "@/lib/models";

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const runId = Number(id);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    api.models().then((ms) => setLabels(Object.fromEntries(ms.map((m) => [m.id, shortLabel(m.label)])))).catch(() => {});
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const load = async () => {
      try {
        const r = await api.run(runId);
        if (!alive) return;
        setRun(r);
        setError(null);
        if (r.status === "queued" || r.status === "running") timer = setTimeout(load, 1500);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [runId]);

  if (error) {
    const missing = !Number.isInteger(runId) || runId <= 0 || /not found|valid integer/i.test(error);
    return (
      <div className="card">
        <h1>{missing ? "Evaluation not found" : "Something went wrong"}</h1>
        <p className="muted">{missing ? "This link doesn't match a saved evaluation. It may have been deleted." : error}</p>
        <div className="cta-row"><Link className="btn primary" href="/">Go to home</Link><Link className="btn" href="/runs/new">Start a new evaluation</Link></div>
      </div>
    );
  }
  if (!run) return <p className="muted">Loading…</p>;
  const pct = run.total_calls ? Math.round((run.completed_calls / run.total_calls) * 100) : 0;
  const finished = run.status === "completed";

  return (
    <>
      <div className="row spread">
        <div>
          <h1>Evaluation #{run.id} {run.label && <span className="muted">· {run.label}</span>}</h1>
          <p className="muted">
            <StatusBadge run={run} /> · {run.cases.length} test inputs × {run.models.length} AI{run.models.length === 1 ? "" : "s"} · graded by {labels[run.judge_model] ?? run.judge_model}, pass mark {run.pass_threshold}/10 · {fmtDate(run.created_at)}
          </p>
        </div>
        <div className="row">
          <a className="btn" href={`/api/runs/${run.id}/export.csv`}>Export CSV</a>
          <Link className="btn primary" href={`/runs/new?from=${run.id}`}>Edit prompt &amp; run again</Link>
        </div>
      </div>

      {run.status !== "completed" && run.status !== "failed" && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row spread"><span>Getting answers and grading them… you can leave this page and come back.</span><span className="muted">{run.completed_calls}/{run.total_calls}</span></div>
          <div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {run.error && <div className="error">{run.error}</div>}

      <details className="card" style={{ marginBottom: 16 }}>
        <summary>Show the prompt used for this evaluation</summary>
        {run.system_prompt && <><p className="hint">System</p><pre className="out">{run.system_prompt}</pre></>}
        <pre className="out">{run.prompt_template}</pre>
        {run.judge_criteria && <><p className="hint">Grading criteria</p><pre className="out">{run.judge_criteria}</pre></>}
      </details>

      {finished && (() => {
        const list = Object.values(run.summary).filter((s) => s.avg_score !== null);
        if (!list.length) return null;
        const best = [...list].sort((a, b) => b.pass_rate - a.pass_rate || (b.avg_score ?? 0) - (a.avg_score ?? 0))[0];
        const name = labels[best.model] ?? best.model;
        return (
          <div className="verdict">
            <strong>In short:</strong> {list.length > 1 ? <><strong>{name}</strong> did best.</> : <><strong>{name}</strong>:</>}{" "}
            {best.passed} of {best.cases} answers passed, with an average grade of {best.avg_score}/10.{" "}
            {best.pass_rate >= 0.9 ? "This prompt works well." : best.pass_rate >= 0.6 ? "Good, but some answers need work. Check the failing ones below." : "Most answers missed the mark. Read the grader's reasons below, then improve the prompt."}
          </div>
        );
      })()}

      <h2>How did each AI do? <Help>One card per AI. &quot;Pass&quot; is the share of answers that scored at or above the pass mark. Badges show which was the most accurate, the fastest and the cheapest.</Help></h2>
      <SummaryCards summary={run.summary} labels={labels} />

      {finished && (
        <>
          <h2>What changed since the last version? <Help>Compares this evaluation with an earlier one on the same test inputs. &quot;Broke&quot; means an answer passed before and fails now, so check those before keeping a prompt change.</Help></h2>
          <RegressionPanel run={run} defaultBase={run.previous_run_id} labels={labels} />
        </>
      )}

      <h2>Every answer, one by one <Help>Each row is one test input, and each column is one AI. Click a grade to read the full answer, the ideal answer and the grader&apos;s reason.</Help></h2>
      <ResultsMatrix cases={run.cases} results={run.results} models={run.models} labels={labels} />
    </>
  );
}
