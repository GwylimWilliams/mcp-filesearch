import { realpathSync, statSync } from "node:fs";
import { relative, sep } from "node:path";

function isInside(resolved: string, root: string): boolean {
  if (resolved === root) return true;
  const prefix = root.endsWith(sep) ? root : root + sep;
  return resolved.startsWith(prefix);
}

export function parseRoots(args: readonly string[]): { roots: string[] } | { error: string } {
  if (args.length === 0) return { error: "at least one allowed root is required" };

  const roots: string[] = [];
  for (const arg of args) {
    let resolved: string;
    let isDirectory: boolean;
    try {
      resolved = realpathSync(arg);
      isDirectory = statSync(resolved).isDirectory();
    } catch {
      return { error: `root cannot be resolved: ${arg}` };
    }
    if (!isDirectory) return { error: `root is not a directory: ${arg}` };
    if (!roots.includes(resolved)) roots.push(resolved);
  }

  return { roots };
}

export function resolveInRoots(
  requested: string,
  roots: readonly string[],
): { path: string } | { error: string } {
  let resolved: string;
  try {
    resolved = realpathSync(requested);
  } catch {
    return { error: `path cannot be resolved: ${requested}` };
  }
  if (!roots.some((root) => isInside(resolved, root))) {
    return { error: `path is outside the allowed roots: ${requested}` };
  }
  return { path: resolved };
}

export function relativeToRoot(resolvedAbs: string, roots: readonly string[]): string {
  for (const root of roots) {
    if (isInside(resolvedAbs, root)) return relative(root, resolvedAbs);
  }
  return resolvedAbs;
}
