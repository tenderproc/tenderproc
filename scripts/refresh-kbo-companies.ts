// Automated monthly refresh of kbo_companies (see scripts/import-kbo-companies.ts
// for the one-off manual version this is built on top of). Logs into KBO
// Open Data, downloads the most recent "Full" export, extracts it, truncates
// kbo_companies, reimports, then deletes the downloaded files. Meant to run
// unattended from a Windows Scheduled Task — see
// scripts/register-kbo-refresh-task.ps1.
//
// Usage:
//   npx tsx scripts/refresh-kbo-companies.ts [--env-file=.env.local]
//
// Requires KBO_USERNAME/KBO_PASSWORD (your kbopub.economie.fgov.be login —
// register free at https://kbopub.economie.fgov.be/kbo-open-data) in
// addition to the NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY that
// scripts/import-kbo-companies.ts already needs. Add them to .env.local
// yourself — this script only ever reads them from the environment, never
// hardcode or log them.
//
// Extraction shells out to PowerShell's Expand-Archive (built into Windows,
// no new dependency) since this script is only ever meant to run on this
// project's Windows dev machine — see the "not yet built" note in
// docs/database.md's Company search section for why a Vercel cron isn't a
// fit here (the extracted export is several GB, far past what a serverless
// function's /tmp and execution-time limits allow).

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";
import { ScriptExit, loadEnvFile, requireEnv } from "./lib/scriptEnv";
import { importKboFromFolder } from "./lib/kboImport";
import { loginAndFindLatestFullDownload, downloadWithJar } from "./lib/kboPortal";

const args = process.argv.slice(2);
const envFileArg = args.find((a) => a.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.slice("--env-file=".length) : ".env.local";

function extractZip(zipPath: string, destDir: string) {
  // Passed via env vars (not string-interpolated into the -Command text) so
  // paths with spaces or quotes can't break out of the PowerShell command.
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $env:KBO_ZIP_PATH -DestinationPath $env:KBO_EXTRACT_DIR -Force"],
    { stdio: "inherit", env: { ...process.env, KBO_ZIP_PATH: zipPath, KBO_EXTRACT_DIR: destDir } }
  );
}

async function main() {
  loadEnvFile(envFile);
  const kboUsername = requireEnv("KBO_USERNAME", envFile);
  const kboPassword = requireEnv("KBO_PASSWORD", envFile);
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", envFile);
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", envFile);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const workDir = mkdtempSync(path.join(os.tmpdir(), "kbo-refresh-"));
  try {
    console.log("Logging into KBO Open Data and finding the latest Full export...");
    const latest = await loginAndFindLatestFullDownload(kboUsername, kboPassword);
    console.log(`Found ${latest.filename} — downloading...`);

    const zipPath = path.join(workDir, latest.filename);
    const zipBytes = await downloadWithJar(latest.url, latest.jar);
    writeFileSync(zipPath, Buffer.from(zipBytes));
    console.log(`Downloaded ${(zipBytes.byteLength / 1e6).toFixed(0)} MB. Extracting...`);

    const extractDir = path.join(workDir, "extracted");
    extractZip(zipPath, extractDir);
    if (!existsSync(path.join(extractDir, "enterprise.csv")) || !existsSync(path.join(extractDir, "denomination.csv"))) {
      throw new ScriptExit(`Extraction didn't produce the expected CSVs in ${extractDir}.`);
    }

    await importKboFromFolder(extractDir, supabase, { truncateFirst: true });
  } finally {
    console.log(`Cleaning up ${workDir}...`);
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  if (err instanceof ScriptExit) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
