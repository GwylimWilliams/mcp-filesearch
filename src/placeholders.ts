/**
 * The token `scripts/instantiate.ts` substitutes when this template becomes a
 * real project. It appears literally in package.json and src/server.ts.
 * instantiate.ts skips this file, so the contract stays readable.
 */
export const NAME_PLACEHOLDER = "__name__";

/** The substitution points instantiate.ts infers mechanically. */
export const SUBSTITUTION_TARGETS = [
  { file: "package.json", location: 'the "name" and "bin" keys' },
  { file: "src/server.ts", location: "the McpServer name" },
] as const;
