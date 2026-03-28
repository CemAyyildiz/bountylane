export const TaskStatus = [
  "OPEN",
  "ACCEPTED",
  "SUBMITTED",
  "DONE",
  "CANCELLED",
] as const;

export type TaskStatusType = (typeof TaskStatus)[number];

export interface Task {
  id: string;
  title: string;
  description: string;
  reward: string;
  requester: string;
  worker: string | null;
  status: TaskStatusType | "UNKNOWN";
  result: string | null;
  escrowTx: string | null;
  acceptTx: string | null;
  submitTx: string | null;
  payoutTx: string | null;
  createdAt: string;
}