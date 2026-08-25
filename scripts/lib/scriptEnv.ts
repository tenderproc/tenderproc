// Shared by TenderProc's one-off scripts (scripts/*.ts) that need .env.local
// values outside of Next.js's own env loading. Extracted from
// scripts/setup-paddle-catalog.ts's inline copy so scripts/import-kbo-companies.ts
// and scripts/refresh-kbo-companies.ts don't each carry their own.

import { existsSync, readFileSync } from "node:fs";

// Thrown for expected, "stop and tell the user why" exits — a caller's
// main().catch() should print this message plainly (no stack) and set
// process.exitCode = 1 rather than calling process.exit(), which can race
// libuv's handle-close bookkeeping on Windows ("Assertion failed:
// !(handle->flags & UV_HANDLE_CLOSING)") if a stream/readline handle is
// still attached.
export class ScriptExit extends Error {}

export function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    throw new ScriptExit(`Env file not found: ${filePath}`);
  }
  // Minimal .env parser — no dotenv dependency in this project. Doesn't
  // support multi-line values or $VAR expansion; TenderProc's env files
  // don't use either.
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function requireEnv(name: string, envFile: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ScriptExit(`Missing required env var ${name} in ${envFile}`);
  }
  return value;
}
