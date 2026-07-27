# Archive Policy

Archive instead of deleting when a future audit may need to compare behavior,
source provenance, or historical decisions.

Do not archive active policy into hidden locations. Active policy belongs in
`AGENTS.md`, `.codex`, `.agents`, `plugins/blueprints-codex`, root
compatibility/project docs, `docs/release`, scripts, CI, and every current
`docs/agent/**` surface except ADRs and migration inventory. ADRs and migration
inventory are reference records. `docs/handoff/**` and the marked I1-I8 profile
section are append-only historical evidence.

Large source materials from adjacent repositories should be summarized in
`docs/agent/migration-inventory.md` unless the user explicitly asks to vendor a
reference.
