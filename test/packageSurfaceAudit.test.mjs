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
    await fs.writeFile(filePath, contents, 'utf8');
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

test('package surface audit accepts an exact minimal runtime archive', async () => {
  const fixture = await createFixture({
    'package.json': safePackage,
    'src/main.mjs': 'export const ready = true;\n',
  });
  try {
    const report = await auditPackageSurface({
      archivePath: fixture.archivePath,
      sourceRoot: path.join(fixture.appRoot, 'src'),
    });
    assert.equal(report.fileCount, 2);
    assert.equal(report.sourceMismatchCount, 0);
    assert.equal(report.secretFindingCount, 0);
  } finally {
    await fixture.cleanup();
  }
});

test('package surface audit rejects forbidden paths and development metadata', async () => {
  const fixture = await createFixture({
    'package.json': JSON.stringify({
      ...JSON.parse(safePackage),
      scripts: { test: 'node --test' },
      devDependencies: { electron: '43.2.0' },
    }),
    'src/main.mjs': 'export const ready = true;\n',
    'qa/evidence.json': '{}',
  });
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
  const fixture = await createFixture({
    'package.json': safePackage,
    'src/main.mjs': 'const header = "Authorization: Bearer TEST_ONLY_NOT_A_REAL_SECRET_123456";\n',
  });
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
  const fixture = await createFixture({
    'package.json': safePackage,
    'src/main.mjs': 'export const ready = true;\n',
  });
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
