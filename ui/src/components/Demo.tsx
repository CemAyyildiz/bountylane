import { useState, useEffect, useRef, useCallback } from "react";
import { getHealth, getTasks, createTask, acceptTask, submitTask, connectSSE } from "../api";
import type { Task } from "../types";

const DEMO_REQUESTER = "demo://req-" + Math.random().toString(36).slice(2, 6);
const DEMO_WORKER = "demo://worker-" + Math.random().toString(36).slice(2, 6);

const TEMPLATES = [
  { title: "Analyze Smart Contract", reward: "0.005" },
  { title: "Fetch DEX Prices", reward: "0.002" },
  { title: "Monitor Wallet", reward: "0.003" },
];

export function Demo() {
  const [health, setHealth] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const log = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogs((p) => [...p.slice(-30), `[${ts}] ${msg}`]);
  }, []);

  // Health
  useEffect(() => {
    const check = async () => {
      try { setHealth(await getHealth()); } 
      catch { setHealth(null); }
    };
    check();
    const iv = setInterval(check, 10_000);
    return () => clearInterval(iv);
  }, []);

  // Tasks
  useEffect(() => { 
    getTasks().then(setTasks).catch(() => {}); 
  }, []);

  // SSE
  useEffect(() => {
    return connectSSE((event, data) => {
      if (event === "task:created") {
        setTasks((p) => p.find((t) => t.id === data.id) ? p : [data, ...p]);
      } else if (event === "task:updated") {
        setTasks((p) => p.map((t) => (t.id === data.id ? data : t)));
      }
    });
  }, []);

  const runDemo = async () => {
    if (running || !health) return;
    setRunning(true);
    const tpl = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];

    try {
      log("Creating task with escrow...");
      const task = await createTask({
        title: tpl.title,
        description: "Demo task",
        reward: tpl.reward,
        requester: DEMO_REQUESTER,
      });
      log(`ESCROW TX: ${task.escrowTx?.slice(0, 24)}...`);

      await delay(1500);
      log("Worker accepting task...");
      let accepted;
      try {
        accepted = await acceptTask(task.id, DEMO_WORKER);
        log(`ACCEPT TX: ${accepted.acceptTx?.slice(0, 24)}...`);
      } catch (e: any) {
        log(`WARN: Accept failed (${e.message}), retrying with fresh task...`);
        const fresh = await createTask({
          title: tpl.title + " (retry)",
          description: "Demo task",
          reward: tpl.reward,
          requester: DEMO_REQUESTER,
        });
        log(`NEW ESCROW TX: ${fresh.escrowTx?.slice(0, 24)}...`);
        await delay(500);
        accepted = await acceptTask(fresh.id, DEMO_WORKER);
        log(`ACCEPT TX: ${accepted.acceptTx?.slice(0, 24)}...`);
      }

      await delay(1500);
      log("Processing...");
      await delay(2000);

      log("Submitting result...");
      const submitted = await submitTask(
        accepted.id, 
        DEMO_WORKER, 
        JSON.stringify({ status: "completed", task: tpl.title })
      );
      log(`SUBMIT TX: ${submitted.submitTx?.slice(0, 24)}...`);

      log("Releasing payout...");
      await delay(3500);

      const updated = await getTasks();
      const final = updated.find((t) => t.id === accepted.id);
      if (final?.payoutTx) {
        log(`PAYOUT TX: ${final.payoutTx.slice(0, 24)}...`);
        log(`SUCCESS: ${tpl.reward} MON sent to worker`);
      }
    } catch (err: any) {
      log(`ERROR: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const online = !!health;

  return (
    <section id="demo" className="py-20 px-6 border-t-2 border-[var(--c-white)]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">LIVE DEMO</h2>
          <p className="text-dim text-sm">
            Execute a complete task flow with real on-chain transactions
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left - Controls & Log */}
          <div className="space-y-6">
            {/* Status & Button */}
            <div className="brutal-card p-6">
              <div className="flex items-center justify-between mb-6">
                <span className="text-xs text-dim">PLATFORM STATUS</span>
                <span className={online ? "status-online" : "status-offline"}>
                  {online ? "CONNECTED" : "OFFLINE"}
                </span>
              </div>

              {online && (
                <div className="flex items-center justify-between mb-6 text-xs">
                  <span className="text-dim">ESCROW BALANCE</span>
                  <span className="text-accent font-bold">
                    {parseFloat(health.escrowBalance || 0).toFixed(4)} MON
                  </span>
                </div>
              )}

              <button
                onClick={runDemo}
                disabled={running || !online}
                className="brutal-btn w-full justify-center"
              >
                {running ? "RUNNING..." : "▶ EXECUTE FLOW"}
              </button>
            </div>

            {/* Log */}
            <div className="terminal-box">
              <div className="terminal-header">
                <div className="terminal-dot bg-[var(--c-error)]" />
                <div className="terminal-dot bg-[var(--c-accent)]" />
                <div className="terminal-dot bg-[var(--c-success)]" />
                <span className="text-xs text-dim ml-2">execution.log</span>
              </div>
              
              <div ref={logRef} className="h-56 overflow-y-auto p-4 space-y-1 text-xs">
                {logs.length === 0 ? (
                  <p className="text-dim">$ awaiting execution<span className="cursor" /></p>
                ) : (
                  logs.map((l, i) => (
                    <p key={i} className={
                      l.includes("ERROR") ? "text-error" :
                      l.includes("TX:") ? "text-accent" :
                      l.includes("SUCCESS") ? "text-success" :
                      "text-dim"
                    }>
                      {l}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right - Task Board */}
          <div className="terminal-box h-fit">
            <div className="terminal-header">
              <div className="terminal-dot bg-[var(--c-error)]" />
              <div className="terminal-dot bg-[var(--c-accent)]" />
              <div className="terminal-dot bg-[var(--c-success)]" />
              <span className="text-xs text-dim ml-2">tasks.db</span>
              <span className="text-xs text-dim ml-auto">{tasks.length} records</span>
            </div>
            
            <div className="h-[400px] overflow-y-auto divide-y divide-[var(--c-gray-light)]">
              {tasks.length === 0 ? (
                <div className="p-8 text-center text-dim text-xs">
                  NO TASKS — RUN DEMO TO CREATE
                </div>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="p-4 hover:bg-[var(--c-gray)] transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold">{task.title}</span>
                      <span className={`badge ${
                        task.status === "DONE" ? "text-success border-[var(--c-success)]" :
                        task.status === "OPEN" ? "text-[var(--c-accent)] border-[var(--c-accent)]" :
                        "badge-white"
                      }`}>
                        {task.status}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span className="text-accent">{task.reward} MON</span>
                      
                      {task.escrowTx && (
                        <a
                          href={`https://monadscan.com/tx/${task.escrowTx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-dim hover:text-[var(--c-white)] transition-colors"
                        >
                          [ESCROW]
                        </a>
                      )}
                      {task.acceptTx && (
                        <a
                          href={`https://monadscan.com/tx/${task.acceptTx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-dim hover:text-[var(--c-white)] transition-colors"
                        >
                          [ACCEPT]
                        </a>
                      )}
                      {task.submitTx && (
                        <a
                          href={`https://monadscan.com/tx/${task.submitTx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-dim hover:text-[var(--c-white)] transition-colors"
                        >
                          [SUBMIT]
                        </a>
                      )}
                      {task.payoutTx && (
                        <a
                          href={`https://monadscan.com/tx/${task.payoutTx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-success hover:underline"
                        >
                          [PAYOUT]
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
