import { VaultService } from '../../src/services/VaultService';
import { resolve as pathResolve } from 'path';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('VaultService', () => {
  describe('resolve - relative vault path', () => {
    it('should work correctly when vault path is relative', () => {
      // Simulate: --vault tests/fixtures/vault (relative)
      const vault = new VaultService('tests/fixtures/vault');
      // Internal resolve should NOT throw for valid paths
      expect(() => vault.resolve('TaskChute/Task/test.md')).not.toThrow();
    });

    it('should resolve correctly with relative vault path', () => {
      const vault = new VaultService('tests/fixtures/vault');
      const expected = pathResolve('tests/fixtures/vault', 'TaskChute/Task/test.md');
      expect(vault.resolve('TaskChute/Task/test.md')).toBe(expected);
    });
  });

  describe('resolve - path traversal prevention', () => {
    it('should resolve normal relative paths', () => {
      const vault = new VaultService('/tmp/vault');
      expect(vault.resolve('TaskChute/Task/test.md')).toBe('/tmp/vault/TaskChute/Task/test.md');
    });

    it('should reject paths that escape vault via ..', () => {
      const vault = new VaultService('/tmp/vault');
      expect(() => vault.resolve('../../etc/passwd')).toThrow('Path traversal detected');
    });

    it('should reject paths that resolve to sibling directory with shared prefix', () => {
      // This is the key attack vector: /tmp/vault resolves /tmp/vault2/secret.md
      // which passes a naive startsWith('/tmp/vault') check
      const vault = new VaultService('/tmp/vault');
      expect(() => vault.resolve('../vault2/secret.md')).toThrow('Path traversal detected');
    });

    it('should allow vault root itself', () => {
      const vault = new VaultService('/tmp/vault');
      // Resolving '.' should return the vault path itself
      expect(vault.resolve('.')).toBe('/tmp/vault');
    });

    it('should allow nested paths', () => {
      const vault = new VaultService('/tmp/vault');
      expect(vault.resolve('a/b/../c')).toBe('/tmp/vault/a/c');
    });

    it('should reject paths that normalize to outside even with .. in the middle', () => {
      const vault = new VaultService('/tmp/vault');
      expect(() => vault.resolve('a/../../outside')).toThrow('Path traversal detected');
    });

    it('should allow nested paths when vault root is filesystem root', () => {
      const vault = new VaultService('/');
      expect(vault.resolve('tmp/vault/test.md')).toBe('/tmp/vault/test.md');
    });

    it('should reject symlink paths that point outside the vault', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-vault-symlink-'));
      const vaultRoot = join(tempRoot, 'vault');
      const outsideDir = join(tempRoot, 'outside');

      try {
        await mkdir(join(vaultRoot, '.obsidian'), { recursive: true });
        await mkdir(join(vaultRoot, 'TaskChute'), { recursive: true });
        await mkdir(outsideDir, { recursive: true });
        await symlink(outsideDir, join(vaultRoot, 'TaskChute', 'Task'));

        const vault = new VaultService(vaultRoot);
        expect(() => vault.resolve('TaskChute/Task/evil.md')).toThrow('Path traversal detected');
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });
  });

  describe('moveToTrash', () => {
    it('should keep existing trash file and move with a unique name on collision', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-vault-trash-'));
      const vaultRoot = join(tempRoot, 'vault');

      try {
        await mkdir(join(vaultRoot, 'TaskChute', 'Task'), { recursive: true });
        await mkdir(join(vaultRoot, '.trash'), { recursive: true });

        await writeFile(join(vaultRoot, '.trash', 'task.md'), 'older-trash', 'utf-8');
        await writeFile(join(vaultRoot, 'TaskChute', 'Task', 'task.md'), 'newly-deleted', 'utf-8');

        const vault = new VaultService(vaultRoot);
        await vault.moveToTrash('TaskChute/Task/task.md');

        const trashFiles = await readdir(join(vaultRoot, '.trash'));
        expect(trashFiles.length).toBe(2);

        const trashContents = await Promise.all(
          trashFiles.map(async (name) => readFile(join(vaultRoot, '.trash', name), 'utf-8')),
        );
        expect(trashContents).toContain('older-trash');
        expect(trashContents).toContain('newly-deleted');
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });
  });

  describe('listMarkdownFiles', () => {
    it('should include markdown files in nested subdirectories', async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'tco-vault-list-'));
      const vaultRoot = join(tempRoot, 'vault');

      try {
        await mkdir(join(vaultRoot, 'TaskChute', 'Task', 'project', 'deep'), { recursive: true });
        await writeFile(join(vaultRoot, 'TaskChute', 'Task', 'root.md'), '# root', 'utf-8');
        await writeFile(join(vaultRoot, 'TaskChute', 'Task', 'project', 'child.md'), '# child', 'utf-8');
        await writeFile(join(vaultRoot, 'TaskChute', 'Task', 'project', 'deep', 'leaf.md'), '# leaf', 'utf-8');
        await writeFile(join(vaultRoot, 'TaskChute', 'Task', 'project', 'note.txt'), 'ignore', 'utf-8');

        const vault = new VaultService(vaultRoot);
        const files = await vault.listMarkdownFiles('TaskChute/Task');

        expect(files).toEqual(expect.arrayContaining([
          'TaskChute/Task/root.md',
          'TaskChute/Task/project/child.md',
          'TaskChute/Task/project/deep/leaf.md',
        ]));
        expect(files).toHaveLength(3);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });
  });
});
