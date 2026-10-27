import Link from "next/link";
import { FAQ, GLOSSARY } from "@/lib/explain";

export const metadata = { title: "Help · LLM Eval Harness" };

export default function HelpPage() {
  return (
    <>
      <div className="eyebrow">Help</div>
      <h1>How this app works</h1>
      <p className="lead">
        When you use AI, you write instructions called a <strong>prompt</strong>. This app checks how good the answers to your
        prompt are, across several AIs and many examples, so you don&apos;t have to guess.
      </p>

      <section className="section">
        <h2>Your first test, step by step</h2>
        <div className="steps-inline">
          <div className="card"><span className="n">1</span><strong>Write a prompt</strong><p className="hint">For example: &quot;Summarize this complaint in one sentence: {"{{input}}"}&quot;. The {"{{input}}"} part is where your example text goes.</p></div>
          <div className="card"><span className="n">2</span><strong>Add an example</strong><p className="hint">Paste one real example, such as a customer email. In an evaluation, add many.</p></div>
          <div className="card"><span className="n">3</span><strong>Pick 2–3 AIs</strong><p className="hint">Ones marked &quot;free&quot; cost nothing. Comparing different companies is the most interesting.</p></div>
          <div className="card"><span className="n">4</span><strong>Press Run</strong><p className="hint">Read each AI&apos;s answer, its grade from 1 to 10, and why it got that grade.</p></div>
        </div>
        <div className="cta-row"><Link className="btn primary" href="/try">Open Quick test</Link></div>
      </section>

      <section className="section">
        <h2>How to read the results</h2>
        <div className="problem">
          <div className="card"><h3>Grade (1–10)</h3><p>7 or more counts as a pass. Green is good, amber is so-so, red is wrong or off-task. Read the &quot;Why&quot; line under each grade.</p></div>
          <div className="card"><h3>Speed and cost</h3><p>How long each AI took, and what the answer cost. &quot;free&quot; means it used a free tier.</p></div>
          <div className="card"><h3>Better or worse</h3><p>When you re-run an evaluation after editing your prompt, it lists which answers improved and which broke, side by side.</p></div>
        </div>
      </section>

      <section className="section">
        <h2>Tips for good results</h2>
        <ul>
          <li><strong>Give an ideal answer</strong> when you can. The grader is much more accurate with one.</li>
          <li><strong>Say what &quot;good&quot; means</strong>, for example &quot;one sentence, no invented facts&quot;. Put it in the grading criteria box.</li>
          <li><strong>Test realistic and awkward examples</strong>: long, short, angry, or ones that try to trick the AI.</li>
          <li><strong>Change one thing at a time</strong>, and keep the same test inputs, so before and after are comparable.</li>
          <li><strong>Don&apos;t over-read one flipped answer.</strong> The grader varies a little. Look for patterns.</li>
        </ul>
      </section>

      <section className="section">
        <h2>Glossary</h2>
        <dl className="glossary">
          {GLOSSARY.map((g) => <div className="card" key={g.term}><dt>{g.term}</dt><dd>{g.meaning}</dd></div>)}
        </dl>
      </section>

      <section className="section faq">
        <h2>Questions</h2>
        {FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
        <details>
          <summary>How do I connect a free AI?</summary>
          <p>Get a free key from Google AI Studio (aistudio.google.com/apikey) or Groq (console.groq.com/keys). Paste it into the backend settings file
            (<code>backend/.env</code>) as <code>GEMINI_API_KEY=…</code> or <code>GROQ_API_KEY=…</code>, then restart the backend. The README has full steps.</p>
        </details>
      </section>
    </>
  );
}
