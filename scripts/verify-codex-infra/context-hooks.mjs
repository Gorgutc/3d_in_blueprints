export function registerContextHookChecks(options) {
  const {
    check,
    exists,
    read,
    root,
    spawn,
    execPath,
    join,
  } = options;
  const expectedContextHooks = Object.freeze({
    SessionStart: Object.freeze({
      path: '.codex/hooks/session-start.js',
      context: [
        '3d_in_blueprints Codex infrastructure workspace.',
        'Source of truth: AGENTS.md.',
        'Selected scope: Blender add-on plus local standalone backend.',
        'Active profile: blender-addon. Dormant profile: windows-exe.',
        'Use explicit spawned subagents for broad work when available.',
        'Before delivery, run npm run codex:ship and /review or the documented fallback.',
      ].join(' '),
    }),
    UserPromptSubmit: Object.freeze({
      path: '.codex/hooks/user-prompt-nudge.js',
      context: '[3d_in_blueprints reminder] Read AGENTS.md, keep the selected Blender add-on + backend scope, use explicit spawned subagents for broad work, and run npm run codex:ship plus /review or the documented fallback before delivery.',
    }),
  });
  const expectedUserPromptTriggers = Object.freeze([
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
    '\u0431\u043b\u0435\u043d\u0434\u0435\u0440',
  ]);

  function contextHookEnvelope(eventName, additionalContext, extra = {}) {
    return {
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext,
        ...(extra.hookSpecificOutput || {}),
      },
      ...(extra.topLevel || {}),
    };
  }

  function contextHookResult({
    eventName,
    additionalContext,
    stdout,
    stderr = '',
    status = 0,
    signal = null,
    error = null,
    extra,
  } = {}) {
    return {
      error,
      signal,
      status,
      stderr,
      stdout: stdout ?? JSON.stringify(contextHookEnvelope(eventName, additionalContext, extra)),
    };
  }

  function runContextHook(relativePath, input = '') {
    try {
      const result = spawn(execPath, [join(root, relativePath)], {
        cwd: root,
        encoding: 'utf8',
        input,
        killSignal: 'SIGTERM',
        timeout: 4_000,
        windowsHide: true,
      });
      return {
        error: result?.error || null,
        signal: result?.signal || null,
        status: result?.status,
        stderr: result?.stderr == null ? '' : String(result.stderr),
        stdout: result?.stdout == null ? '' : String(result.stdout),
      };
    } catch (error) {
      return {
        error,
        signal: null,
        status: null,
        stderr: '',
        stdout: '',
      };
    }
  }

  function contextHookExecutionErrors(result, {
    eventName,
    additionalContext,
    output = 'required',
  }) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return ['hook execution result must be an object'];
    }

    const errors = [];
    const stderr = result.stderr == null ? '' : String(result.stderr);
    const stdout = result.stdout == null ? '' : String(result.stdout);
    if (result.error) {
      const code = result.error.code ? `${result.error.code}: ` : '';
      errors.push(`hook process error: ${code}${result.error.message || String(result.error)}`);
    }
    if (result.signal) errors.push(`hook process terminated by ${result.signal}`);
    if (result.status === null || result.status === undefined) {
      errors.push('hook process returned no exit status');
    } else if (result.status !== 0) {
      errors.push(`hook process exited with status ${result.status}`);
    }
    if (stderr !== '') errors.push('hook process wrote to stderr');

    if (output === 'forbidden') {
      if (stdout !== '') errors.push('hook process produced unexpected stdout');
      return errors;
    }
    if (stdout === '') {
      errors.push('hook process produced no stdout');
      return errors;
    }
    if (stdout !== stdout.trim()) errors.push('hook stdout has leading or trailing whitespace');

    let envelope;
    try {
      envelope = JSON.parse(stdout);
    } catch {
      errors.push('hook stdout is not exactly one JSON value');
      return errors;
    }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      errors.push('hook envelope must be an object');
      return errors;
    }
    const topLevelKeys = Object.keys(envelope).sort();
    if (JSON.stringify(topLevelKeys) !== JSON.stringify(['hookSpecificOutput'])) {
      errors.push(`hook envelope keys differ: ${topLevelKeys.join(', ')}`);
    }

    const hookOutput = envelope.hookSpecificOutput;
    if (!hookOutput || typeof hookOutput !== 'object' || Array.isArray(hookOutput)) {
      errors.push('hookSpecificOutput must be an object');
      return errors;
    }
    const outputKeys = Object.keys(hookOutput).sort();
    if (JSON.stringify(outputKeys) !== JSON.stringify(['additionalContext', 'hookEventName'])) {
      errors.push(`hookSpecificOutput keys differ: ${outputKeys.join(', ')}`);
    }
    if (hookOutput.hookEventName !== eventName) errors.push('hook event differs');
    if (typeof hookOutput.additionalContext !== 'string') {
      errors.push('hook additionalContext must be a string');
    } else if (hookOutput.additionalContext !== additionalContext) {
      errors.push('hook additionalContext differs from the approved event contract');
    }
    return errors;
  }

  function userPromptTriggerInventoryErrors(source) {
    const block = /const triggers = \[([\s\S]*?)\n\s*\];/.exec(source)?.[1];
    if (block === undefined) return ['UserPromptSubmit trigger inventory is missing'];

    const errors = [];
    const triggers = [];
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const [index, line] of lines.entries()) {
      const match = /^'((?:\\.|[^'\\])*)'(,?)$/.exec(line);
      if (!match) {
        errors.push(`invalid trigger entry: ${line}`);
        continue;
      }
      if (index < lines.length - 1 && match[2] !== ',') {
        errors.push(`missing trigger separator: ${line}`);
      }
      try {
        triggers.push(JSON.parse(`"${match[1].replaceAll('"', '\\"')}"`));
      } catch {
        errors.push(`invalid trigger string: ${line}`);
      }
    }
    if (JSON.stringify(triggers) !== JSON.stringify(expectedUserPromptTriggers)) {
      errors.push(`UserPromptSubmit triggers differ: ${triggers.join(', ')}`);
    }
    return errors;
  }

  if (
    exists(expectedContextHooks.SessionStart.path)
    && exists(expectedContextHooks.UserPromptSubmit.path)
  ) {
    const executionContract = (eventName, output = 'required') => ({
      eventName,
      additionalContext: expectedContextHooks[eventName].context,
      output,
    });
    const errorsFor = (eventName, result, output = 'required') => (
      contextHookExecutionErrors(result, executionContract(eventName, output))
    );
    const checkExecution = (name, eventName, result, output = 'required') => {
      const errors = errorsFor(eventName, result, output);
      check(name, errors.length === 0, errors.join('; '));
    };

    const sessionEmpty = runContextHook(expectedContextHooks.SessionStart.path);
    const sessionNoise = runContextHook(
      expectedContextHooks.SessionStart.path,
      JSON.stringify({ ignored: 'input' }),
    );
    checkExecution('SessionStart executable emits the approved exact contract', 'SessionStart', sessionEmpty);
    checkExecution('SessionStart ignores arbitrary stdin deterministically', 'SessionStart', sessionNoise);
    check(
      'SessionStart output is byte-deterministic across input',
      sessionEmpty.stdout === sessionNoise.stdout,
    );

    const userPromptSource = read(expectedContextHooks.UserPromptSubmit.path);
    const triggerInventoryErrors = userPromptTriggerInventoryErrors(userPromptSource);
    check(
      'UserPromptSubmit trigger inventory is exact',
      triggerInventoryErrors.length === 0,
      triggerInventoryErrors.join('; '),
    );
    check(
      'UserPromptSubmit trigger inventory rejects an additive entry',
      userPromptTriggerInventoryErrors(
        userPromptSource.replace("    'blender',", "    'blender',\n    'deploy',"),
      ).length > 0,
    );
    check(
      'UserPromptSubmit trigger inventory rejects a deleted entry',
      userPromptTriggerInventoryErrors(
        userPromptSource.replace("    'blender',", ''),
      ).length > 0,
    );

    for (const trigger of expectedUserPromptTriggers) {
      checkExecution(
        `UserPromptSubmit executable preserves trigger: ${trigger}`,
        'UserPromptSubmit',
        runContextHook(
          expectedContextHooks.UserPromptSubmit.path,
          JSON.stringify({ prompt: `please ${trigger} now` }),
        ),
      );
    }
    for (const prompt of ['AUDIT HOOKS', '\u041f\u0420\u041e\u0412\u0415\u0420\u042c \u0425\u0423\u041a', 'shipping labels', 'reviewer notes', 'execute a calculation']) {
      checkExecution(
        `UserPromptSubmit preserves case-insensitive substring behavior: ${prompt}`,
        'UserPromptSubmit',
        runContextHook(
          expectedContextHooks.UserPromptSubmit.path,
          JSON.stringify({ prompt }),
        ),
      );
    }

    for (const [name, input] of [
      ['legacy user_prompt alias', JSON.stringify({ user_prompt: 'audit hooks' })],
      ['empty primary fallback', JSON.stringify({ prompt: '', user_prompt: 'audit hooks' })],
      ['false primary fallback', JSON.stringify({ prompt: false, user_prompt: 'audit hooks' })],
      ['zero primary fallback', JSON.stringify({ prompt: 0, user_prompt: 'audit hooks' })],
      ['null primary fallback', JSON.stringify({ prompt: null, user_prompt: 'audit hooks' })],
      ['raw malformed trigger fallback', 'audit hooks {'],
    ]) {
      checkExecution(
        `UserPromptSubmit emits the approved reminder for ${name}`,
        'UserPromptSubmit',
        runContextHook(expectedContextHooks.UserPromptSubmit.path, input),
      );
    }

    for (const [name, input] of [
      ['empty input', ''],
      ['empty object', '{}'],
      ['non-trigger', JSON.stringify({ prompt: 'hello world' })],
      ['whitespace prompt', JSON.stringify({ prompt: '   ' })],
      ['truthy string primary precedence', JSON.stringify({ prompt: 'hello', user_prompt: 'audit hooks' })],
      ['truthy numeric primary', JSON.stringify({ prompt: 42, user_prompt: 'audit hooks' })],
      ['truthy boolean primary', JSON.stringify({ prompt: true, user_prompt: 'audit hooks' })],
      ['truthy object primary', JSON.stringify({ prompt: {}, user_prompt: 'audit hooks' })],
      ['truthy array primary', JSON.stringify({ prompt: [], user_prompt: 'audit hooks' })],
      ['truthy numeric alias', JSON.stringify({ user_prompt: 42 })],
      ['truthy boolean alias', JSON.stringify({ user_prompt: true })],
      ['truthy object alias', JSON.stringify({ user_prompt: {} })],
      ['truthy array alias', JSON.stringify({ user_prompt: [] })],
      ['top-level null', 'null'],
      ['top-level boolean', 'true'],
      ['top-level number', '42'],
      ['top-level string', JSON.stringify('audit hooks')],
      ['top-level array', '[]'],
      ['raw malformed non-trigger', 'hello {'],
      ['raw whitespace', '   '],
    ]) {
      checkExecution(
        `UserPromptSubmit exits silently for ${name}`,
        'UserPromptSubmit',
        runContextHook(expectedContextHooks.UserPromptSubmit.path, input),
        'forbidden',
      );
    }

    for (const eventName of ['SessionStart', 'UserPromptSubmit']) {
      const context = expectedContextHooks[eventName].context;
      const baseline = contextHookResult({ eventName, additionalContext: context });
      check(
        `${eventName} semantic oracle accepts its baseline fixture`,
        errorsFor(eventName, baseline).length === 0,
      );
      const mutants = eventName === 'SessionStart'
        ? [
          ['workspace identity removal', (value) => value.replace('3d_in_blueprints Codex infrastructure workspace. ', '')],
          ['authority removal', (value) => value.replace('Source of truth: AGENTS.md. ', '')],
          ['scope replacement', (value) => value.replace('Blender add-on plus local standalone backend', 'Windows executable')],
          ['profile inversion', (value) => value.replace('Active profile: blender-addon. Dormant profile: windows-exe.', 'Active profile: windows-exe. Dormant profile: blender-addon.')],
          ['orchestration removal', (value) => value.replace('Use explicit spawned subagents for broad work when available. ', '')],
          ['ship weakening', (value) => value.replace('npm run codex:ship', 'npm run quality:deep')],
          ['review removal', (value) => value.replace('and /review or the documented fallback', '')],
          ['contradictory profile addition', (value) => `${value} Active profile: windows-exe.`],
        ]
        : [
          ['authority removal', (value) => value.replace('Read AGENTS.md, ', '')],
          ['scope replacement', (value) => value.replace('Blender add-on + backend', 'Windows executable')],
          ['orchestration removal', (value) => value.replace('use explicit spawned subagents for broad work, ', '')],
          ['ship weakening', (value) => value.replace('npm run codex:ship', 'npm run quality:deep')],
          ['review removal', (value) => value.replace('plus /review or the documented fallback', '')],
          ['contradictory profile addition', (value) => `${value} Active profile: windows-exe.`],
        ];
      for (const [name, mutate] of mutants) {
        const mutatedContext = mutate(context);
        const candidate = contextHookResult({ eventName, additionalContext: mutatedContext });
        check(`${eventName} semantic mutant changes ${name}`, mutatedContext !== context);
        check(
          `${eventName} semantic oracle rejects ${name}`,
          errorsFor(eventName, candidate).length > 0,
        );
      }
    }

    const sessionContext = expectedContextHooks.SessionStart.context;
    const sessionFixture = (overrides = {}) => contextHookResult({
      eventName: 'SessionStart',
      additionalContext: sessionContext,
      ...overrides,
    });
    for (const [name, result] of [
      ['missing result', null],
      ['spawn error', sessionFixture({ error: Object.assign(new Error('spawn failed'), { code: 'ENOENT' }), status: null })],
      ['timeout', sessionFixture({ error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }), status: null })],
      ['signal', sessionFixture({ signal: 'SIGTERM', status: null })],
      ['null status', sessionFixture({ status: null })],
      ['nonzero status', sessionFixture({ status: 1 })],
      ['stderr output', sessionFixture({ stderr: 'unexpected' })],
      ['empty stdout', sessionFixture({ stdout: '' })],
      ['invalid JSON', sessionFixture({ stdout: '{' })],
      ['multiple JSON values', sessionFixture({ stdout: '{}{}' })],
      ['leading whitespace', sessionFixture({ stdout: ` ${sessionFixture().stdout}` })],
      ['wrong event', contextHookResult({ eventName: 'UserPromptSubmit', additionalContext: sessionContext })],
      ['non-string context', sessionFixture({ stdout: JSON.stringify(contextHookEnvelope('SessionStart', 42)) })],
      ['extra top-level key', sessionFixture({ extra: { topLevel: { extra: true } } })],
      ['extra hook key', sessionFixture({ extra: { hookSpecificOutput: { extra: true } } })],
      ['missing hookSpecificOutput', sessionFixture({ stdout: '{}' })],
    ]) {
      check(
        `context hook process fixture rejects ${name}`,
        contextHookExecutionErrors(result, executionContract('SessionStart')).length > 0,
      );
    }
    check(
      'context hook no-output oracle rejects unexpected stdout',
      contextHookExecutionErrors(
        contextHookResult({ stdout: 'unexpected' }),
        executionContract('UserPromptSubmit', 'forbidden'),
      ).length > 0,
    );
  }
}
