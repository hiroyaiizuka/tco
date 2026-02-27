import { createInterface } from 'node:readline';
import { ConfigService } from '../services/ConfigService.js';
import { formatOutput } from '../utils/output.js';

export async function initCommand(
  vaultPathArg?: string,
  options: { json: boolean } = { json: false },
): Promise<void> {
  let vaultPath = vaultPathArg;

  if (!vaultPath) {
    if (options.json) {
      console.log(formatOutput({
        success: false,
        error: 'vaultPath is required in --json mode. Pass it as: tco init <vaultPath> --json',
      }, true));
      process.exit(1);
      return;
    }

    try {
      // Interactive prompt
      vaultPath = await promptVaultPath();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(msg);
      process.exit(1);
      return;
    }
  }

  const configService = new ConfigService();
  try {
    vaultPath = configService.validateObsidianVaultPath(vaultPath);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(formatOutput({ success: false, error: msg }, true));
    } else {
      console.error(msg);
    }
    process.exit(1);
    return;
  }

  await configService.saveConfig({ vaultPath });

  if (options.json) {
    console.log(formatOutput({ success: true, vaultPath }, true));
  } else {
    console.log(`Initialized tco with vault: ${vaultPath}`);
    console.log('Config saved to ~/.tcorc');
  }
}

function promptVaultPath(): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    let settled = false;

    const rejectOnce = (message: string): void => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    rl.on('close', () => {
      if (!settled) {
        rejectOnce('Vault path is required.');
      }
    });

    rl.question('Enter the path to your Obsidian vault: ', (answer) => {
      if (settled) return;
      const trimmed = answer.trim();
      if (!trimmed) {
        settled = true;
        rl.close();
        reject(new Error('Vault path is required.'));
        return;
      }
      settled = true;
      resolve(trimmed);
      rl.close();
    });
  });
}
