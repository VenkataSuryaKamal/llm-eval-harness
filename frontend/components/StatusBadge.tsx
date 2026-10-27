import { Run } from "@/lib/api";

export function StatusBadge({ run }: { run: Pick<Run, "status" | "completed_calls" | "total_calls"> }) {
  const cls = run.status === "completed" ? "good" : run.status === "failed" ? "bad" : "warn";
  const text = run.status === "running" ? `running ${run.completed_calls}/${run.total_calls}` : run.status;
  return <span className={`badge ${cls}`}>{text}</span>;
}
