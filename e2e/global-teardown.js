import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readManifest } from './lib/runManifest.js'
import { assertNoProtectedEmails, buildCleanupPhases, buildResolveEmailsSql, buildStoragePathsQuery } from './lib/cleanupQueries.js'

// Opt-in only. Every other e2e spec file's own run must keep working with none of this set —
// exactly the precedent already established for GAFFLO_E2E_MODERATOR_PASSWORD in
// global-setup.js. Never read from .env.local: that file only ever holds client-safe VITE_
// values (see loadEnvLocal() in global-setup.js), never a privileged DB connection string or a
// service_role key.
const DB_URL = process.env.GAFFLO_E2E_CLEANUP_DB_URL
const SERVICE_ROLE_KEY = process.env.GAFFLO_E2E_CLEANUP_SERVICE_ROLE_KEY
const DRY_RUN = process.env.GAFFLO_E2E_CLEANUP_DRY_RUN === 'true'

function log(message) {
  console.log(`[global-teardown] ${message}`)
}

function runPsql(dbUrl, sql) {
  return execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function psqlAvailable() {
  try {
    execFileSync('psql', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export default async function globalTeardown() {
  try {
    const manifest = readManifest()
    if (!manifest || !manifest.emails?.length) {
      log('no run manifest found (or it is empty) — nothing created by this run to clean up.')
      return
    }
    log(`run manifest has ${manifest.emails.length} throwaway email(s) from run ${manifest.runId}.`)

    if (!DB_URL) {
      log(
        'GAFFLO_E2E_CLEANUP_DB_URL is not set — skipping cleanup. This run\'s throwaway data ' +
          `(${manifest.emails.length} identities) will remain in the database until a cleanup ` +
          'run happens. Every other test behavior is unaffected.',
      )
      return
    }
    if (!psqlAvailable()) {
      log('GAFFLO_E2E_CLEANUP_DB_URL is set, but the `psql` CLI is not on PATH — skipping cleanup. Install postgresql-client to enable it.')
      return
    }

    // 1. Resolve this run's manifest emails to real, current auth.users ids. Never trust a
    // previously-captured id — the email is the one durable, unique key.
    const resolveSql = buildResolveEmailsSql(manifest.emails)
    const resolveOutput = runPsql(DB_URL, resolveSql).trim()
    const resolvedRows = resolveOutput
      ? resolveOutput.split('\n').map((line) => {
          const [id, email] = line.split('\t')
          return { id, email }
        })
      : []

    if (!resolvedRows.length) {
      log('none of this run\'s manifest emails currently exist in auth.users — nothing to clean up (already gone, or setup never completed).')
      return
    }

    // 2. Safety check — never proceed if a protected identity somehow resolved into this set.
    assertNoProtectedEmails(resolvedRows)

    const throwawayIds = resolvedRows.map((row) => row.id)
    log(`resolved ${throwawayIds.length} of ${manifest.emails.length} manifest email(s) to real auth.users ids.`)

    // 3. Capture Storage paths before any deletion — listing_images (and the storage_path it
    // records) cascades away with its parent listing.
    const storagePathsOutput = runPsql(DB_URL, buildStoragePathsQuery(throwawayIds)).trim()
    const storagePaths = storagePathsOutput ? storagePathsOutput.split('\n').filter(Boolean) : []

    // 4. Build the ordered DELETE/UPDATE phases (see e2e/lib/cleanupQueries.js for why this
    // exact order and table set — proven live during the Stage R2 historical cleanup).
    const phases = buildCleanupPhases(throwawayIds)

    if (DRY_RUN) {
      log(`DRY RUN — would run ${phases.length} SQL phases against ${throwawayIds.length} ids, and remove ${storagePaths.length} storage object(s):`)
      phases.forEach((phase) => log(`  [dry-run] ${phase.name}`))
      storagePaths.slice(0, 10).forEach((p) => log(`  [dry-run] storage object: ${p}`))
      if (storagePaths.length > 10) log(`  [dry-run] ...and ${storagePaths.length - 10} more`)
      return
    }

    // 5. Execute all phases in one transaction — a mid-sequence failure rolls back cleanly
    // rather than leaving partial cleanup, and DELETE/UPDATE against an already-empty set (a
    // second, redundant teardown run) is a safe no-op, not an error — idempotent by construction.
    const script = ['begin;', ...phases.map((phase) => phase.sql), 'commit;'].join('\n')
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'gafflo-e2e-cleanup-'))
    const scriptPath = path.join(tmpDir, 'cleanup.sql')
    try {
      writeFileSync(scriptPath, script)
      execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', scriptPath], { stdio: ['ignore', 'pipe', 'pipe'] })
      log(`cleaned up ${throwawayIds.length} throwaway identit${throwawayIds.length === 1 ? 'y' : 'ies'} and their data across ${phases.length} phases.`)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }

    // 6. Storage cleanup — a separate system from the SQL rows above (storage.objects metadata
    // does not reliably free the underlying blob on hosted Supabase via raw SQL DELETE; the
    // Storage REST API's own remove endpoint is the only path that does both, matching the
    // pattern already established for this in the app's own delete_listing_image() RPC and used
    // for the real Stage R2 storage cleanup).
    if (!storagePaths.length) {
      log('no storage objects to clean up for this run.')
    } else if (!SERVICE_ROLE_KEY) {
      log(
        `GAFFLO_E2E_CLEANUP_SERVICE_ROLE_KEY is not set — skipping storage cleanup. ` +
          `${storagePaths.length} orphaned object(s) remain in listing-photos:`,
      )
      storagePaths.forEach((p) => log(`  orphaned: ${p}`))
    } else {
      const supabaseUrl = process.env.VITE_SUPABASE_URL
      if (!supabaseUrl) {
        log('VITE_SUPABASE_URL is not set — cannot reach the Storage API. Skipping storage cleanup.')
      } else {
        const res = await fetch(`${supabaseUrl}/storage/v1/object/listing-photos`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: storagePaths }),
        })
        if (res.ok) {
          const body = await res.json().catch(() => [])
          log(`storage cleanup: removed ${Array.isArray(body) ? body.length : storagePaths.length} object(s).`)
        } else {
          log(`storage cleanup failed (HTTP ${res.status}) — ${storagePaths.length} object(s) may remain orphaned. This does not affect test results.`)
        }
      }
    }
  } catch (error) {
    // Never throw out of globalTeardown: a cleanup bug must never be reported as a test
    // failure, and must never mask the real pass/fail result Playwright already recorded.
    log(`cleanup encountered an error and was aborted safely, leaving data as-is: ${error.message}`)
  }
}
