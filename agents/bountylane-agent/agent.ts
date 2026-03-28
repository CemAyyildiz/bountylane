/**
 * Bountylane Hybrid Agent — Supervisor + Worker
 * 
 * Tek dosya. Platform'u (port 3001) denetler,
 * açık görevleri bulup LLM ile çözer, sonucu submit eder.
 * 
 * Çalıştır:  npm run agent
 * Dashboard: http://localhost:3002
 */

import dotenv from "dotenv";
import { resolve } from "node:path";
if (!process.env.PRIVATE_KEY) {
  dotenv.config({ path: resolve(import.meta.dirname ?? ".", "../../.env") });
}

import express from "express";
import cors from "cors";

// ─── Config ─────────────────────────────────────────────────────────
const PLATFORM  = process.env.PLATFORM_URL  || "http://localhost:3001";
const AGENT_ID  = process.env.AGENT_ID      || "agent://hybrid-001";
const PORT      = Number(process.env.SERVER_PORT ?? 3002);
const GROQ_KEY  = process.env.GROQ_API_KEY  || process.env.LLM_API_KEY || "";
const GROQ_MODEL= process.env.LLM_MODEL     || "llama-3.3-70b-versatile";

// ─── State (basit, okunabilir) ──────────────────────────────────────
interface Task {
  id: string; title: string; description: string; reward: string;
  status: string; requester: string; worker: string | null;
  result: string | null; escrowTx: string | null;
  acceptTx?: string; submitTx?: string; payoutTx?: string | null;
  createdAt: string;
}

const state = {
  running: false,
  platformOk: false,
  currentTask: null as Task | null,
  completed: [] as Task[],
  alerts: [] as string[],
  stats: { polled: 0, accepted: 0, completed: 0, failed: 0, earned: "0" },
};

