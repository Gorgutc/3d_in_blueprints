const context = [
  '3d_in_blueprints Codex infrastructure workspace.',
  'Source of truth: AGENTS.md.',
  'Selected scope: Blender add-on plus local standalone backend.',
  'Active profile: blender-addon. Dormant profile: windows-exe.',
  'Use explicit spawned subagents for broad work when available.',
  'Before delivery, run npm run codex:ship and /review or the documented fallback.'
].join(' ');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: context
  }
}));
