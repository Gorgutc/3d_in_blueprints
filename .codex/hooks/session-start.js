const context = [
  '3d_in_blueprints Codex infrastructure workspace.',
  'Source of truth: AGENTS.md.',
  'No application stack is selected yet.',
  'Dormant profiles: windows-exe and blender-addon.',
  'Use explicit spawned subagents for broad work when available.',
  'Before delivery, run npm run codex:ship and /review or the documented fallback.'
].join(' ');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: context
  }
}));
