"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { api, Dataset, DatasetDetail, fmtCost, Model, PublicConfig } from "@/lib/api";
import { Help } from "@/components/Help";
import { ModelPicker } from "@/components/ModelPicker";
import { defaultPick } from "@/lib/models";
import { readJSON, removeKey } from "@/lib/storage";

const DEFAULT_PROMPT = "Summarize this customer complaint in one sentence.\n\nComplaint:\n{{input}}";
const SAMPLE_NAME = "Sample: customer complaints";
type Mode = "saved" | "upload" | "paste";
type Handoff = { prompt: string; system: string; models: string[]; criteria: string; pasted: string };

function Step({ n, title, hint, help, children }: { n: number; title: string; hint?: string; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card step">
      <div className="step-head"><span className="n">{n}</span><h2>{title}{help && <Help>{help}</Help>}</h2>{hint && <span className="hint">{hint}</span>}</div>
      {children}
    </section>
  );
}

function Preview({ ds }: { ds: DatasetDetail }) {
  const withExpected = ds.cases.filter((c) => c.expected).length;
  return (
    <div className="preview">
      <div className="ok">✓ <strong>{ds.name}</strong>: {ds.cases.length} test case{ds.cases.length === 1 ? "" : "s"}
        {withExpected > 0 ? `, ${withExpected} with an ideal answer` : ". No ideal answers, so grading uses your criteria only"}.</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Input</th><th>Ideal answer</th></tr></thead>
          <tbody>
            {ds.cases.slice(0, 3).map((c) => (
              <tr key={c.id}><td className="num">{c.position}</td><td className="clip">{c.input}</td><td className="clip">{c.expected ?? <span className="muted">none</span>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {ds.cases.length > 3 && <p className="hint">…and {ds.cases.length - 3} more.</p>}
    </div>
  );
}

function NewRunForm() {
  const router = useRouter();
  const params = useSearchParams();
  const fromRun = params.get("from");
  const fromHandoff = params.get("handoff");
  const fileInput = useRef<HTMLInputElement>(null);

  const [models, setModels] = useState<Model[]>([]);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [mode, setMode] = useState<Mode>("upload");
  const [datasetId, setDatasetId] = useState<number | null>(null);
  const [preview, setPreview] = useState<DatasetDetail | null>(null);
  const [pasted, setPasted] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [system, setSystem] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [judge, setJudge] = useState("");
  const [criteria, setCriteria] = useState("");
  const [threshold, setThreshold] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [m, c, d] = await Promise.all([api.models(), api.config(), api.datasets()]);
        setModels(m);
        setConfig(c);
        setDatasets(d);
        setJudge(c.judge_model ?? "");
        if (d.length) { setMode("saved"); setDatasetId(d[0].id); }
        setSelected(defaultPick(m));

        const handoff = fromHandoff ? readJSON<Handoff>("session", "handoff") : null;
        if (handoff) {
          // Coming from Quick test: keep the prompt and models, start the inputs with the one tried.
          setPrompt(handoff.prompt); setSystem(handoff.system); setCriteria(handoff.criteria);
          setSelected(handoff.models.filter((id) => m.some((x) => x.id === id)));
          if (handoff.pasted) { setMode("paste"); setPasted(handoff.pasted + "\n"); }
          removeKey("session", "handoff");
        } else if (fromRun) {
          // "Edit prompt & re-run": same dataset and models, so the comparison is fair.
          const r = await api.run(Number(fromRun));
          setPrompt(r.prompt_template); setSystem(r.system_prompt); setSelected(r.models);
          setJudge(r.judge_model); setCriteria(r.judge_criteria); setThreshold(r.pass_threshold);
          setMode("saved"); setDatasetId(r.dataset_id); setLabel(`${r.label || `Run ${r.id}`} (v2)`);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [fromRun, fromHandoff]);

  useEffect(() => {
    if (mode !== "saved" || !datasetId) { setPreview(null); return; }
    let alive = true;
    api.dataset(datasetId).then((d) => alive && setPreview(d)).catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [mode, datasetId]);

  async function uploadFile(file: File, name?: string) {
    setError(null);
    if (config && file.size > config.max_upload_bytes) return setError(`That file is too large (limit ${Math.round(config.max_upload_bytes / 1000)} KB).`);
    setUploading(true);
    try {
      const form = new FormData();
      form.set("name", name ?? file.name);
      form.set("file", file);
      const ds = await api.uploadDataset(form);
      setDatasets((prev) => [ds, ...prev.filter((d) => d.id !== ds.id)]);
      setDatasetId(ds.id);
      setMode("saved");
    } catch (e) {
      setError(`Could not use that file: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  async function useSample() {
    const existing = datasets.find((d) => d.name === SAMPLE_NAME);
    if (existing) { setMode("saved"); setDatasetId(existing.id); return; }
    try {
      const res = await fetch("/samples/customer_complaints.csv");
      const blob = await res.blob();
      await uploadFile(new File([blob], "customer_complaints.csv", { type: "text/csv" }), SAMPLE_NAME);
    } catch {
      setError("Could not load the sample file.");
    }
  }

  const pastedLines = pasted.split("\n").map((l) => l.trim()).filter(Boolean);
  const caseInputs = mode === "paste" ? pastedLines : mode === "saved" && preview ? preview.cases.map((c) => c.input) : [];
  const cases = caseInputs.length;
  const calls = cases * selected.length;

  // Rough estimate: about 4 characters per token, about 150 output tokens per answer.
  const avgInput = cases ? caseInputs.reduce((n, s) => n + s.length, 0) / cases : 0;
  const tokensIn = (prompt.length + system.length + avgInput) / 4;
  const chosen = models.filter((m) => selected.includes(m.id));
  const modelCost = chosen.reduce((sum, m) => sum + cases * (tokensIn * m.input_per_mtok + 150 * m.output_per_mtok) / 1e6, 0);
  const judgeModel = models.find((m) => m.id === judge);
  const judgeCost = judgeModel ? calls * ((tokensIn + 400) * judgeModel.input_per_mtok + 150 * judgeModel.output_per_mtok) / 1e6 : 0;
  const tooMany = config ? calls > config.max_calls_per_run : false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!prompt.trim()) return setError("Write a prompt (step 1).");
    if (!cases) return setError("Add some test inputs (step 2).");
    if (!selected.length) return setError("Pick at least one model (step 3).");
    setBusy(true);
    try {
      let dsId = datasetId;
      if (mode === "paste") {
        const form = new FormData();
        form.set("name", label || `Pasted inputs (${pastedLines.length})`);
        form.set("pasted", pasted);
        dsId = (await api.uploadDataset(form)).id;
      }
      if (!dsId) throw new Error("Choose a dataset (step 2).");
      const run = await api.createRun({
        dataset_id: dsId, label, prompt_template: prompt, system_prompt: system,
        models: selected, judge_model: judge || undefined, judge_criteria: criteria, pass_threshold: threshold,
      });
      router.push(`/runs/${run.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="row spread">
        <div>
          <h1>Evaluate a prompt</h1>
          <p className="lead">Check a prompt properly before you rely on it. Run it on many realistic examples and several AIs. Every answer is graded, and when you edit the prompt later, you&apos;ll see exactly which answers got better or worse.</p>
        </div>
        <Link href="/try" className="btn">Only one input? Quick test</Link>
      </div>

      <div style={{ marginTop: 20 }}>
        <Step n={1} title="Your prompt" hint="Use {{input}} where each test input goes"
          help={<>Your instructions to the AI. Each test input is placed where {"{{input}}"} appears, one at a time.</>}>
          <textarea id="prompt" aria-label="Prompt" rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} required />
          <details className="more">
            <summary>Name this version, add a system prompt</summary>
            <div className="two-col">
              <div>
                <label htmlFor="label">Version name <span className="hint">e.g. &quot;v3: added tone rule&quot;</span></label>
                <input id="label" type="text" maxLength={200} value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div>
                <label htmlFor="system">System prompt</label>
                <textarea id="system" rows={2} value={system} onChange={(e) => setSystem(e.target.value)} />
              </div>
            </div>
            <p className="hint">Other columns in your file work too, e.g. {"{{product}}"}.</p>
          </details>
        </Step>

        <Step n={2} title="Test inputs" hint="Keep them the same between versions"
          help={<>The examples to test with, such as 10 to 30 real customer emails. They are saved as a <strong>dataset</strong>, so you can re-use exactly the same examples after changing your prompt. That&apos;s how before and after can be compared fairly. Not sure? Click <strong>Use sample data</strong>.</>}>
          <div className="tabs">
            {datasets.length > 0 && <button type="button" className={mode === "saved" ? "on" : ""} onClick={() => { setMode("saved"); setDatasetId(datasetId ?? datasets[0].id); }}>Saved datasets</button>}
            <button type="button" className={mode === "upload" ? "on" : ""} onClick={() => setMode("upload")}>Upload a file</button>
            <button type="button" className={mode === "paste" ? "on" : ""} onClick={() => setMode("paste")}>Type or paste</button>
            <button type="button" onClick={useSample}>Use sample data</button>
          </div>

          {mode === "saved" && (
            <>
              <select aria-label="Saved dataset" value={datasetId ?? ""} onChange={(e) => setDatasetId(Number(e.target.value))}>
                {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.case_count} cases)</option>)}
              </select>
              {preview && <Preview ds={preview} />}
            </>
          )}

          {mode === "upload" && (
            <>
              <div className={`drop ${dragOver ? "over" : ""}`} role="button" tabIndex={0}
                onClick={() => fileInput.current?.click()}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f); }}>
                {uploading ? "Checking your file…" : <><strong>Drop a file here</strong> or click to choose<br /><span className="hint">.csv, .json or .jsonl · up to {config?.max_cases_per_dataset ?? 500} rows</span></>}
              </div>
              <input ref={fileInput} className="sr-only" type="file" accept=".csv,.json,.jsonl" tabIndex={-1}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
              <details className="more">
                <summary>What should the file look like?</summary>
                <p>A CSV with an <code>input</code> column. Add an <code>expected</code> column with the ideal answer to make grading much more accurate:</p>
                <pre className="out">{"input,expected\n\"My order arrived broken. I want a refund.\",\"Customer wants a refund for a broken order.\"\n\"The app crashes when I log in.\",\"The app crashes at login.\""}</pre>
                <p className="hint">JSON works too: a list like [{"{"}&quot;input&quot;: &quot;...&quot;, &quot;expected&quot;: &quot;...&quot;{"}"}]. Or click <strong>Use sample data</strong> to try it now.</p>
              </details>
            </>
          )}

          {mode === "paste" && (
            <>
              <textarea aria-label="Test inputs, one per line" rows={7} placeholder={"One test input per line, for example:\nMy order arrived broken. I want a refund.\nThe app crashes when I log in."}
                value={pasted} onChange={(e) => setPasted(e.target.value)} />
              <p className="hint">{pastedLines.length} input{pastedLines.length === 1 ? "" : "s"}. Pasted inputs have no ideal answers. For those, upload a file.</p>
            </>
          )}
        </Step>

        <Step n={3} title="Which AIs should answer?" help={<>Every test input goes to every AI you pick. 10 inputs and 2 AIs means 20 answers.</>}>
          <ModelPicker models={models} selected={selected} onChange={setSelected} max={config?.max_models_per_run ?? 6} />
        </Step>

        <Step n={4} title="How answers are graded" hint="An AI grader scores every answer from 1 to 10"
          help={<>A separate &quot;grader&quot; AI reads each answer and gives it 1 to 10 with a reason. Answers at or above the pass mark count as passed. Describe what a good answer looks like to make grading stricter and fairer.</>}>
          <div className="two-col">
            <div>
              <label htmlFor="criteria">What makes a good answer? <span className="hint">optional but recommended</span></label>
              <textarea id="criteria" rows={3} placeholder="e.g. Exactly one sentence. Mentions the problem and what the customer wants. No invented facts."
                value={criteria} onChange={(e) => setCriteria(e.target.value)} />
            </div>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 200px" }}>
                <label htmlFor="judge">Grader model</label>
                <select id="judge" value={judge} onChange={(e) => setJudge(e.target.value)}>
                  {(config?.judge_options ?? []).map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>
              <div style={{ flex: "0 1 120px" }}>
                <label htmlFor="threshold">Pass mark</label>
                <input id="threshold" type="number" min={1} max={10} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
              </div>
            </div>
          </div>
        </Step>
      </div>

      {error && <div className="error">{error}</div>}
      <div className="runbar">
        <div className="summary">
          {cases && selected.length ? (
            <>
              <strong>{cases}</strong> input{cases === 1 ? "" : "s"} × <strong>{selected.length}</strong> model{selected.length === 1 ? "" : "s"} = <strong>{calls}</strong> answers, each graded.{" "}
              <span className="muted">Estimated cost: {modelCost + judgeCost === 0 ? "free" : `about ${fmtCost(modelCost + judgeCost)}`}</span>
              {tooMany && <span className="badge bad" style={{ marginLeft: 6 }}>over the {config?.max_calls_per_run.toLocaleString()}-answer limit</span>}
            </>
          ) : <span className="muted">Add test inputs and pick models to see what this run will do.</span>}
        </div>
        <button className="primary big" type="submit" disabled={busy || uploading}>{busy ? "Starting…" : "Run evaluation"}</button>
      </div>
    </form>
  );
}

export default function NewRunPage() {
  return <Suspense fallback={<p className="muted">Loading…</p>}><NewRunForm /></Suspense>;
}
