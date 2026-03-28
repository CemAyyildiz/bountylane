import { useState, useEffect, useRef } from "react";
import { getHealth, getAgentStatus, getAgentCompleted } from "../api";
import type { AgentStatus } from "../api";
import type { Task } from "../types";

interface PlatformHealth {
  status: string;
  platform: string;
  contract: string;
  escrowBalance: string;
  chain: string;
  tasks: {
    total: number;
    open: number;
    accepted: number;
    submitted: number;
    done: number;
  };
}

export function Agent() {
  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [completed, setCompleted] = useState<Task[]>([]);
  const [uptime, setUptime] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const startTime = useRef(Date.now());

  // Scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [agent?.alerts]);

  // Platform health polling
  useEffect(() => {
    const check = async () => {
      try { setHealth(await getHealth()); } catch { setHealth(null); }
    };
    check();
    const iv = setInterval(check, 5_000);
    return () => clearInterval(iv);
  }, []);

  // Agent status polling
  useEffect(() => {
    const check = async () => {
      try {
        setAgent(await getAgentStatus());
        setCompleted(await getAgentCompleted());
      } catch {
        setAgent(null);
      }
    };
    check();
    const iv = setInterval(check, 3_000);
    return () => clearInterval(iv);
  }, []);

  // Uptime
  useEffect(() => {
    const iv = setInterval(() => setUptime(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);

  const platformOn = health?.status === "ok";
  const agentOn = !!agent;

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <section id="agent" className="py-20 px-6 border-t-2 border-[var(--c-white)]">
      <div className="max-w-6xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 mb-3">
          <h2 className="text-3xl font-bold">HYBRID AGENT</h2>
          <span className={agentOn ? "status-online" : "status-offline"}>
            {agentOn ? "RUNNING" : "OFFLINE"}
          </span>
        </div>
        <p className="text-dim text-sm mb-8">
          Autonomous supervisor + worker — monitors the platform, finds open tasks, solves with LLM, submits on-chain
        </p>

        {/* ── Top Stats Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <HighlightBox
            label="EARNED"
            value={completed.length > 0
              ? `${completed.reduce((sum, t) => sum + parseFloat(t.reward || "0"), 0).toFixed(4)} MON`
              : "0 MON"}
            accent
          />
          <HighlightBox label="COMPLETED" value={completed.length} />
          <HighlightBox label="TOTAL TASKS" value={health?.tasks.total ?? "—"} />
          <HighlightBox
            label="ESCROW"
            value={health ? `${parseFloat(health.escrowBalance).toFixed(4)} MON` : "—"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: Agent Identity ── */}
          <div className="brutal-card p-6 space-y-4">
            <h3 className="text-xs text-dim border-b border-[var(--c-gray-light)] pb-2 mb-1">
              AGENT CONFIG
            </h3>

            <StatRow label="ID" value={agent?.agentId ?? "—"} />
            <StatRow label="STATUS" value={agentOn ? "● ACTIVE" : "○ STOPPED"} accent={agentOn} />
            <StatRow label="LLM" value="GROQ / LLAMA-3.3-70B" />
            <StatRow label="UPTIME" value={fmt(uptime)} />

            <div className="border-t border-[var(--c-gray-light)] pt-3">
              <h3 className="text-xs text-dim mb-2">CURRENT TASK</h3>
              {agent?.currentTask ? (
                <p className="text-accent text-sm font-bold">{agent.currentTask}</p>
              ) : (
                <p className="text-dim text-xs">idle — waiting for open tasks</p>
              )}
            </div>

            <div className="border-t border-[var(--c-gray-light)] pt-3">
              <h3 className="text-xs text-dim mb-2">PLATFORM</h3>
              <StatRow label="STATUS" value={platformOn ? "● CONNECTED" : "○ DOWN"} accent={platformOn} />
              <StatRow label="CHAIN" value={health?.chain || "—"} />
              <div className="grid grid-cols-4 gap-2 text-center mt-3">
                <MiniBox label="OPEN" value={health?.tasks.open ?? 0} />
                <MiniBox label="ACTIVE" value={health?.tasks.accepted ?? 0} />
                <MiniBox label="PEND" value={health?.tasks.submitted ?? 0} />
                <MiniBox label="DONE" value={health?.tasks.done ?? 0} />
              </div>
            </div>

            {health && (
              <div className="border-t border-[var(--c-gray-light)] pt-3 text-xs">
                <p className="text-dim mb-1">CONTRACT</p>
                <a
                  href={`https://monadscan.com/address/${health.contract}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline break-all"
                >
                  {health.contract}
                </a>
              </div>
            )}
          </div>

          {/* ── Middle: Activity Feed ── */}
          <div className="terminal-box">
            <div className="terminal-header">
              <div className="terminal-dot bg-[var(--c-error)]" />
              <div className="terminal-dot bg-[var(--c-accent)]" />
              <div className="terminal-dot bg-[var(--c-success)]" />
              <span className="text-xs text-dim ml-2">agent.log</span>
              <span className="text-xs text-dim ml-auto">{agent?.alerts.length ?? 0} events</span>
            </div>

            <div ref={logRef} className="h-[420px] overflow-y-auto p-4 space-y-1 text-xs">
              {!agent || agent.alerts.length === 0 ? (
                <p className="text-dim">$ agent idle<span className="cursor" /></p>
              ) : (
                [...agent.alerts].reverse().map((a, i) => (
                  <p key={i} className={
                    a.includes("Error") ? "text-error" :
                    a.includes("Completed") || a.includes("MON") ? "text-success" :
                    a.includes("Accepted") ? "text-accent" :
                    a.includes("Stalled") || a.includes("Missing") ? "text-[var(--c-accent)]" :
                    "text-dim"
                  }>
                    {a}
                  </p>
                ))
              )}
            </div>
          </div>

          {/* ── Right: Completed Tasks ── */}
          <div className="terminal-box">
            <div className="terminal-header">
              <div className="terminal-dot bg-[var(--c-error)]" />
              <div className="terminal-dot bg-[var(--c-accent)]" />
              <div className="terminal-dot bg-[var(--c-success)]" />
              <span className="text-xs text-dim ml-2">completed.db</span>
              <span className="text-xs text-dim ml-auto">{completed.length} tasks</span>
            </div>

            <div className="h-[420px] overflow-y-auto divide-y divide-[var(--c-gray-light)]">
              {completed.length === 0 ? (
                <div className="p-8 text-center text-dim text-xs">
                  <p className="mb-2">NO COMPLETED TASKS YET</p>
                  <p>Agent will automatically pick up</p>
                  <p>and solve open tasks</p>
                </div>
              ) : (
                [...completed].reverse().map((task) => (
                  <div key={task.id} className="p-4 hover:bg-[var(--c-gray)] transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold truncate mr-2">{task.title}</span>
                      <span className="text-success text-xs font-bold shrink-0">
                        +{task.reward} MON
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {task.escrowTx && (
                        <TxLink hash={task.escrowTx} label="ESCROW" />
                      )}
                      {task.acceptTx && (
                        <TxLink hash={task.acceptTx} label="ACCEPT" />
                      )}
                      {task.submitTx && (
                        <TxLink hash={task.submitTx} label="SUBMIT" />
                      )}
                      {task.payoutTx && (
                        <TxLink hash={task.payoutTx} label="PAYOUT" color="text-success" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Workflow Diagram ── */}
        <div className="mt-8 terminal-box p-6">
          <div className="terminal-header mb-4" style={{ margin: "-24px -24px 16px", padding: "8px 12px" }}>
            <div className="terminal-dot bg-[var(--c-error)]" />
            <div className="terminal-dot bg-[var(--c-accent)]" />
            <div className="terminal-dot bg-[var(--c-success)]" />
            <span className="text-xs text-dim ml-2">agent-workflow.md</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
            <Step icon="🔍" label="POLL TASKS" sub="every 3s" />
            <Arrow />
            <Step icon="📋" label="SELECT BEST" sub="highest reward" />
            <Arrow />
            <Step icon="✅" label="ACCEPT" sub="on-chain tx" />
            <Arrow />
            <Step icon="🧠" label="LLM SOLVE" sub="Groq API" />
            <Arrow />
            <Step icon="📤" label="SUBMIT" sub="on-chain tx" />
            <Arrow />
            <Step icon="💰" label="PAYOUT" sub="auto release" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Sub-components ── */

function HighlightBox({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="brutal-card p-4 text-center">
      <p className={`text-xl font-bold ${accent ? "text-accent" : ""}`}>{value}</p>
      <p className="text-[10px] text-dim mt-1">{label}</p>
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-dim">{label}</span>
      <span className={accent ? "text-success font-bold" : ""}>{value}</span>
    </div>
  );
}

function MiniBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="brutal-card p-2">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-dim">{label}</p>
    </div>
  );
}

function TxLink({ hash, label, color }: { hash: string; label: string; color?: string }) {
  return (
    <a
      href={`https://monadscan.com/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${color || "text-dim"} hover:text-accent transition-colors`}
    >
      [{label}]
    </a>
  );
}

function Step({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <p className="font-bold text-xs">{label}</p>
      <p className="text-dim text-[10px]">{sub}</p>
    </div>
  );
}

function Arrow() {
  return <span className="text-accent text-lg font-bold hidden sm:inline">→</span>;
}
