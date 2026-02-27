import { Command, CommanderError } from 'commander';
import { ConfigService } from './services/ConfigService.js';
import { VaultService } from './services/VaultService.js';
import { SettingsService } from './services/SettingsService.js';
import { PathService } from './services/PathService.js';
import { FrontmatterService } from './services/FrontmatterService.js';
import { DayStateService } from './services/DayStateService.js';
import { TaskLoaderService } from './services/TaskLoaderService.js';
import { TaskMutationService } from './services/TaskMutationService.js';
import { initCommand } from './commands/init.js';
import { listCommand } from './commands/list.js';
import { addCommand } from './commands/add.js';
import { moveCommand } from './commands/move.js';
import { deleteCommand } from './commands/delete.js';
import { routinizeCommand } from './commands/routinize.js';
import { remindCommand } from './commands/remind.js';
import { parseStrictInteger } from './utils/number.js';
import { formatCliFatalError, isJsonModeFromArgv } from './utils/cli-error.js';

export interface ServiceContainer {
  configService: ConfigService;
  vault: VaultService;
  settingsService: SettingsService;
  pathService: PathService;
  frontmatterService: FrontmatterService;
  dayStateService: DayStateService;
  taskLoaderService: TaskLoaderService;
  taskMutationService: TaskMutationService;
}

async function createServices(vaultPath: string): Promise<ServiceContainer> {
  const configService = new ConfigService();
  const vault = new VaultService(vaultPath);
  const settingsService = new SettingsService(vault);
  await settingsService.loadSettings();
  const pathService = new PathService(settingsService.getSettings());
  const frontmatterService = new FrontmatterService(vault);
  const dayStateService = new DayStateService(vault, pathService);
  const taskLoaderService = new TaskLoaderService(vault, pathService, frontmatterService, dayStateService, settingsService);
  const taskMutationService = new TaskMutationService(vault, pathService, frontmatterService, dayStateService);

  return {
    configService,
    vault,
    settingsService,
    pathService,
    frontmatterService,
    dayStateService,
    taskLoaderService,
    taskMutationService,
  };
}

// Helper to resolve services for commands that need vault access
async function withServices(
  program: Command,
  fn: (services: ServiceContainer, options: { json: boolean }) => Promise<void>,
): Promise<void> {
  const opts = program.opts() as { vault?: string; json: boolean };
  const configService = new ConfigService();
  const unresolvedVaultPath = await configService.resolveVaultPath(opts.vault);
  const vaultPath = configService.validateObsidianVaultPath(unresolvedVaultPath);
  const services = await createServices(vaultPath);
  await fn(services, { json: opts.json });
}

function normalizeCommanderErrorMessage(message: string): string {
  return message.replace(/^error:\s*/i, '');
}

