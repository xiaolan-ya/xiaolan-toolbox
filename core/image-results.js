const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");

const {
  MIME_BY_EXTENSION,
  normalizeOutputFormat,
  removeHiddenPromptEnhancement,
} = require("./generation");
const { fetchWithTimeout } = require("./http-client");

const RESULT_DOWNLOAD_TIMEOUT_MS = 45000;

function buildOutputFileName(index, extension) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = crypto.randomBytes(4).toString("hex");
  return `image-${timestamp}-${index + 1}-${suffix}.${extension}`;
}

function getOutputExtension(outputFormat) {
  const normalized = normalizeOutputFormat(outputFormat);
  return normalized === "jpeg" ? "jpg" : normalized;
}

function buildEditedReferenceFileName(sourcePath) {
  const baseName =
    path.basename(String(sourcePath || ""), path.extname(String(sourcePath || ""))) || "reference";
  const sanitized = baseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").slice(0, 48) || "reference";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${sanitized}-edited-${timestamp}-${suffix}.png`;
}

function decodeDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:(image\/png);base64,(.+)$/);
  if (!match) {
    throw new Error("编辑后的参考图数据格式不正确。");
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function createImageResultStorage({ getDefaultOutputDir, ensureDirectory }) {
  async function saveImageResults(config, payload, upstreamData) {
    const outputDir = String(config.outputDir || getDefaultOutputDir()).trim();
    await ensureDirectory(outputDir);

    const results = [];
    const items = Array.isArray(upstreamData?.data) ? upstreamData.data : [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const finalFormat = payload.requestedOutputFormat || payload.output_format;
      const extension = getOutputExtension(finalFormat);
      const mimeType = MIME_BY_EXTENSION[`.${extension}`] || "application/octet-stream";
      const fileName = buildOutputFileName(index, extension);
      const filePath = path.join(outputDir, fileName);
      let sourceBuffer = null;

      if (item.b64_json) {
        sourceBuffer = Buffer.from(item.b64_json, "base64");
      } else if (item.url) {
        const remoteResponse = await fetchWithTimeout(
          item.url,
          {},
          RESULT_DOWNLOAD_TIMEOUT_MS,
          `生成结果下载超时，已等待 ${Math.floor(RESULT_DOWNLOAD_TIMEOUT_MS / 1000)} 秒。`
        );
        if (!remoteResponse.ok) {
          throw new Error(`下载远程图片失败：${remoteResponse.statusText}`);
        }
        const arrayBuffer = await remoteResponse.arrayBuffer();
        sourceBuffer = Buffer.from(arrayBuffer);
      } else {
        continue;
      }

      await fs.writeFile(filePath, sourceBuffer);

      results.push({
        index,
        fileName,
        filePath,
        previewUrl: pathToFileURL(filePath).toString(),
        revisedPrompt: item.revised_prompt
          ? removeHiddenPromptEnhancement(item.revised_prompt)
          : null,
        remoteUrl: item.url || null,
        mimeType,
      });
    }

    return results;
  }

  async function saveEditedReferenceImage(input) {
    const sourcePath = String(input?.sourcePath || "").trim();
    if (!sourcePath) {
      throw new Error("缺少原始参考图路径。");
    }

    const { buffer, mimeType } = decodeDataUrl(input?.dataUrl);
    const preferredDir = String(input?.outputDir || "").trim();
    const sourceDir = path.dirname(sourcePath);
    const targetDir = preferredDir || sourceDir || getDefaultOutputDir();
    await ensureDirectory(targetDir);

    const fileName = buildEditedReferenceFileName(sourcePath);
    const filePath = path.join(targetDir, fileName);
    await fs.writeFile(filePath, buffer);

    return {
      fileName,
      filePath,
      previewUrl: pathToFileURL(filePath).toString(),
      mimeType,
    };
  }

  return {
    saveImageResults,
    saveEditedReferenceImage,
  };
}

module.exports = {
  RESULT_DOWNLOAD_TIMEOUT_MS,
  buildEditedReferenceFileName,
  buildOutputFileName,
  createImageResultStorage,
  decodeDataUrl,
  getOutputExtension,
};
