# Migration Inventory

This file records source material from adjacent repositories. It is reference
material, not active policy.

## Gorgutc/PL_RU

- Strong plugin-first layout: `.agents/plugins/marketplace.json`,
  `plugins/pl-ru-codex/.codex-plugin/plugin.json`, repo-local skills, docs,
  `.codex/agents`, and CI.
- Useful portable patterns: authority order, agent PASS/FAIL evidence,
  bootstrap docs, verification docs, archive policy, quality command layering,
  and explicit visual/profile review gates.
- Rewritten or omitted: project stack rules, UI kit rules, reference folders,
  and package-manager assumptions.

## Gorgutc/codex

- Strong Codex-native hook model: `.codex/hooks.json`, JS hook scripts, compact
  skills, legacy-reference inventory, governance checks, and stale pass-total
  protection.
- Useful portable patterns: session-start context, prompt nudges, post-edit
  verification, plugin verification, migration docs, eval prompts, and final
  review fallback.
- Rewritten or omitted: portfolio-specific runtime, static page script order,
  old visual rules, and archived Claude source material.

## Adaptation Rule

Use source material as design input only. Active policy for this repository must
be short, stack-neutral, verified, and tied to the future program only after the
next task brief selects a stack.
