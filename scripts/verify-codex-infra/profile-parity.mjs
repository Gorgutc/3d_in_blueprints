import {
  parseConfigProfileStatuses,
  parseProfileStateClaims,
} from '../lib/profile-claim-parser.mjs';

const VERIFIER_PROFILE_ALIASES = Object.freeze({
  'blender-addon': Object.freeze(['blender-addon', 'Blender add-on']),
  'windows-exe': Object.freeze(['windows-exe', 'Windows executable', 'Windows EXE']),
});

const VERIFIER_PROFILE_STATES = Object.freeze({
  'blender-addon': 'active',
  'windows-exe': 'dormant',
});

const IMPLICIT_PROFILE_OWNERS = Object.freeze({
  'docs/agent/profiles/blender-addon.md': 'blender-addon',
  'docs/agent/profiles/windows-exe.md': 'windows-exe',
});

const REQUIRED_OWNER_CLAIMS = Object.freeze({
  'AGENTS.md': Object.freeze([
    Object.freeze(['blender-addon', 'active']),
    Object.freeze(['windows-exe', 'dormant']),
  ]),
  'README.md': Object.freeze([
    Object.freeze(['blender-addon', 'active']),
    Object.freeze(['windows-exe', 'dormant']),
  ]),
  'docs/agent/frozen-decisions.md': Object.freeze([
    Object.freeze(['blender-addon', 'active']),
    Object.freeze(['windows-exe', 'dormant']),
  ]),
  'docs/agent/profiles/blender-addon.md': Object.freeze([
    Object.freeze(['blender-addon', 'active']),
  ]),
  'docs/agent/profiles/windows-exe.md': Object.freeze([
    Object.freeze(['windows-exe', 'dormant']),
  ]),
});

function currentProfileText(source, relativePath) {
  if (relativePath === 'docs/agent/profiles/blender-addon.md') {
    return source.split('## Historical Iteration Contracts')[0];
  }
  return source;
}

function claimsFor(relativePath, source) {
  return parseProfileStateClaims(currentProfileText(source, relativePath), {
    aliases: VERIFIER_PROFILE_ALIASES,
    implicitProfileId: IMPLICIT_PROFILE_OWNERS[relativePath] ?? null,
  });
}

function profileParityErrors(surfaces) {
  const errors = [];
  const configPath = '.codex/config.toml';
  const config = surfaces[configPath] ?? '';
  for (const [profileId, expectedState] of Object.entries(VERIFIER_PROFILE_STATES)) {
    const claims = parseConfigProfileStatuses(config, profileId);
    if (claims.length !== 1 || claims[0].state !== expectedState) {
      const detail = claims.map((claim) => `${claim.line}:${claim.text}`).join(', ') || '<missing>';
      errors.push(`${configPath}:1: ${profileId} must have exactly one ${expectedState} status; found ${detail}`);
    }
  }

  const claimsByPath = new Map();
  for (const relativePath of Object.keys(surfaces).sort((left, right) => left.localeCompare(right))) {
    if (relativePath === configPath) continue;
    const claims = claimsFor(relativePath, surfaces[relativePath] ?? '');
    claimsByPath.set(relativePath, claims);
    for (const claim of claims) {
      const expectedState = VERIFIER_PROFILE_STATES[claim.profileId];
      if (claim.state !== expectedState) {
        errors.push(
          `${relativePath}:${claim.line}: ${claim.profileId}=${claim.state}; expected ${expectedState}: ${claim.text}`,
        );
      }
    }
  }

  for (const [relativePath, requiredClaims] of Object.entries(REQUIRED_OWNER_CLAIMS)) {
    const claims = claimsByPath.get(relativePath) ?? [];
    for (const [profileId, state] of requiredClaims) {
      if (!claims.some((claim) => claim.profileId === profileId && claim.state === state)) {
        errors.push(`${relativePath}:1: missing mandatory owner claim ${profileId}=${state}`);
      }
    }
  }
  return errors;
}

