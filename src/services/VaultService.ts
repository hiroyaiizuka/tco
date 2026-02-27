import { readFile, writeFile, readdir, stat, mkdir, rename } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve as pathResolve, sep } from 'node:path';

/**
 * VaultService - File system abstraction for Obsidian Vault access.
 * All paths are vault-relative (forward-slash separated).
 */
export class VaultService {
  private readonly vaultPath: string;
  private readonly vaultRealPath: string;
  private readonly enforceRealpathBoundary: boolean;

  constructor(vaultPath: string) {
    // Always absolutize to avoid comparison mismatch with path.resolve() output
    this.vaultPath = pathResolve(vaultPath);
    this.enforceRealpathBoundary = existsSync(this.vaultPath);
    this.vaultRealPath = this.enforceRealpathBoundary
      ? realpathSync(this.vaultPath)
      : this.vaultPath;
  }

  /** Resolve a vault-relative path to absolute path */
  resolve(vaultRelativePath: string): string {
    // Normalize to OS path
    const normalized = vaultRelativePath.replace(/\//g, sep);
    const resolved = pathResolve(this.vaultPath, normalized);
    // Check directory boundary via path.relative to avoid prefix-based false positives.
    const rel = relative(this.vaultPath, resolved);
    const isOutside = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
    if (isOutside) {
      throw new Error(`Path traversal detected: "${vaultRelativePath}" resolves outside vault`);
    }
    if (this.enforceRealpathBoundary) {
      const nearestExisting = this.findNearestExistingAncestor(resolved);
      const nearestRealPath = realpathSync(nearestExisting);
      const realRel = relative(this.vaultRealPath, nearestRealPath);
      const realOutside = realRel === '..' || realRel.startsWith(`..${sep}`) || isAbsolute(realRel);
      if (realOutside) {
        throw new Error(`Path traversal detected: "${vaultRelativePath}" resolves outside vault`);
      }
    }
    return resolved;
  }

  /** Convert absolute path to vault-relative path (forward slash) */
  toVaultRelative(absolutePath: string): string {
    return relative(this.vaultPath, absolutePath).replace(/\\/g, '/');
  }

  /** Read file content as string */
  async readFile(vaultRelativePath: string): Promise<string> {
    return readFile(this.resolve(vaultRelativePath), 'utf-8');
  }

  /** Write file content */
  async writeFile(vaultRelativePath: string, content: string): Promise<void> {
    const absPath = this.resolve(vaultRelativePath);
    await this.ensureDir(absPath);
    await writeFile(absPath, content, 'utf-8');
  }

  /** Check if file exists */
  fileExists(vaultRelativePath: string): boolean {
    return existsSync(this.resolve(vaultRelativePath));
  }

  /** List all .md files in a directory (recursive) */
  async listMarkdownFiles(vaultRelativeDir: string): Promise<string[]> {
    const absDir = this.resolve(vaultRelativeDir);
    if (!existsSync(absDir)) return [];
    const baseRelativeDir = vaultRelativeDir.replace(/\\/g, '/').replace(/\/+$/, '');
    const result: string[] = [];

    const walk = async (currentAbsDir: string, currentRelativeDir: string): Promise<void> => {
      const entries = await readdir(currentAbsDir, { withFileTypes: true });

      for (const entry of entries) {
        const childAbsPath = join(currentAbsDir, entry.name);
        const childRelativePath = `${currentRelativeDir}/${entry.name}`;

        if (entry.isDirectory()) {
          await walk(childAbsPath, childRelativePath);
          continue;
        }

        if (entry.isFile() && entry.name.endsWith('.md')) {
          result.push(childRelativePath);
        }
      }
    };

    await walk(absDir, baseRelativeDir);
    return result;
  }

  /** Ensure parent directory exists */
  async ensureDir(absoluteOrRelativePath: string): Promise<void> {
    const absPath = absoluteOrRelativePath.startsWith('/')
      ? absoluteOrRelativePath
      : this.resolve(absoluteOrRelativePath);
    const dir = absPath.includes('.') && !absPath.endsWith('/')
      ? join(absPath, '..')
      : absPath;
    await mkdir(dir, { recursive: true });
  }

  /** Ensure a vault-relative directory exists */
  async ensureVaultDir(vaultRelativeDir: string): Promise<void> {
    await mkdir(this.resolve(vaultRelativeDir), { recursive: true });
  }

  /** Move file to .trash/ directory */
  async moveToTrash(vaultRelativePath: string): Promise<string> {
    const fileName = vaultRelativePath.split('/').pop()!;
    const trashDir = this.resolve('.trash');
    await mkdir(trashDir, { recursive: true });
    const trashPath = this.getAvailableTrashPath(fileName, trashDir);
    await this.moveFile(vaultRelativePath, trashPath);
    return trashPath;
  }

  /** Restore a trashed file back to its vault-relative path */
  async restoreFromTrash(trashRelativePath: string, vaultRelativePath: string): Promise<void> {
    await this.moveFile(trashRelativePath, vaultRelativePath);
  }

  /** Get file stats */
  async stat(vaultRelativePath: string): Promise<{ ctime: number; mtime: number; size: number }> {
    const s = await stat(this.resolve(vaultRelativePath));
    return { ctime: s.ctimeMs, mtime: s.mtimeMs, size: s.size };
  }

  private findNearestExistingAncestor(candidatePath: string): string {
    let current = candidatePath;
    while (!existsSync(current)) {
      const parent = pathResolve(current, '..');
      if (parent === current) {
        return current;
      }
      current = parent;
    }
    return current;
  }

  private async moveFile(fromVaultRelativePath: string, toVaultRelativePath: string): Promise<void> {
    const absSource = this.resolve(fromVaultRelativePath);
    const absDest = this.resolve(toVaultRelativePath);
    await mkdir(dirname(absDest), { recursive: true });
    await rename(absSource, absDest);
  }

  private getAvailableTrashPath(fileName: string, trashDir: string): string {
    const extIndex = fileName.lastIndexOf('.');
    const hasExtension = extIndex > 0;
    const baseName = hasExtension ? fileName.slice(0, extIndex) : fileName;
    const extension = hasExtension ? fileName.slice(extIndex) : '';

    let candidate = fileName;
    let suffix = 1;
    while (existsSync(join(trashDir, candidate))) {
      candidate = `${baseName}-${suffix}${extension}`;
      suffix += 1;
    }
    return `.trash/${candidate}`;
  }
}
