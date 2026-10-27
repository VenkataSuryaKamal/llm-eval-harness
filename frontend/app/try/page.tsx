"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, fmtCost, fmtMs, Model, PlaygroundResult, PublicConfig } from "@/lib/api";
import { Help } from "@/components/Help";
import { ModelPicker } from "@/components/ModelPicker";
import { defaultPick, PROVIDER_NAMES, shortLabel } from "@/lib/models";
import { readJSON, writeJSON } from "@/lib/storage";

const EXAMPLES = [
  {
    name: "Summarize a complaint",
    prompt: "Summarize this customer complaint in one sentence.\n\n{{input}}",
    input: "My order #4821 arrived with a cracked screen. I want a full refund, not a replacement.",
    expected: "Customer received a damaged order and wants a full refund instead of a replacement.",
  },
  {
    name: "Classify sentiment",
    prompt: "Classify the sentiment of this review as positive, negative or neutral. Reply with one word only.\n\n{{input}}",
    input: "Arrived two weeks late and the box was crushed. Never ordering again.",
    expected: "negative",
  },
  {
    name: "Extract JSON",
    prompt: "Extract the person's name and email from this message. Reply with JSON only, using the keys \"name\" and \"email\".\n\n{{input}}",
    input: "Hi, I'm Priya Sharma, you can reach me at priya.s@example.com about the invoice.",
    expected: "{\"name\": \"Priya Sharma\", \"email\": \"priya.s@example.com\"}",
  },
  {
    name: "Just a question",
    prompt: "Explain what an API is to a 10-year-old in two sentences.",
    input: "",
    expected: "",
  },
];

type Slot =
  | { status: "loading" }
  | { status: "done"; result: PlaygroundResult }
  | { status: "failed"; message: string };

function Waiting({ name, provider }: { name: string; provider?: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="card answer">
      <div className="answer-head"><div><div className="name">{name}</div><div className="hint">{provider}</div></div><span className="hint">thinking… {secs}s</span></div>
      <div className="skeleton" /><div className="skeleton" style={{ width: "80%" }} /><div className="skeleton" style={{ width: "60%" }} />
      {secs >= 20 && <p className="hint" style={{ margin: 0 }}>This is taking a while. Free tiers and local models can be slow or overloaded, and the other answers are ready to read.</p>}
    </div>
  );
}

const scoreClass = (s: number) => (s >= 7 ? "good" : s >= 4 ? "mid" : "bad");

