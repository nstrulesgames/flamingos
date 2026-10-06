import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const root = fileURLToPath(new URL('..', import.meta.url));
export function loadDatabaseEnvironment() {
  for (const name of ['.env', '.env.runtime']) {
    const path = resolve(root, name);
    if (existsSync(path)) process.loadEnvFile(path);
  }
  return process.env.FLAMINGO_DATABASE_URL || process.env.DATABASE_URL;
}
