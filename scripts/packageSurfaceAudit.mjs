import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { extractFile, listPackage, statFile } from '@electron/asar';

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.txt',
]);
const FORBIDDEN_SEGMENTS = new Set([
  '.git',
  'coverage',
  'dist',
  'docs',
  'node_modules',
  'qa',
  'release',
  'test',
  'tests',
]);
const FORBIDDEN_FILE_PATTERNS = [
  /^\.env(?:\.|$)/iu,
  /\.(?:log|map|pem|key)$/iu,
];
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/-]{20,}/iu,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\b(?:api[_-]?key|access[_-]?token|password|secret)\b\s*[:=]\s*["'][^"'\r\n]{16,}["']/iu,
];

function normalizeArchivePath(value) {
  return value.replaceAll('\\', '/').replace(/^\/+/u, '');
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function listSourceFiles(root, prefix = '') {
  const entries = await fs.readdir(path.join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.posix.join(prefix.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(root, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function packageSurfaceError(findings) {
  const rules = [...new Set(findings.map((finding) => finding.rule))].sort();
  const error = new Error(
    `Windows package surface failed ${findings.length} check(s): ${rules.join(', ')}`,
  );
  error.code = 'PACKAGE_SURFACE_INVALID';
  error.findings = findings;
  return error;
}

function inspectMetadata(contents, findings) {
  let metadata;
  try {
    metadata = JSON.parse(contents.toString('utf8'));
  } catch {
    findings.push({ path: 'package.json', rule: 'invalid-metadata' });
    return;
  }
  if (metadata.main !== 'src/main.mjs'
    || metadata.name !== 'prompt-lift-desktop'
    || metadata.productName !== 'Prompt Lift'
    || metadata.type !== 'module') {
    findings.push({ path: 'package.json', rule: 'runtime-metadata' });
  }
  for (const field of ['scripts', 'devDependencies', 'dependencies']) {
    if (Object.hasOwn(metadata, field)) {
      findings.push({
        path: 'package.json',
        rule: 'development-metadata',
        detail: field,
      });
    }
  }
}

function inspectPath(filePath, findings) {
  const segments = filePath.split('/');
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment.toLowerCase()))
    || FORBIDDEN_FILE_PATTERNS.some((pattern) => pattern.test(path.posix.basename(filePath)))) {
    findings.push({ path: filePath, rule: 'forbidden-path' });
  }
}

function inspectSecrets(filePath, contents, findings) {
  if (!TEXT_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase())) {
    return;
  }
  const text = contents.toString('utf8');
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
    findings.push({ path: filePath, rule: 'secret-pattern' });
  }
}

export async function auditPackageSurface({ archivePath, sourceRoot }) {
  const findings = [];
  const archiveEntries = listPackage(archivePath, { isPack: false })
    .map((rawPath) => ({
      accessPath: rawPath.replace(/^[/\\]+/u, ''),
      normalizedPath: normalizeArchivePath(rawPath),
    }));
  const archiveFiles = archiveEntries.filter((entry) => {
    const metadata = statFile(archivePath, entry.accessPath, false);
    if ('link' in metadata) {
      findings.push({ path: entry.normalizedPath, rule: 'symlink' });
      return false;
    }
    return !('files' in metadata);
  });
  const sourceFiles = await listSourceFiles(sourceRoot);
  const expectedFiles = ['package.json', ...sourceFiles.map((file) => `src/${file}`)];
  const actualSet = new Set(archiveFiles.map((entry) => entry.normalizedPath));
  const expectedSet = new Set(expectedFiles);

  for (const { normalizedPath: filePath } of archiveFiles) {
    inspectPath(filePath, findings);
    if (!expectedSet.has(filePath)) {
      findings.push({ path: filePath, rule: 'unexpected-file' });
    }
  }
  for (const filePath of expectedFiles) {
    if (!actualSet.has(filePath)) {
      findings.push({ path: filePath, rule: 'missing-file' });
    }
  }

  let sourceMismatchCount = 0;
  for (const { accessPath, normalizedPath: filePath } of archiveFiles) {
    const contents = extractFile(archivePath, accessPath, false);
    inspectSecrets(filePath, contents, findings);
    if (filePath === 'package.json') {
      inspectMetadata(contents, findings);
    } else if (filePath.startsWith('src/') && expectedSet.has(filePath)) {
      const reviewedContents = await fs.readFile(
        path.join(sourceRoot, filePath.slice('src/'.length)),
      );
      if (digest(contents) !== digest(reviewedContents)) {
        sourceMismatchCount += 1;
        findings.push({ path: filePath, rule: 'source-mismatch' });
      }
    }
  }

  if (findings.length > 0) {
    throw packageSurfaceError(findings);
  }
  return {
    fileCount: archiveFiles.length,
    sourceFileCount: sourceFiles.length,
    sourceMismatchCount,
    secretFindingCount: 0,
  };
}
