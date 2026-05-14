const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const outputDir = path.join(distDir, "update-upload", "desktop");
const packageJsonPath = path.join(projectRoot, "package.json");

function escapeYamlString(value) {
  return String(value).replace(/'/g, "''");
}

function readPackageVersion() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return String(packageJson.version || "").trim();
}

function sanitizeVersionForFileName(version) {
  return String(version || "")
    .trim()
    .replace(/[^0-9A-Za-z.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getDistFiles() {
  return fs.readdirSync(distDir, { withFileTypes: true }).filter((entry) => entry.isFile());
}

function selectLatestInstaller(entries) {
  const candidates = entries
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(distDir, entry.name),
      stat: fs.statSync(path.join(distDir, entry.name)),
    }))
    .filter((item) => item.name.toLowerCase().endsWith(".exe"))
    .filter((item) => !item.name.toLowerCase().endsWith(".blockmap"))
    .filter((item) => !item.name.includes("便携版"))
    .filter((item) => !item.name.includes("Portable"))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

  if (!candidates.length) {
    throw new Error("dist 目录里没有找到可用于在线升级的安装包 exe。");
  }

  return candidates[0];
}

function computeSha512Base64(filePath) {
  const hash = crypto.createHash("sha512");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("base64");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanOutputDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  ensureDir(dirPath);
}

function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function buildLatestYml({ version, installerName, sha512, size, releaseDate }) {
  return [
    `version: ${version}`,
    "files:",
    `  - url: '${escapeYamlString(installerName)}'`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: '${escapeYamlString(installerName)}'`,
    `sha512: ${sha512}`,
    `releaseDate: '${releaseDate}'`,
    "",
  ].join("\n");
}

function main() {
  const version = readPackageVersion();
  if (!version) {
    throw new Error("package.json 里没有可用的 version。");
  }

  const files = getDistFiles();
  const installer = selectLatestInstaller(files);
  const safeVersion = sanitizeVersionForFileName(version);
  const installerName = `xiaolan-toolbox-setup-${safeVersion}-x64.exe`;
  const installerPath = installer.fullPath;
  const sourceBlockmapPath = path.join(distDir, `${path.basename(installer.fullPath)}.blockmap`);
  const blockmapName = `${installerName}.blockmap`;
  const sha512 = computeSha512Base64(installerPath);
  const size = installer.stat.size;
  const releaseDate = installer.stat.mtime.toISOString();
  const latestYmlContent = buildLatestYml({
    version,
    installerName,
    sha512,
    size,
    releaseDate,
  });

  fs.writeFileSync(path.join(distDir, "latest.yml"), latestYmlContent, "utf8");

  cleanOutputDir(outputDir);
  fs.copyFileSync(installerPath, path.join(outputDir, installerName));
  fs.copyFileSync(path.join(distDir, "latest.yml"), path.join(outputDir, "latest.yml"));
  const blockmapCopied = copyIfExists(sourceBlockmapPath, path.join(outputDir, blockmapName));

  console.log(`已生成: ${path.join(distDir, "latest.yml")}`);
  console.log(`已整理上传目录: ${outputDir}`);
  console.log(`安装包: ${installerName}`);
  console.log(`blockmap: ${blockmapCopied ? blockmapName : "未找到，对应文件未复制"}`);
}

main();
