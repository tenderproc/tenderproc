// One-off import of KBO Open Data (Belgium's public company register) into
// the kbo_companies table that powers the signup company-name autocomplete
// (app/signup/page.tsx, app/api/company-search/route.ts). Not part of the
// deployed app — run manually via:
//
//   npx tsx scripts/import-kbo-companies.ts <path-to-extracted-kbo-folder> [--env-file=.env.local]
//
// Get the export from https://kbopub.economie.fgov.be/kbo-open-data (free
// registration required), download the latest "Full" export, and extract
// the zip — this script expects <folder>/enterprise.csv and
// <folder>/denomination.csv from that extract.
//
// Run supabase-kbo-companies-migration.sql in the Supabase SQL editor first
// — this script only inserts, it doesn't create the table. Table is
// append-only from this script's perspective: TRUNCATE TABLE kbo_companies
// in the Supabase SQL editor first if you're re-running this by hand for a
// refresh (a new KBO export replaces prior data, it doesn't merge). For an
// unattended refresh, see scripts/refresh-kbo-companies.ts instead, which
// also fetches the export itself and truncates automatically.

import { createClient } from "@supabase/supabase-js";
import { ScriptExit, loadEnvFile, requireEnv } from "./lib/scriptEnv";
import { importKboFromFolder } from "./lib/kboImport";

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--"));
const envFileArg = args.find((a) => a.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.slice("--env-file=".length) : ".env.local";

async function main() {
  if (!folder) {
    throw new ScriptExit(
      "Usage: npx tsx scripts/import-kbo-companies.ts <path-to-extracted-kbo-folder> [--env-file=.env.local]"
    );
  }
  loadEnvFile(envFile);
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", envFile);
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", envFile);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await importKboFromFolder(folder, supabase);
}

main().catch((err) => {
  if (err instanceof ScriptExit) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
