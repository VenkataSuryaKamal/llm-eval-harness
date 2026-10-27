"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, Dataset, fmtDate, PublicConfig, Run } from "@/lib/api";
import { FAQ, GLOSSARY } from "@/lib/explain";
import { PROVIDER_NAMES } from "@/lib/models";
import { StatusBadge } from "@/components/StatusBadge";

/** A static picture of what a result looks like, so visitors get it before trying anything. */
function DemoResult() {
  const rows = [
    { who: "AI model A", said: "“Customer got a cracked screen and wants a full refund.”", score: 9, cls: "good" },
    { who: "AI model B", said: "“Thank you for reaching out! We value your feedback and…”", score: 3, cls: "bad" },
    { who: "AI model C", said: "“Order #4821 arrived damaged; customer wants a refund.”", score: 8, cls: "good" },
  ];
  return (
    <div className="demo" aria-label="Example of a result">
      <div className="hint" style={{ marginBottom: 6 }}>Your prompt</div>
      <div className="demo-q">Summarize this customer complaint in one sentence: <em>“My order #4821 arrived with a cracked screen. I want a full refund.”</em></div>
      {rows.map((r) => (
        <div className="demo-row" key={r.who}>
          <span className="who">{r.who}</span>
          <span className={`score ${r.cls}`}>{r.score}<span className="hint">/10</span></span>
          <span className="said">{r.said}</span>
        </div>
      ))}
      <div className="demo-caption">Example only. Every answer is graded automatically, with a reason.</div>
    </div>
  );
}

