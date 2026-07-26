import { isRecordActive } from "./policy.mjs";

export function formatRecordStatus(record, now) {
  return `${record.id}: ${isRecordActive(record, now) ? "active" : "expired"}`;
}
