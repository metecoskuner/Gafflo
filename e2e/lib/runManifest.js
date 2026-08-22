import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const manifestPath = path.join(__dirname, '..', '.auth', 'run-manifest.json')

// The one durable record of "which real Supabase Auth identities did this specific Playwright
// run create." Lives in the same gitignored e2e/.auth/ directory as identities.json/state.json
// (see .gitignore) — never committed, regenerated fresh every run. global-teardown.js reads this
// and this alone to decide what to clean up; it never infers a target set from an email pattern,
// so a broad LIKE 'gafflo-e2e-%' style match is never how real deletion scope is determined.

export function writeManifest(runId, emails) {
  mkdirSync(path.dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, JSON.stringify({ runId: String(runId), createdAt: new Date().toISOString(), emails }, null, 2))
}

// e2e/auth.spec.js's one real (non-stubbed) signup happens inside a test body, after
// global-setup.js has already written the manifest — this appends to the same file rather than
// creating a second one, so global-teardown.js only ever has one source of truth to read. Not
// meaningfully concurrent in practice (exactly one test path calls this per run, with default
// retries: 0 in playwright.config.js), so a plain read-modify-write is sufficient — no lockfile.
export function appendEmailToManifest(email) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    // global-setup.js didn't write a manifest (e.g. it failed before reaching that point) —
    // nothing to append to, and inventing a fresh one here would have no real runId to anchor
    // it to. Silently skip; global-teardown.js already treats "no manifest" as "skip cleanup."
    return
  }
  if (!manifest.emails.includes(email)) manifest.emails.push(email)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

export function readManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
}
