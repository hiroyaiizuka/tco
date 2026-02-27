import type { ServiceContainer } from '../cli.js';
import { resolveDate } from '../utils/date.js';
import { formatOutput } from '../utils/output.js';
import { SectionConfigService } from '../services/SectionConfigService.js';

interface MoveOptions {
  json: boolean;
  date?: string;
  slot?: string;
  from?: string;
}

export async function moveCommand(
  services: ServiceContainer,
  taskId: string,
  options: MoveOptions = { json: false },
): Promise<void> {
  if (!options.date && !options.slot) {
    const msg = 'Specify --date or --slot for the move operation.';
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
  }

  const fromDate = resolveDate(options.from);
  const result: Record<string, unknown> = { success: true, taskId };
  const messages: string[] = [];

  try {
    if (options.slot) {
      const settings = services.settingsService.getSettings();
      const sectionConfig = new SectionConfigService(settings.customSections);
      if (!sectionConfig.isValidSlotKey(options.slot)) {
        const available = [...sectionConfig.getSlotKeys(), 'none'];
        throw new Error(`Invalid slot key: "${options.slot}". Use one of: ${available.join(', ')}`);
      }
    }

    if (options.date) {
      const toDate = resolveDate(options.date);
      await services.taskMutationService.moveToDate(taskId, fromDate, toDate);
      result.movedDate = { from: fromDate, to: toDate };
      messages.push(`Moved task ${taskId} from ${fromDate} to ${toDate}`);
    }

    if (options.slot) {
      const dateKey = options.date ? resolveDate(options.date) : fromDate;
      await services.taskMutationService.moveToSlot(taskId, dateKey, options.slot);
      result.movedSlot = { date: dateKey, slot: options.slot };
      messages.push(`Moved task ${taskId} to slot "${options.slot}" on ${dateKey}`);
    }

    if (options.json) {
      console.log(formatOutput(result, true));
    } else {
      messages.forEach(m => console.log(m));
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