export default function Home() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configLoaded = useRef(false);

  async function load() {
    try {
      const [r, d] = await Promise.all([api.runs(), api.datasets()]);
      setRuns(r);
      setDatasets(d);
      setError(null);
      if (!configLoaded.current) {
        api.config().then((c) => { configLoaded.current = true; setConfig(c); }).catch(() => {});
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  const dsName = (id: number) => datasets.find((d) => d.id === id)?.name ?? `Dataset ${id}`;
  const realProviders = (config?.providers ?? []).filter((p) => p !== "mock");

  async function removeRun(id: number) {
    if (!confirm(`Delete evaluation #${id}? This cannot be undone.`)) return;
    try { await api.deleteRun(id); load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      {error && <div className="error">{error}</div>}

      {/* 1. What is this? */}
      <section className="hero hero-grid">
        <div>
          <div className="eyebrow">A report card for AI prompts</div>
          <h1>Find out which AI answers your prompt best, and whether your changes made it better or worse.</h1>
          <p className="lead">
            Type the instructions you give an AI. This app sends them to several AIs at once, has another AI grade every
            answer from 1 to 10, and shows you which one is the most accurate, the fastest and the cheapest.
          </p>
          <div className="cta-row">
            <Link href="/try" className="btn primary big">Try it now, it takes 30 seconds</Link>
            <Link href="/help" className="btn big">How it works</Link>
          </div>
          {config && (
            <p className="hint" style={{ marginTop: 14 }}>
              {realProviders.length
                ? <>✓ Ready to use: {realProviders.map((p) => PROVIDER_NAMES[p] ?? p).join(" · ")}</>
                : <>Only offline demo AIs are connected. Add a free Gemini or Groq key to test real ones (see Help).</>}
            </p>
          )}
        </div>
        <DemoResult />
      </section>

      {/* 2. Why would I need it? */}
      <section className="section">
        <h2>The problem it solves</h2>
        <p className="lead">If you use AI in a product, a business or a school project, you keep tweaking your prompt. Without testing, you're guessing.</p>
        <div className="problem">
          <div className="card"><div className="big-emoji" aria-hidden>🤔</div><h3>&quot;Is my new prompt actually better?&quot;</h3><p>You change a few words, check two answers, and they look fine. But did it quietly break ten others?</p></div>
          <div className="card"><div className="big-emoji" aria-hidden>⚖️</div><h3>&quot;Which AI should I pick?&quot;</h3><p>GPT, Gemini, Llama… they differ a lot in quality, speed and price, and the best one depends on your task.</p></div>
          <div className="card"><div className="big-emoji" aria-hidden>⏱️</div><h3>&quot;I can't read 100 answers by hand.&quot;</h3><p>A grader AI scores every answer and explains why, so you only read the ones that matter.</p></div>
        </div>
      </section>

      {/* 3. The key feature, shown not told */}
      <section className="section">
        <h2>Change your prompt, see exactly what changed</h2>
        <p className="lead">Save a set of test inputs once. Every time you edit your prompt and run it again, you get a clear before-and-after report like this:</p>
        <div className="card">
          <div className="compare-demo">
            <div><div className="num" style={{ color: "var(--good)" }}>8</div><div>answers got <strong>better</strong></div></div>
            <div><div className="num" style={{ color: "var(--bad)" }}>3</div><div>answers got <strong>worse</strong></div></div>
            <div><div className="num">19</div><div>stayed the same</div></div>
          </div>
          <p className="hint" style={{ textAlign: "center", marginBottom: 0 }}>Example only. You can open each changed answer and read it before and after, side by side.</p>
        </div>
      </section>

      {/* 4. Pick a path */}
      <section className="section">
        <h2>Two ways to use it</h2>
        <div className="choices" style={{ marginTop: 12 }}>
          <Link href="/try" className="choice">
            <div className="icon" aria-hidden>⚡</div>
            <h3>Quick test</h3>
            <p><strong>Best for:</strong> trying an idea. One prompt, one example. You see each AI&apos;s answer and grade in seconds. Nothing is saved.</p>
            <span className="go">Start a quick test →</span>
          </Link>
          <Link href="/runs/new" className="choice">
            <div className="icon" aria-hidden>📋</div>
            <h3>Evaluate many inputs</h3>
            <p><strong>Best for:</strong> getting it right before you rely on it. Test 10 to 500 examples, get a report card per AI, and track changes over time.</p>
            <span className="go">Start an evaluation →</span>
          </Link>
        </div>
      </section>

      {/* 5. Who is it for */}
      <section className="section">
        <h2>Who it&apos;s for</h2>
        <div className="problem">
          <div className="card"><div className="big-emoji" aria-hidden>👩‍💻</div><h3>Developers</h3><p>Building a chatbot or AI feature, and wanting tests for prompts the way you have tests for code.</p></div>
          <div className="card"><div className="big-emoji" aria-hidden>💼</div><h3>Product and support teams</h3><p>Writing prompts for summaries, replies or classification, and needing proof they work before launch.</p></div>
          <div className="card"><div className="big-emoji" aria-hidden>🎓</div><h3>Students and learners</h3><p>Learning prompt writing, and seeing how different AIs respond to the same instructions.</p></div>
        </div>
      </section>

      {/* 6. Their history */}
      {runs && runs.length > 0 && (
        <section className="section">
          <h2>Your saved evaluations</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Version</th><th>Test inputs</th><th>AIs tested</th><th>Status</th><th>Created</th><th></th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/runs/${r.id}`}>#{r.id}</Link></td>
                    <td><Link href={`/runs/${r.id}`}>{r.label || <span className="muted">untitled</span>}</Link></td>
                    <td>{dsName(r.dataset_id)}</td>
                    <td>{r.models.length}</td>
                    <td><StatusBadge run={r} /></td>
                    <td className="muted">{fmtDate(r.created_at)}</td>
                    <td>{r.status !== "running" && r.status !== "queued" && <button className="small" onClick={() => removeRun(r.id)}>Delete</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 7. Words and questions */}
      <section className="section">
        <h2>Words you&apos;ll see</h2>
        <dl className="glossary">
          {GLOSSARY.slice(0, 6).map((g) => <div className="card" key={g.term}><dt>{g.term}</dt><dd>{g.meaning}</dd></div>)}
        </dl>
        <p className="hint"><Link href="/help">See all terms and questions →</Link></p>
      </section>

      <section className="section faq">
        <h2>Common questions</h2>
        {FAQ.slice(0, 4).map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
        <div className="cta-row"><Link href="/try" className="btn primary big">Try a quick test</Link></div>
      </section>
    </>
  );
}