function collectProfilePaths({ exists, listFiles, listRootMarkdownFiles }) {
  return [...new Set([
    ...listRootMarkdownFiles(),
    ...listFiles('.agents/plugins').filter((relativePath) => relativePath.endsWith('.json')),
    ...listFiles('.codex/agents'),
    '.codex/config.toml',
    '.codex/hooks.json',
    ...listFiles('.codex/hooks'),
    'plugins/blueprints-codex/.codex-plugin/plugin.json',
    ...listFiles('plugins/blueprints-codex/skills').filter((relativePath) => (
      relativePath.endsWith('/SKILL.md') || /\/agents\/openai\.ya?ml$/i.test(relativePath)
    )),
    ...listFiles('docs/agent').filter((relativePath) => (
      relativePath !== 'docs/agent/migration-inventory.md'
      && !relativePath.startsWith('docs/agent/adrs/')
    )),
    ...listFiles('docs/release'),
  ])].filter(exists).sort((left, right) => left.localeCompare(right));
}

function cloneSurfaces(surfaces) {
  return { ...surfaces };
}

function oppositeState(profileId) {
  return VERIFIER_PROFILE_STATES[profileId] === 'active' ? 'dormant' : 'active';
}

function explicitClaim(profileId, state) {
  return `The \`${profileId}\` profile is ${state}.`;
}

