import type { ServiceContainer } from '../cli.js';
import { normalizeReminderTime } from '../services/FrontmatterService.js';
import { formatOutput } from '../utils/output.js';
import { isValidTaskId } from '../utils/security.js';

interface RemindOptions {
  json: boolean;
  time?: string;
  clear: boolean;
}

export async function remindCommand(
  services: ServiceContainer,
  taskId: string,
  options: RemindOptions = { json: false, clear: false },
): Promise<void> {
  if (!isValidTaskId(taskId)) {
    const msg = `Invalid taskId format: "${taskId}". Expected "tc-task-<id>".`;
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }

  if (!options.time && !options.clear) {
    const msg = 'Specify --time <HH:mm> to set or --clear to remove a reminder.';
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }

  const task = await services.taskMutationService.findTaskByTaskId(taskId);
  if (!task) {
    const msg = `Task not found: ${taskId}`;
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }

  if (options.clear) {
    await services.frontmatterService.updateFrontmatter(task.filePath, {
      reminder_time: undefined,
    });

    if (options.json) {
      console.log(formatOutput({ success: true, taskId, action: 'clear_reminder', filePath: task.filePath }, true));
    } else {
      console.log(`Cleared reminder for task ${taskId}`);
    }
    return;
  }

  // Validate and normalize time
  const normalized = normalizeReminderTime(options.time);
  if (!normalized) {
    const msg = `Invalid time format: "${options.time}". Use HH:mm.`;
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }

  await services.frontmatterService.updateFrontmatter(task.filePath, {
    reminder_time: normalized,
  });

  if (options.json) {
    console.log(formatOutput({
      success: true,
      taskId,
      action: 'set_reminder',
      reminderTime: normalized,
      filePath: task.filePath,
    }, true));
  } else {
    console.log(`Set reminder for task ${taskId} at ${normalized}`);
  }
}
