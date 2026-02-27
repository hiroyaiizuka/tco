import type { ServiceContainer } from '../cli.js';
import { resolveDate } from '../utils/date.js';
import { formatTaskTable, formatOutput } from '../utils/output.js';

export async function listCommand(
  services: ServiceContainer,
  dateArg?: string,
  options: { json: boolean; slot?: string } = { json: false },
): Promise<void> {
  const dateKey = resolveDate(dateArg);
  let instances = await services.taskLoaderService.loadTasksForDate(dateKey);

  // Filter by slot if specified
  if (options.slot) {
    instances = instances.filter(i => i.slotKey === options.slot);
  }

  if (options.json) {
    const output = instances.map(i => ({
      taskId: i.task.taskId,
      name: i.task.name,
      scheduledTime: i.task.scheduledTime,
      slotKey: i.slotKey,
      instanceId: i.instanceId,
      isRoutine: i.task.isRoutine,
      routineType: i.task.routineType,
      estimatedMinutes: i.task.estimatedMinutes,
      project: i.task.project,
      reminderTime: i.task.reminderTime,
      filePath: i.task.filePath,
      date: i.date,
      state: i.state,
    }));
    console.log(formatOutput({ date: dateKey, tasks: output, count: output.length }, true));
  } else {
    console.log(formatTaskTable(instances, dateKey));
  }
}
