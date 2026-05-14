const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const forbiddenRootFiles = [
  "generation.js",
  "index.html",
  "renderer.js",
  "styles.css",
  "reference-prompt.js",
];

const transparentFeaturePatterns = [
  "transparentBackground",
  "TRANSPARENT_BACKGROUND",
  "requestedTransparent",
  "shouldRequestTransparent",
  "shouldOutputTransparent",
  "transparent_background",
  "透明图层",
  'background: "transparent"',
  "background = \"transparent\"",
  "param-checkbox",
  "field-checkbox",
];

const sourceGlobs = [
  "main.js",
  "preload.js",
  "core",
  "renderer",
  "tools",
];

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function walk(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) {
    return [absolutePath];
  }

  const results = [];
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const childRelativePath = path.join(relativePath, entry.name);
    results.push(...walk(childRelativePath));
  }
  return results;
}

function assertForbiddenRootFilesAbsent() {
  for (const fileName of forbiddenRootFiles) {
    assert.equal(
      fs.existsSync(path.join(ROOT, fileName)),
      false,
      `根目录不应保留旧版残留文件：${fileName}`
    );
  }
}

function assertRendererWiring() {
  const html = readUtf8("renderer/index.html");
  assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css" \/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/prompt-library-layout\.css" \/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/image-inspector\.css" \/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/canvas-workbench\.css" \/>/);
  assert.match(html, /<script src="\.\/prompt-library\.js"><\/script>/);
  assert.match(html, /<script src="\.\/app-config\.js"><\/script>/);
  assert.match(html, /<script src="\.\/image-inspector\.js"><\/script>/);
  assert.match(html, /<script src="\.\/canvas-workbench\.js"><\/script>/);
  assert.match(html, /<script src="\.\/renderer\.js"><\/script>/);
  assert.ok(
    html.indexOf("./app-config.js") < html.indexOf("./renderer.js"),
    "renderer/app-config.js 必须在 renderer.js 前加载"
  );
  assert.ok(
    html.indexOf("./image-inspector.js") < html.indexOf("./renderer.js"),
    "renderer/image-inspector.js 必须在 renderer.js 前加载"
  );
  assert.ok(
    html.indexOf("./canvas-workbench.js") < html.indexOf("./renderer.js"),
    "renderer/canvas-workbench.js 必须在 renderer.js 前加载"
  );
}

function assertRequiredModules() {
  const requiredFiles = [
    "core/app-storage.js",
    "core/auto-updater.js",
    "core/generation-service.js",
    "core/image-results.js",
    "renderer/app-config.js",
    "renderer/canvas-workbench.css",
    "renderer/canvas-workbench.js",
    "renderer/image-inspector.css",
    "renderer/image-inspector.js",
    "renderer/prompt-library-layout.css",
  ];

  for (const fileName of requiredFiles) {
    assert.equal(fs.existsSync(path.join(ROOT, fileName)), true, `缺少拆分模块：${fileName}`);
  }
}

function assertPackagingIncludesSplitModules() {
  const pkg = JSON.parse(readUtf8("package.json"));
  const files = Array.isArray(pkg.build?.files) ? pkg.build.files : [];
  assert.ok(files.includes("core/**/*"), "package.json build.files 必须包含 core/**/*");
  assert.ok(files.includes("renderer/**/*"), "package.json build.files 必须包含 renderer/**/*");
  assert.ok(files.includes("tools/**/*"), "package.json build.files 必须包含 tools/**/*");
}

function assertTransparentFeatureRemoved() {
  const files = sourceGlobs
    .flatMap(walk)
    .filter((fileName) => /\.(js|html|css)$/.test(fileName))
    .filter((fileName) => path.basename(fileName) !== "verify-project-structure.js");

  for (const fileName of files) {
    const text = fs.readFileSync(fileName, "utf8");
    for (const pattern of transparentFeaturePatterns) {
      assert.equal(
        text.includes(pattern),
        false,
        `透明底功能已删除，不应在 ${path.relative(ROOT, fileName)} 出现：${pattern}`
      );
    }
  }
}

function run() {
  assertForbiddenRootFilesAbsent();
  assertRendererWiring();
  assertRequiredModules();
  assertPackagingIncludesSplitModules();
  assertTransparentFeatureRemoved();
  console.log("Project structure checks passed.");
}

run();
