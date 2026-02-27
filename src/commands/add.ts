import type { ServiceContainer } from '../cli.js';
import { resolveDate, isValidTime } from '../utils/date.js';
import { generateTaskId } from '../utils/id.js';
import { formatOutput } from '../utils/output.js';
import { isSafeString, MAX_TASK_NAME_LENGTH, MAX_ESTIMATE_MINUTES, MAX_REMIND_MINUTES } from '../utils/security.js';

interface AddOptions {
  json: boolean;
  date?: string;
  time?: string;
  estimate?: number;
  project?: string;
  remind?: number;
}

export async function addCommand(
  services: ServiceContainer,
  name: string,
  options: AddOptions = { json: false },
): Promise<void> {
  const hasPathSeparator = /[\\/]/.test(name);
  const hasTraversalSegment = name.includes('..');
  if (hasPathSeparator || hasTraversalSegment) {
    const msg = `Invalid task name: "${name}". Task name must not contain "/", "\\\\", or "..".`;
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }

  if (!isSafeString(name)) {
    const msg = `Invalid task name: contains control characters. Task name must not contain control characters or null bytes.`;
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }

  if (name.length > MAX_TASK_NAME_LENGTH) {
    const msg = `Invalid task name: too long (${name.length} chars). Maximum is ${MAX_TASK_NAME_LENGTH} characters.`;
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }

  const dateKey = resolveDate(options.date);
  const taskId = generateTaskId();
  const taskFolderPath = services.pathService.getTaskFolderPath();

  // Ensure unique filename
  let fileName = name;
  let counter = 1;
  while (services.vault.fileExists(`${taskFolderPath}/${fileName}.md`)) {
    fileName = `${name} (${counter})`;
    counter++;
  }

  const filePath = `${taskFolderPath}/${fileName}.md`;

  // Build frontmatter
  const frontmatter: Record<string, unknown> = {
    target_date: dateKey,
    taskId,
    tags: ['task'],
  };

  if (options.time) {
    // Validate HH:mm format with range check (0-23 hours, 0-59 minutes)
    if (!isValidTime(options.time)) {
      const msg = `Invalid time format: "${options.time}". Use HH:mm (0-23 hours, 0-59 minutes).`;
      if (options.json) {
        console.log(formatOutput({ success: false, error: msg }, true));
      } else {
        console.error(msg);
      }
      process.exit(1);
      return;
    }
    frontmatter.scheduled_time = options.time;
  }

  if (options.estimate !== undefined) {
    if (!Number.isFinite(options.estimate) || options.estimate < 0 || options.estimate > MAX_ESTIMATE_MINUTES) {
      const msg = `Invalid estimate value: "${options.estimate}". Must be 0-${MAX_ESTIMATE_MINUTES} minutes.`;
      if (options.json) {
        console.log(formatOutput({ success: false, error: msg }, true));
      } else {
        console.error(msg);
      }
      process.exit(1);
      return;
    }
    frontmatter.estimatedMinutes = options.estimate;
  }

  if (options.project) {
    frontmatter.project = options.project;
  }

  // Calculate reminder_time from --remind and --time
  if (options.remind !== undefined) {
    if (!options.time) {
      const msg = '--remind requires --time to be set.';
      if (options.json) {
        console.log(formatOutput({ success: false, error: msg }, true));
      } else {
        console.error(msg);
      }
      process.exit(1);
      return;
    }

    if (!Number.isFinite(options.remind) || options.remind < 0 || options.remind > MAX_REMIND_MINUTES) {
      const msg = `Invalid remind value: "${options.remind}". Must be 0-${MAX_REMIND_MINUTES} minutes.`;
      if (options.json) {
        console.log(formatOutput({ success: false, error: msg }, true));
      } else {
        console.error(msg);
      }
      process.exit(1);
      return;
    }

    const [h, m] = options.time.split(':').map(Number);
    const totalMinutes = h * 60 + m - options.remind;
    if (totalMinutes < 0) {
      const msg = `Reminder time would be before midnight. Adjust --remind value.`;
      if (options.json) {
        console.log(formatOutput({ success: false, error: msg }, true));
      } else {
        console.error(msg);
      }
      process.exit(1);
      return;
    }
    const rh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const rm = String(totalMinutes % 60).padStart(2, '0');
    frontmatter.reminder_time = `${rh}:${rm}`;
  }

  const bodyContent = `\n# ${name}\n`;

  await services.frontmatterService.createFile(filePath, frontmatter, bodyContent);

  if (options.json) {
    console.log(formatOutput({
      success: true,
      taskId,
      name,
      filePath,
      date: dateKey,
      scheduledTime: frontmatter.scheduled_time,
      reminderTime: frontmatter.reminder_time,
    }, true));
  } else {
    console.log(`Created task: ${name}`);
    console.log(`  ID: ${taskId}`);
    console.log(`  Date: ${dateKey}`);
    console.log(`  File: ${filePath}`);
    if (frontmatter.scheduled_time) console.log(`  Time: ${frontmatter.scheduled_time}`);
    if (frontmatter.reminder_time) console.log(`  Reminder: ${frontmatter.reminder_time}`);
  }
}
