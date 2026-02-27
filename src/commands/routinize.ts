import type { ServiceContainer } from '../cli.js';
import type { RoutineType } from '../types/index.js';
import { formatOutput } from '../utils/output.js';
import { parseDate, formatDate } from '../utils/date.js';
import { parseStrictInteger } from '../utils/number.js';

interface RoutinizeOptions {
  json: boolean;
  type: string;
  interval: number;
  weekday?: string;
  week?: string;
  monthday?: string;
  start?: string;
  end?: string;
}

const VALID_ROUTINE_TYPES = ['daily', 'weekly', 'monthly', 'monthly_date'];

// Fields to clean up when switching routine types
const ROUTINE_FIELDS_TO_CLEAN = [
  'routine_weekday', 'routine_weekdays', 'weekdays',
  'weekday',
  'routine_week', 'routine_weeks',
  'routine_monthday', 'routine_monthdays',
];

function parseWeekdays(value: string): number[] {
  return value.split(',').map(s => parseStrictInteger(s.trim()));
}

function parseWeeks(value: string): Array<number | 'last'> {
  return value.split(',').map((s) => {
    const trimmed = s.trim();
    return trimmed === 'last' ? 'last' : parseStrictInteger(trimmed);
  });
}

function parseMonthdays(value: string): Array<number | 'last'> {
  return value.split(',').map((s) => {
    const trimmed = s.trim();
    return trimmed === 'last' ? 'last' : parseStrictInteger(trimmed);
  });
}

