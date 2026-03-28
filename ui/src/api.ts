import type { Task } from "./types";

const isProduction = import.meta.env.PROD;
const API = isProduction ? "/proxy/api" : "http://localhost:3001";
const AGENT_API = isProduction ? "/proxy/agent" : "http://localhost:3002";

// Contract address (same as deployed)
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "0xB0470F3Aa9ff5e2ce0810444d9d1A4a21B18661C";

// ─── Agent Status ───────────────────────────────────────────────────
export interface AgentStatus {
  agentId: string;
  platform: string;
  platformOk: boolean;
  currentTask: string | null;
  stats: {
    polled: number;
    accepted: number;
    completed: number;
    failed: number;
    earned: string;
  };
  alerts: string[];
  completedCount: number;
}

export async function getAgentStatus(): Promise<AgentStatus> {
  const res = await fetch(`${AGENT_API}/api/status`);
  if (!res.ok) throw new Error("Agent offline");
  return res.json();
}

export async function getAgentCompleted(): Promise<Task[]> {
  try {
    // Önce agent'ın kendi completed listesini dene
    const res = await fetch(`${AGENT_API}/api/completed`);
    if (res.ok) {
      const agentCompleted = await res.json();
      if (agentCompleted.length > 0) return agentCompleted;
    }
  } catch {}
  
  // Agent listesi boşsa platform'daki DONE görevleri getir
  try {
    const res = await fetch(`${API}/tasks?status=DONE`);
    if (res.ok) return res.json();
  } catch {}
  
  return [];
}

// ─── Health ─────────────────────────────────────────────────────────
export async function getHealth(): Promise<any> {
  const res = await fetch(`${API}/health`);
  if (!res.ok) throw new Error("Platform offline");
  return res.json();
}

// ─── Tasks ──────────────────────────────────────────────────────────
export async function getTasks(status?: string): Promise<Task[]> {
  const url = status ? `${API}/tasks?status=${status}` : `${API}/tasks`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tasks");
  return res.json();
}

export async function getTask(id: string): Promise<Task> {
  const res = await fetch(`${API}/tasks/${id}`);
  if (!res.ok) throw new Error("Task not found");
  return res.json();
}

// ─── Create task (on-chain via platform) ───────────────────────────
export async function createTask(opts: {
  title: string;
  description: string;
  reward: string;
  requester: string;
}): Promise<Task> {
  const res = await fetch(`${API}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to create task");
  }
  return res.json();
}

// ─── Worker: Accept task (on-chain via platform) ───────────────────
export async function acceptTask(
  taskId: string,
  worker: string
): Promise<Task> {
  const res = await fetch(`${API}/tasks/${taskId}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worker }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to accept task");
  }
  return res.json();
}

// ─── Worker: Submit result (on-chain via platform) ─────────────────
export async function submitTask(
  taskId: string,
  worker: string,
  result: string
): Promise<Task> {
  const res = await fetch(`${API}/tasks/${taskId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worker, result }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to submit result");
  }
  return res.json();
}

// ─── SSE ────────────────────────────────────────────────────────────
export function connectSSE(
  onEvent: (event: string, data: any) => void
): () => void {
  const es = new EventSource(`${API}/events`);

  es.addEventListener("connected", (e) =>
    onEvent("connected", JSON.parse(e.data))
  );
  es.addEventListener("task:created", (e) =>
    onEvent("task:created", JSON.parse(e.data))
  );
  es.addEventListener("task:updated", (e) =>
    onEvent("task:updated", JSON.parse(e.data))
  );
  es.onerror = () => onEvent("error", { message: "SSE connection lost" });

  return () => es.close();
}
