import type { ServiceContainer } from '../cli.js';
import { resolveDate } from '../utils/date.js';
import { formatOutput } from '../utils/output.js';

interface DeleteOptions {
  json: boolean;
  permanent: boolean;
  date?: string;
}

export async function deleteCommand(
  services: ServiceContainer,
  taskId: string,
  options: DeleteOptions = { json: false, permanent: false },
): Promise<void> {
  const dateKey = resolveDate(options.date);

  try {
    await services.taskMutationService.deleteTask(taskId, dateKey, options.permanent);

    const deletionType = options.permanent ? 'permanent' : 'temporary';

    if (options.json) {
      console.log(formatOutput({
        success: true,
        taskId,
        action: 'delete',
        deletionType,
        date: dateKey,
      }, true));
    } else {
      console.log(`Deleted task ${taskId} (${deletionType}) for ${dateKey}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exit(1);
  }
}
