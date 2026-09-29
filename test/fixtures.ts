import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface Fixture {
  root: string;
  cleanup(): void;
}

/** Materialises a file tree (relative path → contents) in a fresh temp directory. */
export function createFixture(prefix: string, files: Record<string, string | Buffer>): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `mcp-filesearch-${prefix}-`)));
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
