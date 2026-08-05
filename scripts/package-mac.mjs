import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { packager } from "@electron/packager";

import { auditPackageSurface } from "./packageSurfaceAudit.mjs";
import { zipDirectoryWithUnixModes } from "./zipDirectory.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = process.env.PROMPT_LIFT_MAC_RELEASE_ROOT
  ? path.resolve(process.env.PROMPT_LIFT_MAC_RELEASE_ROOT)
  : path.join(projectRoot, "release-mac");
const deliverablesRoot = path.join(projectRoot, "deliverables");
const architectures = Object.freeze(["arm64", "x64"]);
const archiveNames = Object.freeze({
  arm64: "Prompt-Lift-latest-darwin-arm64.zip",
  x64: "Prompt-Lift-latest-darwin-x64.zip",
});
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-lift-mac-package-"));
const stagingRoot = path.join(tempRoot, "app");
const packageOutRoot = path.join(tempRoot, "out");

async function sha256(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function updateChecksums(archives) {
  const checksumPath = path.join(deliverablesRoot, "SHA256SUMS.txt");
  const managedNames = new Set([
    "Prompt-Lift-latest-win32-x64.zip",
    ...Object.values(archiveNames),
  ]);
  const existing = await fs.readFile(checksumPath, "utf8").catch(() => "");
  const retained = existing
    .split(/\r?\n/u)
    .filter(Boolean)
    .filter((line) => !managedNames.has(line.trim().split(/\s+/u).at(-1)));
  const knownArchives = [];
  for (const name of managedNames) {
    const archivePath = path.join(deliverablesRoot, name);
    try {
      await fs.access(archivePath);
      knownArchives.push(archivePath);
    } catch {
      // A platform package may be built independently.
    }
  }
  const lines = [...retained];
  for (const archivePath of knownArchives.sort()) {
    lines.push(`${await sha256(archivePath)}  ${path.basename(archivePath)}`);
  }
  await fs.writeFile(checksumPath, `${lines.join("\n")}\n`, "utf8");
  return archives.map((archivePath) => ({
    archivePath,
    sha256: lines.find((line) => line.endsWith(`  ${path.basename(archivePath)}`))?.split(" ")[0],
  }));
}

try {
  await fs.mkdir(stagingRoot, { recursive: true });
  await fs.cp(path.join(projectRoot, "src"), path.join(stagingRoot, "src"), {
    recursive: true,
  });
  const packageMetadata = JSON.parse(
    await fs.readFile(path.join(projectRoot, "package.json"), "utf8"),
  );
  const {
    scripts: _scripts,
    devDependencies: _devDependencies,
    ...runtimePackageMetadata
  } = packageMetadata;
  await fs.writeFile(
    path.join(stagingRoot, "package.json"),
    JSON.stringify(runtimePackageMetadata, null, 2),
    "utf8",
  );
  const electronMetadata = JSON.parse(
    await fs.readFile(path.join(projectRoot, "node_modules", "electron", "package.json"), "utf8"),
  );

  await fs.rm(releaseRoot, { recursive: true, force: true });
  await fs.mkdir(releaseRoot, { recursive: true });
  await fs.mkdir(deliverablesRoot, { recursive: true });
  const archives = [];

  for (const arch of architectures) {
    const packagedPaths = await packager({
      dir: stagingRoot,
      name: "Prompt Lift",
      platform: "darwin",
      arch,
      electronVersion: electronMetadata.version,
      out: packageOutRoot,
      overwrite: true,
      prune: false,
      asar: true,
      tmpdir: false,
      appBundleId: "com.promptlift.desktop",
      appCategoryType: "public.app-category.productivity",
    });
    if (!Array.isArray(packagedPaths) || packagedPaths.length !== 1) {
      throw new Error(`macOS ${arch} package was not created`);
    }
    const packagedDir = packagedPaths[0];
    const appDirectory = path.join(packagedDir, "Prompt Lift.app");
    const packageSurface = await auditPackageSurface({
      archivePath: path.join(
        appDirectory,
        "Contents",
        "Resources",
        "app.asar",
      ),
      sourceRoot: path.join(projectRoot, "src"),
    });
    const releaseDir = path.join(releaseRoot, path.basename(packagedDir));
    await fs.cp(packagedDir, releaseDir, { recursive: true });
    const archivePath = path.join(
      deliverablesRoot,
      archiveNames[arch],
    );
    await zipDirectoryWithUnixModes({
      sourceDirectory: appDirectory,
      archivePath,
      rootName: "Prompt Lift.app",
    });
    archives.push(archivePath);
    console.log(
      `macOS ${arch} surface verified: ${packageSurface.fileCount} files; `
        + `archive ready: ${archivePath}`,
    );
  }

  for (const result of await updateChecksums(archives)) {
    console.log(`${path.basename(result.archivePath)} SHA-256: ${result.sha256}`);
  }
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
