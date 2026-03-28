// ─── Task Status (const object for erasableSyntaxOnly) ──────────────
export const TaskStatus = {
  Open: "OPEN",
  Accepted: "ACCEPTED",
  Submitted: "SUBMITTED",
  Done: "DONE",
} as const;

export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus];

// ─── Task ───────────────────────────────────────────────────────────
export interface Task {
  id: string;
  title: string;
  description: string;
  reward: string;
  status: TaskStatusType;
  requester: string;
  worker: string | null;
  escrowTx: string;
  escrowVerified: boolean;
  acceptTx?: string;
  submitTx?: string;
  payoutTx: string | null;
  result: string | null;
  createdAt: number;
  updatedAt: number;
}