export function registerProfileParityChecks({
  check,
  checkFrozenLive,
  exists,
  listFiles,
  listRootMarkdownFiles,
  read,
}) {
  const paths = collectProfilePaths({ exists, listFiles, listRootMarkdownFiles });
  const surfaces = Object.fromEntries(paths.map((relativePath) => [relativePath, read(relativePath)]));
  const liveErrors = profileParityErrors(surfaces);
  checkFrozenLive(
    'FD-003',
    'profile states are exact across dynamically discovered live projections',
    liveErrors.length === 0,
    liveErrors.join('; '),
  );
  check(
    'independent profile inventory contains every mandatory owner surface',
    Object.keys(REQUIRED_OWNER_CLAIMS).every((relativePath) => paths.includes(relativePath)),
  );

  const aliasClaims = parseProfileStateClaims([
    'Active profile: `blender-addon`.',
    'The Blender add-on profile remains active.',
    'Dormant profile: windows-exe.',
    'The Windows executable profile is dormant.',
  ].join('\n'), { aliases: VERIFIER_PROFILE_ALIASES });
  check(
    'independent profile parser oracle recognizes exact ids and natural aliases',
    JSON.stringify(aliasClaims.map(({ profileId, state }) => [profileId, state])) === JSON.stringify([
      ['blender-addon', 'active'],
      ['blender-addon', 'active'],
      ['windows-exe', 'dormant'],
      ['windows-exe', 'dormant'],
    ]),
  );
  const wrappedClaims = parseProfileStateClaims(
    'Header\r\nProfile status for Windows executable:\r\ndormant.\r\n',
    { aliases: VERIFIER_PROFILE_ALIASES },
  );
  check(
    'independent profile parser oracle preserves wrapped CRLF line context',
    wrappedClaims.length === 1
      && wrappedClaims[0].profileId === 'windows-exe'
      && wrappedClaims[0].state === 'dormant'
      && wrappedClaims[0].line === 2,
  );
  const normativeClaims = parseProfileStateClaims([
    'The Windows executable profile must remain active.',
    'The `windows-exe` profile should be active.',
    'The Blender add-on profile must\r\nremain dormant.',
  ].join('\n'), { aliases: VERIFIER_PROFILE_ALIASES });
  check(
    'independent profile parser oracle recognizes normative and wrapped state contradictions',
    JSON.stringify(normativeClaims.map(({ profileId, state }) => [profileId, state]))
      === JSON.stringify([
        ['windows-exe', 'active'],
        ['windows-exe', 'active'],
        ['blender-addon', 'dormant'],
      ]),
  );
  const implicitNormativeClaims = parseProfileStateClaims(
    'This profile must remain active.',
    { aliases: VERIFIER_PROFILE_ALIASES, implicitProfileId: 'windows-exe' },
  );
  check(
    'independent profile parser oracle recognizes implicit-owner normative contradictions',
    JSON.stringify(implicitNormativeClaims.map(({ profileId, state }) => [profileId, state]))
      === JSON.stringify([['windows-exe', 'active']]),
  );
  for (const [name, source] of [
    ['unrelated active installer clause', 'While the windows-exe profile is dormant, verify that no installer command is active.'],
    ['active packaging before dormant profile', 'Active two-ZIP packaging remains separate from the dormant Windows EXE profile.'],
    ['activation verb', 'The Windows executable profile is dormant until explicitly activated.'],
  ]) {
    const claims = parseProfileStateClaims(source, { aliases: VERIFIER_PROFILE_ALIASES });
    check(
      `independent profile parser avoids false positive: ${name}`,
      JSON.stringify(claims.map(({ profileId, state }) => [profileId, state]))
        === JSON.stringify([['windows-exe', 'dormant']]),
    );
  }

  for (const [name, mutate] of [
    ['missing config status', (candidate) => {
      candidate['.codex/config.toml'] = candidate['.codex/config.toml'].replace('status = "dormant"', '');
    }],
    ['duplicate config status', (candidate) => {
      candidate['.codex/config.toml'] = candidate['.codex/config.toml'].replace('status = "dormant"', 'status = "dormant"\nstatus = "dormant"');
    }],
    ['inverted config status', (candidate) => {
      candidate['.codex/config.toml'] = candidate['.codex/config.toml'].replace('status = "dormant"', 'status = "active"');
    }],
  ]) {
    const candidate = cloneSurfaces(surfaces);
    mutate(candidate);
    check(`independent profile negative fixture rejects ${name}`, profileParityErrors(candidate).length > 0);
  }

  for (const [relativePath, requiredClaims] of Object.entries(REQUIRED_OWNER_CLAIMS)) {
    const deleted = cloneSurfaces(surfaces);
    deleted[relativePath] = '';
    check(
      `independent profile negative fixture rejects owner deletion: ${relativePath}`,
      profileParityErrors(deleted).some((error) => error.startsWith(`${relativePath}:`)),
    );
    const inverted = cloneSurfaces(surfaces);
    const [profileId] = requiredClaims[0];
    const inversion = explicitClaim(profileId, oppositeState(profileId));
    inverted[relativePath] = relativePath === 'docs/agent/profiles/blender-addon.md'
      ? inverted[relativePath].replace(
        '## Historical Iteration Contracts',
        `${inversion}\n\n## Historical Iteration Contracts`,
      )
      : `${inverted[relativePath]}\n${inversion}\n`;
    check(
      `independent profile negative fixture rejects owner inversion: ${relativePath}`,
      profileParityErrors(inverted).some((error) => error.startsWith(`${relativePath}:`)),
    );
  }

  for (const [name, relativePath, source] of [
    ['exact-id additive contradiction', 'docs/agent/new-exact-consumer.md', 'The `windows-exe` profile is active.'],
    ['alias additive contradiction', 'docs/agent/new-alias-consumer.md', 'The Windows executable profile is active.'],
    ['wrapped CRLF additive contradiction', 'docs/agent/new-wrapped-consumer.md', 'Profile status for Windows executable:\r\nactive.'],
  ]) {
    const candidate = cloneSurfaces(surfaces);
    candidate[relativePath] = source;
    check(
      `independent profile negative fixture rejects ${name}`,
      profileParityErrors(candidate).some((error) => error.startsWith(`${relativePath}:`)),
    );
  }

  const diagnosticCandidate = cloneSurfaces(surfaces);
  diagnosticCandidate['docs/agent/new-diagnostic-consumer.md'] = 'Header\nThe Windows executable profile is active.\n';
  check(
    'independent profile diagnostics retain path line and claim context',
    profileParityErrors(diagnosticCandidate).some((error) => (
      error.startsWith('docs/agent/new-diagnostic-consumer.md:2:')
      && error.includes('Windows executable profile is active')
    )),
  );

  for (const relativePath of [
    'docs/release/packaging.md',
    '.codex/agents/windows_packaging_guardian.toml',
    'plugins/blueprints-codex/skills/blueprints-a11y-seo-deploy/SKILL.md',
  ]) {
    const scanOnlyDeletion = cloneSurfaces(surfaces);
    scanOnlyDeletion[relativePath] = '';
    check(
      `independent profile positive fixture permits scan-only claim deletion: ${relativePath}`,
      profileParityErrors(scanOnlyDeletion).length === 0,
    );
  }
  const matchingAddition = cloneSurfaces(surfaces);
  matchingAddition['docs/agent/new-matching-consumer.md'] = [
    'The Blender add-on profile is active.',
    'The Windows executable profile is dormant.',
  ].join('\n');
  check(
    'independent profile positive fixture permits matching new and cross-profile claims',
    profileParityErrors(matchingAddition).length === 0,
  );
  const historicalAddition = cloneSurfaces(surfaces);
  historicalAddition['docs/agent/profiles/blender-addon.md'] += '\nThe `windows-exe` profile is active.\n';
  check(
    'independent profile positive fixture ignores historical Blender profile suffix',
    profileParityErrors(historicalAddition).length === 0,
  );
}
