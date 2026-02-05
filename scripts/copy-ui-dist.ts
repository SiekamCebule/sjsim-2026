import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const uiDist = path.resolve(root, 'packages', 'ui', 'dist');
const appUiDist = path.resolve(root, 'packages', 'app', 'ui', 'dist');

async function main(): Promise<void> {
  const stat = await fs.stat(uiDist).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`UI dist not found. Build UI first: ${uiDist}`);
  }

  await fs.rm(appUiDist, { recursive: true, force: true });
  await fs.mkdir(path.dirname(appUiDist), { recursive: true });
  await fs.cp(uiDist, appUiDist, { recursive: true });

  console.log(`[copy-ui-dist] Copied UI dist to ${appUiDist}`);
}

main().catch((error) => {
  console.error('[copy-ui-dist] Failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