export default function QuickTestPage() {
  const router = useRouter();
  const [models, setModels] = useState<Model[]>([]);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState(EXAMPLES[0].prompt);
  const [input, setInput] = useState(EXAMPLES[0].input);
  const [expected, setExpected] = useState(EXAMPLES[0].expected);
  const [system, setSystem] = useState("");
  const [criteria, setCriteria] = useState("");
  const [grade, setGrade] = useState(true);
  const [judge, setJudge] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const [order, setOrder] = useState<string[]>([]);
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const attempt = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [m, c] = await Promise.all([api.models(), api.config()]);
        setModels(m);
        setConfig(c);
        setJudge(c.judge_model ?? "");
        const saved = readJSON<string[]>("local", "quicktest.models")?.filter((id) => m.some((x) => x.id === id));
        setSelected(saved?.length ? saved : defaultPick(m));
      } catch (e) {
        setLoadError((e as Error).message);
      }
    })();
  }, []);

  useEffect(() => {
    if (readJSON<boolean>("local", "quicktest.introHidden")) setShowIntro(false);
  }, []);

  useEffect(() => {
    if (selected.length) writeJSON("local", "quicktest.models", selected);
  }, [selected]);

  const usesInput = /\{\{\s*input\s*\}\}/.test(prompt);
  const busy = Object.values(slots).some((s) => s.status === "loading");

  function loadExample(i: number) {
    const ex = EXAMPLES[i];
    setPrompt(ex.prompt);
    setInput(ex.input);
    setExpected(ex.expected);
  }

  async function run() {
    setFormError(null);
    if (!prompt.trim()) return setFormError("Write a prompt first.");
    if (!selected.length) return setFormError("Pick at least one model.");
    if (usesInput && !input.trim()) return setFormError("Your prompt contains {{input}}, so fill in the Input box, or remove {{input}} from the prompt.");
    const mine = ++attempt.current;
    const ids = [...selected];
    setOrder(ids);
    setSlots(Object.fromEntries(ids.map((id) => [id, { status: "loading" } as Slot])));
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    // One request per model, so each answer appears as soon as its model finishes.
    await Promise.all(ids.map(async (id) => {
      try {
        const res = await api.playground({
          prompt, input, expected, system_prompt: system, models: [id],
          judge: grade, judge_model: grade && judge ? judge : undefined, judge_criteria: criteria,
        });
        if (attempt.current === mine) setSlots((s) => ({ ...s, [id]: { status: "done", result: res.results[0] } }));
      } catch (e) {
        if (attempt.current === mine) setSlots((s) => ({ ...s, [id]: { status: "failed", message: (e as Error).message } }));
      }
    }));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy) {
      e.preventDefault();
      run();
    }
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard blocked */ }
  }

  function scaleUp() {
    const p = usesInput ? prompt : `${prompt.trimEnd()}\n\n{{input}}`;
    writeJSON("session", "handoff", { prompt: p, system, models: selected, criteria, pasted: input.trim() });
    router.push("/runs/new?handoff=1");
  }

  // "Best at" badges, once every model has answered.
  const done = order.map((id) => slots[id]).flatMap((s) => (s?.status === "done" && !s.result.error ? [s.result] : []));
  const finished = order.length > 0 && !busy;
  const scores = done.map((r) => r.score).filter((x): x is number => x !== null);
  const top = scores.length ? Math.max(...scores) : null;
  const fastest = finished && done.length > 1 ? done.reduce((a, b) => (b.latency_ms < a.latency_ms ? b : a)).model : null;
  const costs = new Set(done.map((r) => r.cost_usd));
  const cheapest = finished && done.length > 1 && costs.size > 1 ? done.reduce((a, b) => (b.cost_usd < a.cost_usd ? b : a)).model : null;

  return (
    <div onKeyDown={onKeyDown}>
      <div className="row spread">
        <div>
          <h1>Quick test</h1>
          <p className="lead">Try one prompt on several models at once and compare the answers side by side. Nothing is saved.</p>
        </div>
        <Link href="/runs/new" className="btn">Test many inputs instead</Link>
      </div>
      {showIntro && (
        <div className="purpose" role="note">
          <span aria-hidden>💡</span>
          <span><strong>What this does:</strong> sends your prompt to each AI you pick, then a grader AI scores every answer from 1 to 10 and says why.
            Use it to see which AI handles your task best. Fill in the boxes (or click an example), pick 2–3 AIs, and press <strong>Run</strong>.</span>
          <button type="button" className="small" onClick={() => { setShowIntro(false); writeJSON("local", "quicktest.introHidden", true); }}>Got it</button>
        </div>
      )}
      {loadError && <div className="error">{loadError}</div>}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="examples" aria-label="Examples">
          <span className="hint" style={{ alignSelf: "center" }}>Start from an example:</span>
          {EXAMPLES.map((ex, i) => <button type="button" className="small" key={ex.name} onClick={() => loadExample(i)}>{ex.name}</button>)}
        </div>

        <div className="two-col">
          <div>
            <label htmlFor="prompt">1. Prompt: your instructions to the AI
              <Help>A prompt is what you ask the AI to do. Write it exactly as you would in your app or chatbot. Put {"{{input}}"} where the example text should be inserted.</Help>
            </label>
            <textarea id="prompt" rows={7} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the model do? e.g. Summarize this text in one sentence: {{input}}" />
            <p className="hint">Write {"{{input}}"} where the input should go, or leave it out and just ask a question.</p>
          </div>
          <div>
            <label htmlFor="input">2. Input: an example to work on {usesInput ? "" : <span className="hint">(optional; added after the prompt)</span>}
              <Help>One realistic example, such as a customer email or a product review. It replaces {"{{input}}"} in your prompt. Leave it empty if your prompt is just a question.</Help>
            </label>
            <textarea id="input" rows={7} value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="The text your prompt works on, e.g. a customer email" />
          </div>
        </div>

        <details className="more">
          <summary>Grading and more options</summary>
          <div className="two-col">
            <div>
              <label htmlFor="expected">Ideal answer <span className="hint">optional; makes grading much more accurate</span></label>
              <textarea id="expected" rows={3} value={expected} onChange={(e) => setExpected(e.target.value)} />
            </div>
            <div>
              <label htmlFor="criteria">What makes a good answer? <span className="hint">optional</span></label>
              <textarea id="criteria" rows={3} value={criteria} onChange={(e) => setCriteria(e.target.value)}
                placeholder="e.g. Exactly one sentence. No invented facts." />
            </div>
            <div>
              <label htmlFor="system">System prompt <span className="hint">optional</span></label>
              <textarea id="system" rows={2} value={system} onChange={(e) => setSystem(e.target.value)} placeholder="e.g. You are a concise support assistant." />
            </div>
            <div>
              <label className="toggle"><input type="checkbox" checked={grade} onChange={(e) => setGrade(e.target.checked)} /> Grade answers automatically</label>
              {grade && (
                <>
                  <label htmlFor="judge" style={{ marginTop: 10 }}>Grader model</label>
                  <select id="judge" value={judge} onChange={(e) => setJudge(e.target.value)}>
                    {(config?.judge_options ?? []).map((id) => <option key={id} value={id}>{id}</option>)}
                  </select>
                  <p className="hint">Another AI scores each answer from 1 to 10 and explains why.</p>
                </>
              )}
            </div>
          </div>
        </details>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <label>3. Which AIs should answer?
          <Help>Each AI (a &quot;model&quot;) answers the same prompt, so you can compare them. Ones marked &quot;free&quot; cost nothing. &quot;demo&quot; ones are fake, for practice. Picking AIs from different companies is the most interesting.</Help>
        </label>
        <ModelPicker models={models} selected={selected} onChange={setSelected} max={config?.max_models_per_run ?? 6} />
      </div>

      <div className="runbar">
        <div className="summary">
          {selected.length
            ? <>Runs on <strong>{selected.length}</strong> model{selected.length > 1 ? "s" : ""}{grade ? ", then grades each answer" : ""}.</>
            : "Pick at least one model."}{" "}
          <span className="kbd">⌘ Enter</span>
        </div>
        {formError && <div className="error" style={{ margin: 0 }}>{formError}</div>}
        <button className="primary big" onClick={run} disabled={busy || !selected.length}>{busy ? "Running…" : "Run"}</button>
      </div>

      <div ref={resultsRef} style={{ scrollMarginTop: 16 }}>
        {order.length > 0 && (
          <>
            {finished && done.length > 0 && (() => {
              const best = [...done].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
              const name = shortLabel(best.label);
              return best.score !== null ? (
                <div className="verdict" style={{ marginTop: 28 }}>
                  {done.length > 1 ? <><strong>{name}</strong> gave the best answer, scoring {best.score}/10.</> : <><strong>{name}</strong> scored {best.score}/10.</>}{" "}
                  {best.score >= 7 ? "That's a good answer." : best.score >= 4 ? "That's only partly right, so try making your prompt clearer." : "None of the answers were good. Try rewording your prompt or adding an ideal answer."}
                </div>
              ) : null;
            })()}
            <div className="row spread" style={{ marginTop: 20 }}>
              <h2 style={{ margin: 0 }}>Answers <Help>Each card is one AI&apos;s answer. The big number is its grade from 1 to 10 (7 or more is good), and &quot;Why&quot; is the grader&apos;s reason. You also see how long it took and what it cost.</Help></h2>
              {finished && <button onClick={scaleUp}>Test this prompt on many inputs →</button>}
            </div>
            <div className="answers" aria-live="polite">
              {order.map((id) => {
                const slot = slots[id];
                const m = models.find((x) => x.id === id);
                const name = shortLabel(m?.label ?? id);
                const provider = PROVIDER_NAMES[m?.provider ?? ""] ?? m?.provider;
                if (!slot || slot.status === "loading") return <Waiting key={id} name={name} provider={provider} />;
                if (slot.status === "failed") {
                  return (
                    <div className="card answer" key={id}>
                      <div className="answer-head"><div><div className="name">{name}</div><div className="hint">{provider}</div></div></div>
                      <div className="error" style={{ margin: 0 }}>{slot.message}</div>
                    </div>
                  );
                }
                const r = slot.result;
                return (
                  <div className="card answer" key={id}>
                    <div className="answer-head">
                      <div>
                        <div className="name">{name}</div>
                        <div className="hint">{provider}</div>
                        <div className="row" style={{ gap: 6, marginTop: 6 }}>
                          {r.score !== null && r.score === top && done.length > 1 && <span className="badge good">Best score</span>}
                          {fastest === id && <span className="badge">Fastest</span>}
                          {cheapest === id && <span className="badge">Cheapest</span>}
                        </div>
                      </div>
                      {r.score !== null
                        ? <span className={`score ${scoreClass(r.score)}`} title="Grade from 1 to 10">{r.score}<span className="hint">/10</span></span>
                        : grade && r.output ? <span className="badge warn">not graded</span> : null}
                    </div>
                    {r.error && <div className="error" style={{ margin: 0 }}>{r.error}</div>}
                    {/* Shown as plain text: React escapes it, so model output can never run as HTML. */}
                    {r.output && <pre className="out">{r.output}</pre>}
                    <div className="stats">
                      <span>{fmtMs(r.latency_ms)}</span>
                      <span>{r.input_tokens + r.output_tokens} tokens</span>
                      <span>{r.free_tier ? "free" : fmtCost(r.cost_usd)}</span>
                      {r.output && <button type="button" className="small" onClick={() => copy(id, r.output)}>{copied === id ? "Copied ✓" : "Copy"}</button>}
                    </div>
                    {r.judge_reasoning && <div className="why"><strong>Why:</strong> {r.judge_reasoning}</div>}
                  </div>
                );
              })}
            </div>
            {finished && (
              <div className="card" style={{ marginTop: 16 }}>
                <strong>Happy with one answer?</strong> One example can be lucky. Test the same prompt on 10 to 30 real inputs to be sure,
                and to catch regressions when you change it later.{" "}
                <button className="primary" style={{ marginLeft: 8 }} onClick={scaleUp}>Test on many inputs →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
