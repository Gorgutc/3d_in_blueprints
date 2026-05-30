let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  let prompt = '';
  try {
    const parsed = JSON.parse(input || '{}');
    prompt = parsed.prompt || parsed.user_prompt || '';
  } catch {
    prompt = input || '';
  }

  const lower = prompt.toLowerCase();
  const triggers = [
    'implement',
    'refactor',
    'audit',
    'cleanup',
    'agents',
    'skills',
    'hooks',
    'ship',
    'review',
    'exe',
    'windows',
    'blender',
    '\u0441\u0434\u0435\u043b\u0430\u0439',
    '\u0434\u043e\u0431\u0430\u0432\u044c',
    '\u0430\u0433\u0435\u043d\u0442',
    '\u0441\u043a\u0438\u043b\u043b',
    '\u0445\u0443\u043a',
    '\u0438\u043d\u0441\u0442\u0440\u0443\u043a\u0446',
    '\u043f\u0440\u043e\u0432\u0435\u0440\u044c',
    '\u044d\u043a\u0437\u0435',
    '\u0431\u043b\u0435\u043d\u0434\u0435\u0440'
  ];

  if (!triggers.some((word) => lower.includes(word))) return;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: '[3d_in_blueprints reminder] Read AGENTS.md, keep the app stack unselected unless the task selects it, use explicit spawned subagents for broad work, and run npm run codex:ship before delivery.'
    }
  }));
});
