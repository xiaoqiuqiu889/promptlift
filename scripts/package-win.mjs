import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { packager } from '@electron/packager';

import { auditPackageSurface } from './packageSurfaceAudit.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = process.env.PROMPT_LIFT_RELEASE_ROOT
  ? path.resolve(process.env.PROMPT_LIFT_RELEASE_ROOT)
  : path.join(projectRoot, 'release');
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-lift-package-'));
const stagingRoot = path.join(tempRoot, 'app');
const packageOutRoot = path.join(tempRoot, 'out');

try {
  await fs.mkdir(stagingRoot, { recursive: true });
  await fs.cp(
    path.join(projectRoot, 'src'),
    path.join(stagingRoot, 'src'),
    { recursive: true },
  );
  const packageMetadata = JSON.parse(
    await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'),
  );
  const {
    scripts: _scripts,
    devDependencies: _devDependencies,
    ...runtimePackageMetadata
  } = packageMetadata;
  await fs.writeFile(
    path.join(stagingRoot, 'package.json'),
    JSON.stringify(runtimePackageMetadata, null, 2),
    'utf8',
  );
  const installedElectronMetadata = JSON.parse(
    await fs.readFile(path.join(projectRoot, 'node_modules', 'electron', 'package.json'), 'utf8'),
  );

  const packagedPaths = await packager({
    dir: stagingRoot,
    name: 'Prompt Lift',
    platform: 'win32',
    arch: 'x64',
    electronVersion: installedElectronMetadata.version,
    out: packageOutRoot,
    overwrite: true,
    prune: false,
    asar: true,
    tmpdir: false,
  });

  if (!Array.isArray(packagedPaths) || packagedPaths.length !== 1) {
    throw new Error('Windows package was not created');
  }

  const packagedDir = packagedPaths[0];
  const packageSurface = await auditPackageSurface({
    archivePath: path.join(packagedDir, 'resources', 'app.asar'),
    sourceRoot: path.join(projectRoot, 'src'),
  });

  await fs.rm(releaseRoot, { recursive: true, force: true });
  await fs.mkdir(releaseRoot, { recursive: true });
  const releaseDir = path.join(releaseRoot, path.basename(packagedDir));
  await fs.cp(packagedDir, releaseDir, { recursive: true });

  const executablePath = path.join(releaseDir, 'Prompt Lift.exe');
  await fs.access(executablePath);
  console.log(
    `Package surface verified: ${packageSurface.fileCount} files, `
      + `${packageSurface.sourceFileCount} reviewed source files, `
      + `${packageSurface.verifiedMascotHashes}/2 mascot hashes`,
  );
  console.log(`Windows package ready: ${executablePath}`);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
