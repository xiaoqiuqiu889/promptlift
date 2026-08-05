import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import yazl from "yazl";

function toZipPath(value) {
  return value.split(path.sep).join("/");
}

function isMacExecutable(relativePath) {
  const normalized = toZipPath(relativePath);
  return normalized.includes(".app/Contents/MacOS/")
    || normalized.includes(".app/Contents/Frameworks/");
}

export async function zipDirectoryWithUnixModes({
  sourceDirectory,
  archivePath,
  rootName = path.basename(sourceDirectory),
} = {}) {
  const zip = new yazl.ZipFile();
  const directories = [sourceDirectory];

  while (directories.length > 0) {
    const directory = directories.pop();
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(sourceDirectory, absolutePath);
      const archiveEntry = toZipPath(path.join(rootName, relativePath));
      const stat = await fsp.lstat(absolutePath);
      if (stat.isDirectory()) {
        zip.addEmptyDirectory(`${archiveEntry}/`, { mode: 0o40755, mtime: stat.mtime });
        directories.push(absolutePath);
      } else if (stat.isSymbolicLink()) {
        const target = await fsp.readlink(absolutePath);
        zip.addBuffer(Buffer.from(target, "utf8"), archiveEntry, {
          mode: 0o120777,
          mtime: stat.mtime,
          compress: false,
        });
      } else if (stat.isFile()) {
        zip.addFile(absolutePath, archiveEntry, {
          mode: isMacExecutable(archiveEntry) ? 0o100755 : 0o100644,
          mtime: stat.mtime,
        });
      }
    }
  }

  await fsp.mkdir(path.dirname(archivePath), { recursive: true });
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath);
    output.on("close", resolve);
    output.on("error", reject);
    zip.outputStream.on("error", reject);
    zip.outputStream.pipe(output);
    zip.end();
  });
}
