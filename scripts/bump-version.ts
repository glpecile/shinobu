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

export function bumpVersion(current: AppVersion, arg: string): AppVersion {
  let nextVersion: string;

  if (arg === 'patch' || arg === 'minor' || arg === 'major') {
    const [major, minor, patch] = parseSemver(current.version);
    if (arg === 'patch') nextVersion = `${major}.${minor}.${patch + 1}`;
    else if (arg === 'minor') nextVersion = `${major}.${minor + 1}.0`;
    else nextVersion = `${major + 1}.0.0`;
  } else {
    parseSemver(arg);
    nextVersion = arg;
  }

  if (compareSemver(nextVersion, current.version) <= 0) {
    throw new Error(`Refusing to bump ${current.version} -> ${nextVersion}: not an increase`);
  }

  return { version: nextVersion, versionCode: current.versionCode + 1 };
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function isPrimitiveArray(value: Json[]): boolean {
  return value.every((item) => item === null || typeof item !== 'object');
}

function stringifyAppJson(value: Json, indent = ''): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (isPrimitiveArray(value)) {
      return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
    }
    const childIndent = `${indent}  `;
    const items = value.map((item) => `${childIndent}${stringifyAppJson(item, childIndent)}`);
    return `[\n${items.join(',\n')}\n${indent}]`;
  }

  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const childIndent = `${indent}  `;
    const entries = keys.map(
      (key) => `${childIndent}${JSON.stringify(key)}: ${stringifyAppJson(value[key], childIndent)}`,
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

  console.log(
    `${current.version} (code ${current.versionCode}) -> ${next.version} (code ${next.versionCode})`,
  );
  console.log(
    `\nNext: git commit -am "chore: bump version to ${next.version}" && git tag v${next.version} && git push origin v${next.version}`,
  );
}
