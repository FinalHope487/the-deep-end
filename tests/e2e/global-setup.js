// Rebuild dist/index.html before every run so the single-file test checks current sources.
import { execSync } from 'node:child_process';

export default function globalSetup() {
  execSync('node tools/build.mjs', { stdio: 'inherit' });
}
