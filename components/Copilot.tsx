"use client";

import { useRef, useState } from "react";
import type { TraceStep } from "@/lib/copilot";

interface Msg {
  role: "user" | "assistant";
  content: string;
  trace?: TraceStep[];
}

const SUGGESTIONS = [
  "Can I take on a 2 MW AI-training tenant for 6 hours?",
  "A tenant wants 4 MW for 12 hours — can I accept?",
  "When should I run a 1 MW flexible training job to cut cost and carbon?",
];

export function Copilot() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const history: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages([
        ...history,
        { role: "assistant", content: data.reply ?? "(no response)", trace: data.trace },
      ]);
    } catch {
      setMessages([...history, { role: "assistant", content: "Something went wrong reaching the copilot." }]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    }
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-emerald-600">✦</span>
        <h2 className="text-sm font-medium text-slate-800">Energy Copilot</h2>
        <span className="text-[11px] text-muted">reasons over live headroom + grid — defers risky calls to you</span>
      </div>

      <div ref={scrollRef} className="mt-3 max-h-[26rem] space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-muted">
            Ask about accepting a tenant, scheduling a flexible job, or current headroom. The copilot calls
            the same tools the dashboard uses, quantifies £ + CO₂, and won&apos;t grant anything that breaches
            the N+1 reserve — it flags those for you.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div
              className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-sky-500/15 text-slate-900"
                  : "bg-panel-2 text-slate-800"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.trace && m.trace.length > 0 && (
                <details className="mt-2 text-[11px] text-muted">
                  <summary className="cursor-pointer select-none hover:text-slate-700">
                    {m.trace.length} tool call{m.trace.length > 1 ? "s" : ""}
                  </summary>
                  <div className="mt-1 space-y-1">
                    {m.trace.map((s, j) => (
                      <div key={j} className="tabular rounded border border-border bg-panel px-2 py-1">
                        <span className="text-emerald-600">{s.tool}</span>
                        {Object.keys(s.input).length > 0 && (
                          <span className="text-muted"> ({JSON.stringify(s.input)})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="text-sm text-muted">Copilot is thinking…</div>}
      </div>

      {messages.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-border bg-panel-2 px-3 py-1 text-xs text-slate-700 hover:border-emerald-500/40 hover:text-slate-900"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the operator copilot…"
          className="flex-1 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-muted focus:border-emerald-500/40"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg bg-emerald-500/90 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
