# ADR 0001: Stack-Neutral Codex Infrastructure

## Status

Accepted.

## Decision

Use `AGENTS.md`, `.codex`, `.agents/plugins`, `plugins/blueprints-codex`,
`docs/agent`, scripts, `lefthook.yml`, and GitHub Actions as the active Codex
operating layer.

## Consequences

The repository can be used safely before the app stack exists. Future app work
must extend the infrastructure instead of replacing it silently.
