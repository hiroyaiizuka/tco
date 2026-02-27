import type { TaskInstance } from '../types/index.js';

/**
 * Format task instances as a human-readable table.
 */
export function formatTaskTable(instances: TaskInstance[], dateKey: string): string {
  if (instances.length === 0) {
    return `No tasks for ${dateKey}.`;
  }

  const lines: string[] = [];
  lines.push(`Tasks for ${dateKey} (${instances.length} tasks):`);
  lines.push('');

  // Header
  const header = padRow(['#', 'Time', 'Name', 'Slot', 'TaskId']);
  lines.push(header);
  lines.push('-'.repeat(header.length));

  instances.forEach((inst, i) => {
    const time = inst.task.scheduledTime || '--:--';
    const name = inst.task.name;
    const slot = inst.slotKey === 'none' ? '-' : inst.slotKey;
    const taskId = inst.task.taskId || '-';
    lines.push(padRow([
      String(i + 1),
      time,
      name.length > 30 ? name.slice(0, 27) + '...' : name,
      slot,
      taskId.length > 20 ? taskId.slice(0, 17) + '...' : taskId,
    ]));
  });

  return lines.join('\n');
}

function padRow(cols: string[]): string {
  const widths = [4, 6, 32, 16, 22];
  return cols.map((col, i) => col.padEnd(widths[i] || 10)).join('  ');
}

/**
 * Format output as JSON or human-readable.
 */
export function formatOutput(data: unknown, json: boolean): string {
  if (json) {
    return JSON.stringify(data, null, 2);
  }
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}
