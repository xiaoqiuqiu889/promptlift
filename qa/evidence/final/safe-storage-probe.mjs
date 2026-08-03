import fs from "node:fs/promises";
import path from "node:path";
import { app, safeStorage } from "electron";

function arg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : "";
}

const configPath = path.resolve(arg("config"));
const userDataPath = path.resolve(arg("user-data"));
const outputPath = path.resolve(arg("output"));
const result = {
  configExists: false,
  configParseSucceeded: false,
  encryptionAvailable: false,
  apiKeySaved: false,
  loadError: false,
  userDataPathVerified: false,
};

app.setPath("userData", userDataPath);

try {
  await app.whenReady();
  result.userDataPathVerified = path.resolve(app.getPath("userData")) === userDataPath;
  result.encryptionAvailable = safeStorage.isEncryptionAvailable() === true;
  const raw = await fs.readFile(configPath, "utf8");
  result.configExists = true;
  const persisted = JSON.parse(raw);
  result.configParseSucceeded = Boolean(persisted && typeof persisted === "object");
  if (typeof persisted?.apiKey === "string" && persisted.apiKey.length > 0) {
    if (!result.encryptionAvailable) {
      result.loadError = true;
    } else {
      const decrypted = safeStorage.decryptString(Buffer.from(persisted.apiKey, "base64"));
      result.apiKeySaved = typeof decrypted === "string" && decrypted.length > 0;
    }
  }
} catch {
  result.loadError = true;
} finally {
  const output = `${JSON.stringify(result)}\n`;
  await fs.writeFile(outputPath, output, "utf8");
  process.stdout.write(output);
  app.exit(0);
}
