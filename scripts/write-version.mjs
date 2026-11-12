// כותב public/version.json לפני build. מספר ה-build = זמן ה-commit (שניות),
// כך ש-APK ו-GitHub Pages שנבנו מאותו commit מזוהים כאותה גרסה.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const git = (cmd) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
const build = Number(git('git log -1 --format=%ct')) || Math.floor(Date.now() / 1000);
const info = {
  version: pkg.version,
  build,
  commit: git('git rev-parse --short HEAD') || 'local',
  date: new Date(build * 1000).toISOString(),
};
mkdirSync('public', { recursive: true });
writeFileSync('public/version.json', JSON.stringify(info, null, 2) + '\n');
console.log(`version.json → ${info.version} (build ${info.build}, ${info.commit})`);
