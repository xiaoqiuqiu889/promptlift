import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPackage } from '@electron/asar';

import { auditPackageSurface } from '../scripts/packageSurfaceAudit.mjs';

async function createFixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-lift-asar-audit-test-'));
  const appRoot = path.join(root, 'app');
  await Promise.all(Object.entries(files).map(async ([relativePath, contents]) => {
    const filePath = path.join(appRoot, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents, typeof contents === 'string' ? 'utf8' : undefined);
  }));
  const archivePath = path.join(root, 'app.asar');
  await createPackage(appRoot, archivePath);
  return {
    archivePath,
    appRoot,
    cleanup: () => fs.rm(root, { recursive: true, force: true }),
  };
}

const safePackage = JSON.stringify({
  name: 'prompt-lift-desktop',
  productName: 'Prompt Lift',
  version: '0.1.0',
  private: true,
  type: 'module',
  main: 'src/main.mjs',
});

const mascotFiles = Object.freeze({
  'src/renderer/assets/mascots/cockapoo.png': Buffer.from('89504e470d0a1a0a636f636b61706f6f', 'hex'),
  'src/renderer/assets/mascots/green-knight-pup.png': Buffer.from('89504e470d0a1a0a677265656e6b6e69676874707570', 'hex'),
});

function runtimeFiles(extra = {}) {
  return {
    'package.json': safePackage,
    'src/main.mjs': 'export const ready = true;\n',
    ...mascotFiles,
    ...extra,
  };
}

test('package surface audit accepts an exact minimal runtime archive', async () => {
  const fixture = await createFixture(runtimeFiles());
  try {
    const report = await auditPackageSurface({
      archivePath: fixture.archivePath,
      sourceRoot: path.join(fixture.appRoot, 'src'),
    });
    assert.equal(report.fileCount, 4);
    assert.equal(report.sourceMismatchCount, 0);
    assert.equal(report.secretFindingCount, 0);
    assert.equal(report.runtimeImageCount, 2);
    assert.equal(report.mascotAssetCount, 2);
    assert.equal(report.verifiedMascotHashes, 2);
  } finally {
    await fixture.cleanup();
  }
});

test('package surface audit rejects a missing required mascot asset', async () => {
  const {
    'src/renderer/assets/mascots/green-knight-pup.png': _missing,
    ...incompleteRuntime
  } = runtimeFiles();
  const fixture = await createFixture(incompleteRuntime);
  try {
    await assert.rejects(
      auditPackageSurface({
        archivePath: fixture.archivePath,
        sourceRoot: path.join(fixture.appRoot, 'src'),
      }),
      (error) => error.code === 'PACKAGE_SURFACE_INVALID'
        && error.findings.some((finding) => finding.rule === 'missing-runtime-asset'
          && finding.path === 'src/renderer/assets/mascots/green-knight-pup.png'),
    );
  } finally {
    await fixture.cleanup();
  }
});

test('package surface audit rejects image assets outside the two used PNG mascots', async () => {
  const fixture = await createFixture(runtimeFiles({
    'src/renderer/assets/mascots/extra.png': Buffer.from('89504e470d0a1a0a6578747261', 'hex'),
  }));
  try {
    await assert.rejects(
      auditPackageSurface({
        archivePath: fixture.archivePath,
        sourceRoot: path.join(fixture.appRoot, 'src'),
      }),
      (error) => error.code === 'PACKAGE_SURFACE_INVALID'
        && error.findings.some((finding) => finding.rule === 'unexpected-runtime-asset'
          && finding.path === 'src/renderer/assets/mascots/extra.png'),
    );
  } finally {
    await fixture.cleanup();
  }
});

test('package surface audit does not require a redundant PNG for the CSS green knight', async () => {
  const fixture = await createFixture(runtimeFiles({
    'src/renderer/assets/mascots/classic-green-knight.png': Buffer.from(
      '89504e470d0a1a0a636c61737369636b6e69676874',
      'hex',
    ),
  }));
  try {
    await assert.rejects(
      auditPackageSurface({
        archivePath: fixture.archivePath,
        sourceRoot: path.join(fixture.appRoot, 'src'),
      }),
      (error) => error.code === 'PACKAGE_SURFACE_INVALID'
        && error.findings.some((finding) => finding.rule === 'unexpected-runtime-asset'
          && finding.path === 'src/renderer/assets/mascots/classic-green-knight.png'),
    );
  } finally {
    await fixture.cleanup();
  }
});

test('package surface audit rejects the green knight pup when its packaged hash differs from the workspace', async () => {
  const fixture = await createFixture(runtimeFiles());
  try {
    await fs.writeFile(
      path.join(fixture.appRoot, 'src', 'renderer', 'assets', 'mascots', 'green-knight-pup.png'),
      Buffer.from('89504e470d0a1a0a6368616e676564', 'hex'),
    );
    await assert.rejects(
      auditPackageSurface({
        archivePath: fixture.archivePath,
        sourceRoot: path.join(fixture.appRoot, 'src'),
      }),
      (error) => error.code === 'PACKAGE_SURFACE_INVALID'
        && error.findings.some((finding) => finding.rule === 'mascot-source-mismatch'
          && finding.path === 'src/renderer/assets/mascots/green-knight-pup.png'),
    );
  } finally {
    await fixture.cleanup();
  }
});

test('package surface audit rejects forbidden paths and development metadata', async () => {
  const fixture = await createFixture(runtimeFiles({
    'package.json': JSON.stringify({
      ...JSON.parse(safePackage),
      scripts: { test: 'node --test' },
      devDependencies: { electron: '43.2.0' },
    }),
    'qa/evidence.json': '{}',
  }));
  try {
    await assert.rejects(
      auditPackageSurface({
        archivePath: fixture.archivePath,
        sourceRoot: path.join(fixture.appRoot, 'src'),
      }),
      (error) => error.code === 'PACKAGE_SURFACE_INVALID'
        && error.findings.some((finding) => finding.rule === 'forbidden-path')
        && error.findings.some((finding) => finding.rule === 'development-metadata'),
    );
  } finally {
    await fixture.cleanup();
  }
});

test('package surface audit rejects secret-shaped literals without printing the value', async () => {
  const fixture = await createFixture(runtimeFiles({
    'src/main.mjs': 'const header = "Authorization: Bearer TEST_ONLY_NOT_A_REAL_SECRET_123456";\n',
  }));
  try {
    await assert.rejects(
      auditPackageSurface({
        archivePath: fixture.archivePath,
        sourceRoot: path.join(fixture.appRoot, 'src'),
      }),
      (error) => error.code === 'PACKAGE_SURFACE_INVALID'
        && error.findings.some((finding) => finding.rule === 'secret-pattern')
        && !error.message.includes('TEST_ONLY_NOT_A_REAL_SECRET'),
    );
  } finally {
    await fixture.cleanup();
  }
});

test('package surface audit rejects archive source that differs from the reviewed input', async () => {
  const fixture = await createFixture(runtimeFiles());
  try {
    await fs.writeFile(
      path.join(fixture.appRoot, 'src', 'main.mjs'),
      'export const ready = false;\n',
      'utf8',
    );
    await assert.rejects(
      auditPackageSurface({
        archivePath: fixture.archivePath,
        sourceRoot: path.join(fixture.appRoot, 'src'),
      }),
      (error) => error.code === 'PACKAGE_SURFACE_INVALID'
        && error.findings.some((finding) => finding.rule === 'source-mismatch'),
    );
  } finally {
    await fixture.cleanup();
  }
});
