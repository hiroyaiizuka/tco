import { randomUUID } from 'node:crypto';

/** Generate a unique task ID in the format tc-task-<uuid> */
export function generateTaskId(): string {
  return `tc-task-${randomUUID()}`;
}

/** Generate a unique instance ID for a task on a given date */
export function generateInstanceId(taskId: string, dateKey: string): string {
  return `${taskId}::${dateKey}`;
}
