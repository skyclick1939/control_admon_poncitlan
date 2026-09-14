#!/usr/bin/env node
// ============================================================================
// Postbuild guard (design.md research C12; tasks.md task 3.5).
//
// Only VITE_-prefixed env vars are inlined into client JS by Vite. The
// server-only api/debt-view.ts function uses the unprefixed
// SUPABASE_SERVICE_ROLE_KEY. This script fails the build (non-zero exit) if
// the string "service_role" ever leaks into dist/ — the client bundle that
// ships to every browser, including anonymous visitors of /vista/.
// ============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DIR = 'dist';
const FORBIDDEN = 'service_role';

function collectFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

let distFiles;
try {
  distFiles = collectFiles(DIST_DIR);
} catch (error) {
  console.error(`postbuild: could not read "${DIST_DIR}" -- did the build run?`, error);
  process.exit(1);
}

const offenders = distFiles.filter((file) => readFileSync(file, 'utf8').includes(FORBIDDEN));

if (offenders.length > 0) {
  console.error(`postbuild: found "${FORBIDDEN}" in the client bundle -- this must never leak client-side:`);
  for (const file of offenders) console.error(`  - ${file}`);
  process.exit(1);
}

console.log(`postbuild: no "${FORBIDDEN}" leakage found in ${DIST_DIR}/ (${distFiles.length} files checked).`);
