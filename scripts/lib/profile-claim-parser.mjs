const IDENTIFIER_EDGE = '[A-Za-z0-9_-]';
const STATE = '(?<state>active|dormant)';
const STATE_LINK = '(?:is|remains|stays|(?:must|should)\\s+(?:be|remain|stay))';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasPattern(alias) {
  return `(?<!${IDENTIFIER_EDGE})\`?${escapeRegExp(alias)}\`?(?!${IDENTIFIER_EDGE})`;
}

function claimPatterns(alias) {
  const boundedAlias = aliasPattern(alias);
  const optionalProfile = '(?:\\s+(?:product\\s+)?profile)?';
  return [
    new RegExp(`\\b${STATE}\\b\\s+(?:profile\\s*[:=-]\\s*${boundedAlias}|${boundedAlias}${optionalProfile})`, 'gi'),
    new RegExp(`${boundedAlias}${optionalProfile}\\s+${STATE_LINK}\\s+\\b${STATE}\\b`, 'gi'),
    new RegExp(`\\b(?:keep|keeps|keeping)\\b\\s+(?:the\\s+)?${boundedAlias}${optionalProfile}\\s+\\b${STATE}\\b`, 'gi'),
    new RegExp(`\\b(?:profile\\s+)?status\\s+(?:for|of)\\s+${boundedAlias}\\s*[:=-]\\s*\\b${STATE}\\b`, 'gi'),
    new RegExp(`${boundedAlias}${optionalProfile}\\s*[:=-]\\s*\\b${STATE}\\b`, 'gi'),
  ];
}

function lineNumberAt(source, offset) {
  return source.slice(0, offset).split(/\r\n|\r|\n/).length;
}

function recordClaim(claims, source, match, profileId) {
  claims.push({
    profileId,
    state: match.groups.state.toLowerCase(),
    line: lineNumberAt(source, match.index),
    text: match[0].replace(/\s+/g, ' ').trim(),
    start: match.index,
    end: match.index + match[0].length,
  });
}

export function parseProfileStateClaims(
  source,
  { aliases, implicitProfileId = null } = {},
) {
  if (typeof source !== 'string') throw new TypeError('profile claim source must be a string');
  if (!aliases || Array.isArray(aliases) || typeof aliases !== 'object') {
    throw new TypeError('profile aliases must be an object keyed by profile id');
  }

  const claims = [];
  for (const [profileId, profileAliases] of Object.entries(aliases)) {
    for (const alias of profileAliases) {
      for (const pattern of claimPatterns(alias)) {
        for (const match of source.matchAll(pattern)) recordClaim(claims, source, match, profileId);
      }
    }
  }

  if (implicitProfileId !== null) {
    for (const pattern of [
      /\bstatus\s*[:=]\s*\b(?<state>active|dormant)\b/gi,
      new RegExp(`\\b(?:this\\s+)?profile\\s+${STATE_LINK}\\s+\\b${STATE}\\b`, 'gi'),
    ]) {
      for (const match of source.matchAll(pattern)) recordClaim(claims, source, match, implicitProfileId);
    }
  }

  const accepted = [];
  return claims
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((claim) => {
      const overlaps = accepted.some((candidate) => (
        candidate.profileId === claim.profileId
          && candidate.state === claim.state
          && candidate.start < claim.end
          && claim.start < candidate.end
      ));
      if (overlaps) return false;
      accepted.push(claim);
      return true;
    })
    .map(({ profileId, state, line, text }) => ({ profileId, state, line, text }));
}

export function parseConfigProfileStatuses(source, profileId) {
  if (typeof source !== 'string') throw new TypeError('profile config source must be a string');
  if (typeof profileId !== 'string' || profileId.length === 0) {
    throw new TypeError('profile id must be a non-empty string');
  }

  const lines = source.split(/\r\n|\r|\n/);
  const blockStarts = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*\[\[profiles\]\]\s*$/.test(lines[index])) blockStarts.push(index);
  }

  const claims = [];
  for (let blockIndex = 0; blockIndex < blockStarts.length; blockIndex += 1) {
    const start = blockStarts[blockIndex];
    const end = blockStarts[blockIndex + 1] ?? lines.length;
    const block = lines.slice(start, end);
    const names = block
      .map((line) => line.match(/^\s*name\s*=\s*"([^"]+)"\s*$/)?.[1])
      .filter((value) => value !== undefined);
    if (!names.includes(profileId)) continue;
    for (let offset = 0; offset < block.length; offset += 1) {
      const match = block[offset].match(/^\s*status\s*=\s*"([^"]+)"\s*$/);
      if (!match) continue;
      claims.push({
        profileId,
        state: match[1],
        line: start + offset + 1,
        text: block[offset].trim(),
      });
    }
  }
  return claims;
}
