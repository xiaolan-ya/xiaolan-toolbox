const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { app } = require("electron");

process.env.XIAOLAN_DESKTOP_TEST = "1";

const { __test__ } = require("../main");

const ROOT = path.resolve(__dirname, "..");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUTPUT_DIR = path.join(ROOT, "dist", `api-regression-${RUN_ID}`);
const CONFIG_CANDIDATES = [
  path.join(app.getPath("appData"), "packy-image-desktop", "config.json"),
  path.join(app.getPath("userData"), "config.json"),
];
const PROMPT =
  "API 回归测试图：一个小型蓝色桌面工具箱放在干净工作台上，柔和摄影棚灯光，清晰主体，高级产品摄影风格。";

function maskKey(value) {
  const text = String(value || "");
  if (!text) {
    return "";
  }
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function loadConfig() {
  const configPath = CONFIG_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!configPath) {
    throw new Error(`找不到配置文件，已检查：${CONFIG_CANDIDATES.join("；")}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!config.apiKey) {
    throw new Error("配置文件里没有 API Key，无法执行真实 API 回归。");
  }
  return {
    ...config,
    quality: "low",
    outputFormat: "jpeg",
    outputDir: OUTPUT_DIR,
  };
}

function referenceCover(index) {
  return path.join(ROOT, "renderer", "prompt-covers", `prompt-${String(index).padStart(3, "0")}.jpg`);
}

function summarizeImages(images) {
  return (images || []).map((image) => ({
    fileName: image.fileName,
    bytes: fs.existsSync(image.filePath) ? fs.statSync(image.filePath).size : 0,
    mimeType: image.mimeType,
    exists: fs.existsSync(image.filePath),
  }));
}

async function runCase(config, testCase) {
  const startedAt = Date.now();
  try {
    const result = await __test__.generateImages({
      config,
      prompt: testCase.prompt || PROMPT,
      count: testCase.count,
      size: testCase.size || "1024x1024",
      quality: "low",
      outputFormat: "jpeg",
      referenceImagePaths: testCase.referenceImagePaths || [],
    });
    const elapsedMs = Date.now() - startedAt;
    const transport = result?.upstream?.reference_image_transport || "text-json";
    return {
      name: testCase.name,
      ok: true,
      elapsedMs,
      expectedCount: testCase.count,
      actualCount: Array.isArray(result.images) ? result.images.length : 0,
      transport,
      files: summarizeImages(result.images),
    };
  } catch (error) {
    return {
      name: testCase.name,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error?.message || String(error),
    };
  }
}

async function main() {
  await app.whenReady();
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });

  const config = loadConfig();
  const cases = [
    {
      name: "text-single",
      count: 1,
    },
    {
      name: "text-multi-2",
      count: 2,
      prompt: `${PROMPT} 同一风格生成两张轻微不同构图。`,
    },
    {
      name: "image-single-reference",
      count: 1,
      prompt: "保留参考图主体和大致构图，改成高级杂志封面风格，文字不要乱码。",
      referenceImagePaths: [referenceCover(1)],
    },
    {
      name: "image-multi-reference",
      count: 1,
      prompt: "以第一张为主体，参考其他图的色调和版式，生成一张完整封面设计。",
      referenceImagePaths: [referenceCover(1), referenceCover(2), referenceCover(3)],
    },
    {
      name: "image-multi-reference-multi-output-2",
      count: 2,
      prompt: "以第一张为主体，参考其他图的色调和版式，生成两张不同封面方向。",
      referenceImagePaths: [referenceCover(4), referenceCover(5)],
    },
  ];

  const results = [];
  for (const testCase of cases) {
    console.log(`Running ${testCase.name}...`);
    const result = await runCase(config, testCase);
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }

  const summary = {
    runId: RUN_ID,
    outputDir: OUTPUT_DIR,
    config: {
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: maskKey(config.apiKey),
      quality: "low",
      outputFormat: "jpeg",
    },
    estimatedMaxApiCalls: 20,
    passed: results.filter((item) => item.ok && item.actualCount === item.expectedCount).length,
    failed: results.filter((item) => !item.ok || item.actualCount !== item.expectedCount).length,
    results,
  };

  const reportPath = path.join(OUTPUT_DIR, "api-regression-report.json");
  await fsp.writeFile(reportPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(`REPORT ${reportPath}`);
  console.log(JSON.stringify(summary, null, 2));

  app.exit(summary.failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
