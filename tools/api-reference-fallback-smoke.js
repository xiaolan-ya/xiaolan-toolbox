const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { app } = require("electron");

process.env.XIAOLAN_DESKTOP_TEST = "1";

const { __test__ } = require("../main");

const ROOT = path.resolve(__dirname, "..");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUTPUT_DIR = path.join(ROOT, "dist", `api-reference-fallback-${RUN_ID}`);
const CONFIG_PATH = path.join(app.getPath("appData"), "packy-image-desktop", "config.json");

function maskKey(value) {
  const text = String(value || "");
  return text ? `${text.slice(0, 6)}...${text.slice(-4)}` : "";
}

function loadConfig() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  if (!config.apiKey) {
    throw new Error("配置文件里没有 API Key，无法执行真实 API 测试。");
  }
  return {
    ...config,
    quality: "low",
    outputFormat: "jpeg",
    outputDir: OUTPUT_DIR,
  };
}

function summarizeImages(images) {
  return (images || []).map((image) => ({
    fileName: image.fileName,
    bytes: fs.existsSync(image.filePath) ? fs.statSync(image.filePath).size : 0,
    mimeType: image.mimeType,
    exists: fs.existsSync(image.filePath),
  }));
}

async function main() {
  await app.whenReady();
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });

  const config = loadConfig();
  const referencePath = path.join(ROOT, "renderer", "prompt-covers", "prompt-001.jpg");
  const startedAt = Date.now();
  let result;
  try {
    const response = await __test__.generateImages({
      config,
      prompt: "参考图 fallback 测试：保留参考图主体和构图，改成高级产品海报风格，文字不要乱码。",
      count: 1,
      size: "1024x1024",
      quality: "low",
      outputFormat: "jpeg",
      referenceImagePaths: [referencePath],
    });
    result = {
      ok: true,
      elapsedMs: Date.now() - startedAt,
      transport: response?.upstream?.reference_image_transport || "unknown",
      actualCount: Array.isArray(response?.images) ? response.images.length : 0,
      files: summarizeImages(response?.images),
      fallbackErrors: response?.upstream?.reference_edit_fallback_errors || [],
    };
  } catch (error) {
    result = {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error?.message || String(error),
    };
  }

  const summary = {
    runId: RUN_ID,
    outputDir: OUTPUT_DIR,
    estimatedMaxApiCalls: 4,
    config: {
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: maskKey(config.apiKey),
      quality: config.quality,
      outputFormat: config.outputFormat,
    },
    result,
  };

  await fsp.writeFile(path.join(OUTPUT_DIR, "api-reference-fallback-report.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
  app.exit(result.ok && result.actualCount === 1 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