function applyExitOverrideRecursively(command: Command): void {
  command.exitOverride();
  for (const subcommand of command.commands) {
    applyExitOverrideRecursively(subcommand);
  }
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('tco')
    .description('TaskChute for Obsidian CLI - AI agent-friendly task management')
    .version('0.1.0')
    .option('--vault <path>', 'Path to Obsidian vault')
    .option('--json', 'Output as JSON', false);

  // tco init
  program
    .command('init')
    .description('Initialize tco with vault path')
    .argument('[vaultPath]', 'Path to Obsidian vault')
    .action(async (vaultPath?: string) => {
      const opts = program.opts() as { json: boolean };
      await initCommand(vaultPath, { json: opts.json });
    });

  // tco list [date]
  program
    .command('list')
    .description('List tasks for a date')
    .argument('[date]', 'Date (YYYY-MM-DD, "today", "tomorrow", "yesterday")')
    .option('--slot <key>', 'Filter by slot key')
    .action(async (date?: string, cmdOpts?: { slot?: string }) => {
      await withServices(program, async (services, { json }) => {
        await listCommand(services, date, { json, slot: cmdOpts?.slot });
      });
    });

  // tco add <name>
  program
    .command('add')
    .description('Add a new task')
    .argument('<name>', 'Task name')
    .option('--date <date>', 'Target date (default: today)')
    .option('--time <time>', 'Scheduled time (HH:mm)')
    .option('--estimate <minutes>', 'Estimated minutes', parseStrictInteger)
    .option('--project <name>', 'Project name')
    .option('--remind <minutes>', 'Set reminder N minutes before --time', parseStrictInteger)
    .action(async (name: string, cmdOpts: { date?: string; time?: string; estimate?: number; project?: string; remind?: number }) => {
      await withServices(program, async (services, { json }) => {
        await addCommand(services, name, { json, ...cmdOpts });
      });
    });

  // tco move <taskId>
  program
    .command('move')
    .description('Move a task to a different date or slot')
    .argument('<taskId>', 'Task ID')
    .option('--date <date>', 'New target date (YYYY-MM-DD)')
    .option('--slot <key>', 'New slot key')
    .option('--from <date>', 'Source date for the move (default: today)')
    .action(async (taskId: string, cmdOpts: { date?: string; slot?: string; from?: string }) => {
      await withServices(program, async (services, { json }) => {
        await moveCommand(services, taskId, { json, ...cmdOpts });
      });
    });

  // tco delete <taskId>
  program
    .command('delete')
    .description('Delete a task')
    .argument('<taskId>', 'Task ID')
    .option('--permanent', 'Permanently delete the task', false)
    .option('--date <date>', 'Date for the deletion (default: today)')
    .action(async (taskId: string, cmdOpts: { permanent: boolean; date?: string }) => {
      await withServices(program, async (services, { json }) => {
        await deleteCommand(services, taskId, { json, ...cmdOpts });
      });
    });

  // tco routinize <taskId>
  program
    .command('routinize')
    .description('Convert a task to a routine')
    .argument('<taskId>', 'Task ID')
    .option('--type <type>', 'Routine type (daily, weekly, monthly, monthly_date)', 'daily')
    .option('--interval <n>', 'Interval between occurrences', parseStrictInteger, 1)
    .option('--weekday <n>', 'Weekday (0=Sun, 6=Sat)')
    .option('--week <n>', 'Week of month (1-5 or "last")')
    .option('--monthday <n>', 'Day of month (1-31 or "last")')
    .option('--start <date>', 'Routine start date')
    .option('--end <date>', 'Routine end date')
    .action(async (taskId: string, cmdOpts: {
      type: string; interval: number; weekday?: string; week?: string;
      monthday?: string; start?: string; end?: string;
    }) => {
      await withServices(program, async (services, { json }) => {
        await routinizeCommand(services, taskId, { json, ...cmdOpts });
      });
    });

  // tco remind <taskId>
  program
    .command('remind')
    .description('Set or clear a reminder for a task')
    .argument('<taskId>', 'Task ID')
    .option('--time <time>', 'Reminder time (HH:mm)')
    .option('--clear', 'Clear the reminder', false)
    .action(async (taskId: string, cmdOpts: { time?: string; clear: boolean }) => {
      await withServices(program, async (services, { json }) => {
        await remindCommand(services, taskId, { json, ...cmdOpts });
      });
    });

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  const parseArgv: readonly string[] = argv;
  const isJsonMode = isJsonModeFromArgv(parseArgv);

  program.configureOutput({
    writeOut: (str: string) => {
      if (!isJsonMode) {
        process.stdout.write(str);
      }
    },
    writeErr: (str: string) => {
      if (!isJsonMode) {
        process.stderr.write(str);
      }
    },
    outputError: (str, write) => {
      if (!isJsonMode) {
        write(str);
      }
    },
  });
  applyExitOverrideRecursively(program);

  try {
    await program.parseAsync(argv);
  } catch (err: unknown) {
    const json = isJsonModeFromArgv(argv);

    if (err instanceof CommanderError) {
      if (err.exitCode === 0) return;

      if (json) {
        const commanderOutput = formatCliFatalError(new Error(normalizeCommanderErrorMessage(err.message)), true);
        console.log(commanderOutput);
      }
      process.exit(err.exitCode > 0 ? err.exitCode : 1);
      return;
    }

    const output = formatCliFatalError(err, json);
    if (json) {
      console.log(output);
    } else {
      console.error(output);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  void runCli();
}
