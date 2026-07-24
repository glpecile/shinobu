// Bumps expo.version + expo.android.versionCode in app.json together so
// agents and humans produce identical release bumps (KTD-5: versionCode is a
// monotonic integer maintained here, never derived from semver). Usage:
//   bun release:bump <patch|minor|major|x.y.z>

export interface AppVersion {
  version: string;
  versionCode: number;
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

function parseSemver(version: string): [number, number, number] {
  const match = SEMVER_RE.exec(version);
  if (!match) throw new Error(`Invalid semver: "${version}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = parseSemver(a);
  const [bMajor, bMinor, bPatch] = parseSemver(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

/** Pure core: computes the next {version, versionCode}. Throws on invalid input or a downgrade. */
export function bumpVersion(current: AppVersion, arg: string): AppVersion {
  let nextVersion: string;

  if (arg === 'patch' || arg === 'minor' || arg === 'major') {
    const [major, minor, patch] = parseSemver(current.version);
    if (arg === 'patch') nextVersion = `${major}.${minor}.${patch + 1}`;
    else if (arg === 'minor') nextVersion = `${major}.${minor + 1}.0`;
    else nextVersion = `${major + 1}.0.0`;
  } else {
    parseSemver(arg); // throws on malformed explicit version
    nextVersion = arg;
  }

  if (compareSemver(nextVersion, current.version) <= 0) {
    throw new Error(
      `Refusing to bump ${current.version} -> ${nextVersion}: not an increase`,
    );
  }

  return { version: nextVersion, versionCode: current.versionCode + 1 };
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function isPrimitiveArray(value: Json[]): boolean {
  return value.every((item) => item === null || typeof item !== 'object');
}

/**
 * Matches this repo's existing app.json formatting (prettier-style): arrays
 * of scalars stay on one line, everything else is 2-space multi-line JSON.
 * A plain `JSON.stringify(obj, null, 2)` would explode every array onto its
 * own lines and reformat untouched fields, defeating the "minimal diff" goal.
 */
function stringifyAppJson(value: Json, indent = ''): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (isPrimitiveArray(value)) {
      return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
    }
    const childIndent = `${indent}  `;
    const items = value.map(
      (item) => `${childIndent}${stringifyAppJson(item, childIndent)}`,
    );
    return `[\n${items.join(',\n')}\n${indent}]`;
  }

  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const childIndent = `${indent}  `;
    const entries = keys.map(
      (key) =>
        `${childIndent}${JSON.stringify(key)}: ${stringifyAppJson(value[key], childIndent)}`,
    );
    return `{\n${entries.join(',\n')}\n${indent}}`;
  }

  return JSON.stringify(value);
}

if (import.meta.main) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: bun release:bump <patch|minor|major|x.y.z>');
    process.exit(1);
  }

  const appJsonPath = new URL('../app.json', import.meta.url);
  const raw = await Bun.file(appJsonPath).text();
  const appJson = JSON.parse(raw);

  const current: AppVersion = {
    version: appJson.expo.version,
    versionCode: appJson.expo.android.versionCode,
  };

  let next: AppVersion;
  try {
    next = bumpVersion(current, arg);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  appJson.expo.version = next.version;
  appJson.expo.android.versionCode = next.versionCode;
  await Bun.write(appJsonPath, `${stringifyAppJson(appJson)}\n`);

  console.log(`${current.version} (code ${current.versionCode}) -> ${next.version} (code ${next.versionCode})`);
  console.log(`\nNext: git commit -am "chore: bump version to ${next.version}" && git tag v${next.version} && git push origin v${next.version}`);
}