export async function routinizeCommand(
  services: ServiceContainer,
  taskId: string,
  options: RoutinizeOptions = { json: false, type: 'daily', interval: 1 },
): Promise<void> {
  let parsedStartDate: Date | undefined;
  let parsedEndDate: Date | undefined;

  if (!VALID_ROUTINE_TYPES.includes(options.type)) {
    const msg = `Invalid routine type: "${options.type}". Use: ${VALID_ROUTINE_TYPES.join(', ')}`;
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

  const routineType = options.type as RoutineType;

  // Validate interval
  if (!Number.isFinite(options.interval) || options.interval < 1) {
    const msg = `Invalid interval: "${options.interval}". Must be a positive integer.`;
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }

  if (options.interval > 1 && options.start === undefined) {
    const msg = '--start is required when --interval is greater than 1.';
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }

  // Validate required params per routine type
  if (routineType === 'weekly' && options.weekday === undefined) {
    const msg = '--weekday is required for weekly routines. Use 0 (Sun) to 6 (Sat).';
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }
  if (routineType === 'monthly') {
    if (options.week === undefined) {
      const msg = '--week is required for monthly routines. Use 1-5 or "last".';
      if (options.json) {
        console.log(formatOutput({ success: false, error: msg }, true));
      } else {
        console.error(msg);
      }
      process.exit(1);
      return;
    }
    if (options.weekday === undefined) {
      const msg = '--weekday is required for monthly routines. Use 0 (Sun) to 6 (Sat).';
      if (options.json) {
        console.log(formatOutput({ success: false, error: msg }, true));
      } else {
        console.error(msg);
      }
      process.exit(1);
      return;
    }
  }
  if (routineType === 'monthly_date' && options.monthday === undefined) {
    const msg = '--monthday is required for monthly_date routines. Use 1-31 or "last".';
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }

  if (options.start) {
    const parsedStart = parseDate(options.start);
    const isValidStart = parsedStart !== null && formatDate(parsedStart) === options.start;
    if (!isValidStart) {
      const msg = `Invalid start date: "${options.start}". Use a real date in YYYY-MM-DD format.`;
      if (options.json) {
        console.log(formatOutput({ success: false, error: msg }, true));
      } else {
        console.error(msg);
      }
      process.exit(1);
      return;
    }
    parsedStartDate = parsedStart;
  }

  if (options.end) {
    const parsedEnd = parseDate(options.end);
    const isValidEnd = parsedEnd !== null && formatDate(parsedEnd) === options.end;
    if (!isValidEnd) {
      const msg = `Invalid end date: "${options.end}". Use a real date in YYYY-MM-DD format.`;
      if (options.json) {
        console.log(formatOutput({ success: false, error: msg }, true));
      } else {
        console.error(msg);
      }
      process.exit(1);
      return;
    }
    parsedEndDate = parsedEnd;
  }

  if (parsedStartDate && parsedEndDate && parsedEndDate.getTime() < parsedStartDate.getTime()) {
    const msg = `Invalid end date: "${options.end}". End date must be on or after start date "${options.start}".`;
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }

  // Build frontmatter updates
  const updates: Record<string, unknown> = {
    isRoutine: true,
    routine_type: routineType,
    routine_interval: options.interval,
    routine_enabled: true,
  };

  // Clean up fields from other routine types
  for (const field of ROUTINE_FIELDS_TO_CLEAN) {
    updates[field] = undefined;
  }

  // Set type-specific fields
  switch (routineType) {
    case 'daily':
      // interval is already set
      break;

    case 'weekly':
      if (options.weekday !== undefined) {
        const weekdays = parseWeekdays(options.weekday);
        if (weekdays.some(w => Number.isNaN(w) || w < 0 || w > 6)) {
          const msg = 'Invalid weekday. Use 0 (Sun) to 6 (Sat).';
          if (options.json) {
            console.log(formatOutput({ success: false, error: msg }, true));
          } else {
            console.error(msg);
          }
          process.exit(1);
          return;
        }
        if (weekdays.length === 1) {
          updates.routine_weekday = weekdays[0];
          updates.weekday = weekdays[0];
        } else {
          updates.routine_weekdays = weekdays;
          updates.weekdays = weekdays;
        }
      }
      break;

    case 'monthly':
      if (options.week !== undefined) {
        const weeks = parseWeeks(options.week);
        for (const w of weeks) {
          if (w !== 'last' && (Number.isNaN(w) || w < 1 || w > 5)) {
            const msg = 'Invalid week. Use 1-5 or "last".';
            if (options.json) {
              console.log(formatOutput({ success: false, error: msg }, true));
            } else {
              console.error(msg);
            }
            process.exit(1);
            return;
          }
        }
        if (weeks.length === 1) {
          updates.routine_week = weeks[0];
        } else {
          updates.routine_weeks = weeks;
        }
      }
      if (options.weekday !== undefined) {
        const weekdays = parseWeekdays(options.weekday);
        if (weekdays.some(w => Number.isNaN(w) || w < 0 || w > 6)) {
          const msg = 'Invalid weekday. Use 0 (Sun) to 6 (Sat).';
          if (options.json) {
            console.log(formatOutput({ success: false, error: msg }, true));
          } else {
            console.error(msg);
          }
          process.exit(1);
          return;
        }
        if (weekdays.length === 1) {
          updates.routine_weekday = weekdays[0];
        } else {
          updates.routine_weekdays = weekdays;
        }
      }
      break;

    case 'monthly_date':
      if (options.monthday !== undefined) {
        const monthdays = parseMonthdays(options.monthday);
        for (const d of monthdays) {
          if (d !== 'last' && (Number.isNaN(d) || d < 1 || d > 31)) {
            const msg = 'Invalid monthday. Use 1-31 or "last".';
            if (options.json) {
              console.log(formatOutput({ success: false, error: msg }, true));
            } else {
              console.error(msg);
            }
            process.exit(1);
            return;
          }
        }
        if (monthdays.length === 1) {
          updates.routine_monthday = monthdays[0];
        } else {
          updates.routine_monthdays = monthdays;
        }
      }
      break;
  }

  // Set start/end dates if provided
  if (options.start) {
    updates.routine_start = options.start;
    updates.target_date = undefined;
  }
  if (options.end) updates.routine_end = options.end;

  await services.frontmatterService.updateFrontmatter(task.filePath, updates);

  if (options.json) {
    console.log(formatOutput({
      success: true,
      taskId,
      action: 'routinize',
      routineType,
      interval: options.interval,
      filePath: task.filePath,
    }, true));
  } else {
    console.log(`Routinized task ${taskId} as ${routineType} (interval: ${options.interval})`);
    console.log(`  File: ${task.filePath}`);
  }
}
