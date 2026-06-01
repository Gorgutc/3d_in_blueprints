# ADR 0001: Codex Infrastructure

## Status

Accepted.

## Decision

Use `AGENTS.md`, `.codex`, `.agents/plugins`, `plugins/blueprints-codex`,
`docs/agent`, scripts, `lefthook.yml`, and GitHub Actions as the active Codex
operating layer.

## Consequences

The repository can be used safely while product work grows from the selected
Blender add-on + backend scope. Product work must extend the infrastructure
instead of replacing it silently.