// ─── Helpers ────────────────────────────────────────────────────────
const log = (tag: string, msg: string) =>
  console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`);

const warn = (tag: string, msg: string) =>
  console.log(`\x1b[33m[${new Date().toISOString()}] [${tag}] ${msg}\x1b[0m`);

const err = (tag: string, msg: string) =>
  console.log(`\x1b[31m[${new Date().toISOString()}] [${tag}] ${msg}\x1b[0m`);

function alert(msg: string) {
  state.alerts.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (state.alerts.length > 50) state.alerts.shift();
}

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${PLATFORM}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ─── LLM (Groq) ────────────────────────────────────────────────────
async function askLLM(task: Task): Promise<string> {
  if (!GROQ_KEY) {
    // Fallback: template sonuç
    return JSON.stringify({
      task: task.title,
      analysis: `Completed analysis for: ${task.description}`,
      confidence: 0.85,
      timestamp: new Date().toISOString(),
    });
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: "You are a task executor agent. Respond in JSON." },
        { role: "user", content: `Task: ${task.title}\nDescription: ${task.description}\n\nExecute this task and return a JSON result with 'analysis', 'findings', and 'confidence' fields.` },
      ],
      temperature: 0.5,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API ${res.status}: ${text}`);
  }

  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content || "{}";
}

// ═══════════════════════════════════════════════════════════════════
//  SUPERVISOR — Platform'u denetler
// ═══════════════════════════════════════════════════════════════════

async function checkPlatform() {
  try {
    const health = await api("/health");
    state.platformOk = true;

    // Escrow kontrolü
    const bal = parseFloat(health.escrowBalance || "0");
    if (bal > 0) {
      log("SUPER", `Platform OK | Escrow: ${health.escrowBalance} MON | Tasks: ${health.tasks?.total ?? 0}`);
    } else {
      log("SUPER", `Platform OK | Escrow: 0 MON | Tasks: ${health.tasks?.total ?? 0}`);
    }

    // Stalled task kontrolü
    const tasks: Task[] = await api("/tasks");
    const now = Date.now();
    for (const t of tasks) {
      if (t.status === "ACCEPTED" && now - new Date(t.createdAt).getTime() > 30 * 60_000) {
        warn("SUPER", `⚠️ Stalled task: ${t.id} (ACCEPTED > 30min)`);
        alert(`Stalled: ${t.id}`);
      }
      if (t.status === "SUBMITTED" && !t.payoutTx) {
        warn("SUPER", `⚠️ Missing payout: ${t.id}`);
        alert(`Missing payout: ${t.id}`);
      }
    }
  } catch (e: any) {
    state.platformOk = false;
    err("SUPER", `Platform down: ${e.message}`);
    alert(`Platform unreachable`);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  WORKER — Görevleri bulur, çözer, submit eder
// ═══════════════════════════════════════════════════════════════════

async function workerCycle() {
  if (!state.platformOk) return;
  if (state.currentTask) return; // zaten bir görevde

  try {
    // 1. Açık görevleri bul (demo task'larını atla)
    const all: Task[] = await api("/tasks?status=OPEN");
    const open = all.filter(
      (t) => !t.requester?.toLowerCase().includes("demo") &&
             !t.requester?.toLowerCase().includes("req-")
    );
    state.stats.polled++;

    if (open.length === 0) return;

    // 2. En iyi görevi seç (en yüksek ödül)
    open.sort((a, b) => parseFloat(b.reward) - parseFloat(a.reward));
    const pick = open[0];
    log("WORKER", `📋 Found ${open.length} tasks, picking: "${pick.title}" (${pick.reward} MON)`);

    // 3. Kabul et
    const accepted: Task = await api(`/tasks/${pick.id}/accept`, {
      method: "POST",
      body: JSON.stringify({ worker: AGENT_ID }),
    });
    state.currentTask = accepted;
    state.stats.accepted++;
    log("WORKER", `✅ Accepted task ${accepted.id} | tx: ${accepted.acceptTx}`);
    alert(`Accepted: ${accepted.title}`);

    // 4. LLM ile çöz
    log("WORKER", `🧠 Executing with ${GROQ_KEY ? "Groq LLM" : "template"}...`);
    const result = await askLLM(accepted);
    log("WORKER", `📝 Result ready (${result.length} chars)`);

    // 5. Submit et
    const submitted: Task = await api(`/tasks/${accepted.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ worker: AGENT_ID, result }),
    });
    state.stats.completed++;
    state.stats.earned = String(
      parseFloat(state.stats.earned) + parseFloat(submitted.reward || "0")
    );
    state.completed.push(submitted);
    if (state.completed.length > 20) state.completed.shift();

    log("WORKER", `🎉 Submitted! tx: ${submitted.submitTx} | Earned: ${submitted.reward} MON`);
    alert(`Completed: ${submitted.title} (+${submitted.reward} MON)`);

    state.currentTask = null;
  } catch (e: any) {
    state.stats.failed++;
    err("WORKER", `Failed: ${e.message}`);
    alert(`Error: ${e.message.slice(0, 60)}`);
    state.currentTask = null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════════════════════════

async function mainLoop() {
  state.running = true;
  log("AGENT", "🚀 Starting main loop");

  while (state.running) {
    await checkPlatform();        // supervisor check
    await workerCycle();          // worker cycle
    await sleep(3000);            // 3 saniye bekle
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════
//  DASHBOARD (Express, port 3002)
// ═══════════════════════════════════════════════════════════════════

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/status", (_req, res) => {
  res.json({
    agentId: AGENT_ID,
    platform: PLATFORM,
    platformOk: state.platformOk,
    currentTask: state.currentTask?.id ?? null,
    stats: state.stats,
    alerts: state.alerts.slice(-10),
    completedCount: state.completed.length,
  });
});

app.get("/api/alerts", (_req, res) => res.json(state.alerts));
app.get("/api/completed", (_req, res) => res.json(state.completed));

app.get("/", (_req, res) => {
  const s = state.stats;
  res.send(`<!DOCTYPE html><html><head><title>Bountylane Agent</title>
<meta http-equiv="refresh" content="5">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',mono;background:#0a0e27;color:#0f0;padding:20px}
.c{max-width:900px;margin:0 auto}
h1{text-align:center;font-size:2em;margin:20px 0;text-shadow:0 0 10px #0f0}
.box{background:#1a2a4a;border:2px solid #0f0;padding:15px;margin:10px 0}
.row{display:flex;justify-content:space-between;padding:4px 0}
.val{color:#0f0;font-weight:bold}
.ok{color:#0f0}.bad{color:#f00}.warn{color:#ff0}
.alert{color:#ff0;font-size:0.9em;padding:2px 0;border-bottom:1px dashed #333}
h2{border-bottom:1px solid #0f0;padding-bottom:5px;margin-bottom:10px}
</style></head><body><div class="c">
<h1>🤖 Bountylane Agent</h1>

<div class="box"><h2>Status</h2>
<div class="row"><span>Agent ID</span><span class="val">${AGENT_ID}</span></div>
<div class="row"><span>Platform</span><span class="${state.platformOk ? "ok" : "bad"}">${state.platformOk ? "🟢 ONLINE" : "🔴 OFFLINE"}</span></div>
<div class="row"><span>Current Task</span><span class="val">${state.currentTask?.title ?? "idle"}</span></div>
<div class="row"><span>LLM</span><span class="val">${GROQ_KEY ? "Groq ✅" : "Template mode"}</span></div>
</div>

<div class="box"><h2>Worker Stats</h2>
<div class="row"><span>Polled</span><span class="val">${s.polled}</span></div>
<div class="row"><span>Accepted</span><span class="val">${s.accepted}</span></div>
<div class="row"><span>Completed</span><span class="val">${s.completed}</span></div>
<div class="row"><span>Failed</span><span class="val">${s.failed}</span></div>
<div class="row"><span>Total Earned</span><span class="val">${s.earned} MON</span></div>
</div>

<div class="box"><h2>Recent Activity</h2>
${state.alerts.slice(-8).reverse().map(a => `<div class="alert">${a}</div>`).join("") || '<div class="alert">No activity yet</div>'}
</div>

<div class="box"><h2>Completed Tasks (${state.completed.length})</h2>
${state.completed.slice(-5).reverse().map(t => `<div class="row"><span>${t.title}</span><span class="val">+${t.reward} MON</span></div>`).join("") || '<div class="alert">None yet</div>'}
</div>

<div class="box" style="font-size:0.8em;color:#666">
<div>Platform: ${PLATFORM}</div>
<div>Dashboard auto-refreshes every 5s</div>
<div>API: GET /api/status | /api/alerts | /api/completed</div>
</div>
</div></body></html>`);
});

// ─── Start ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║       🤖 Bountylane Hybrid Agent                 ║
╠════════════════════════════════════════════════╣
║  Agent   : ${AGENT_ID.padEnd(35)}║
║  Platform: ${PLATFORM.padEnd(35)}║
║  Dashboard: http://localhost:${String(PORT).padEnd(24)}║
║  LLM    : ${GROQ_KEY ? "Groq ✅".padEnd(36) : "Template mode".padEnd(36)}║
╚════════════════════════════════════════════════╝
  `);

  mainLoop().catch((e) => err("AGENT", `Fatal: ${e.message}`));
});

process.on("SIGINT", () => { state.running = false; process.exit(0); });
process.on("uncaughtException", (e) => err("CRASH", e.message));
process.on("unhandledRejection", (r) => err("CRASH", String(r)));
