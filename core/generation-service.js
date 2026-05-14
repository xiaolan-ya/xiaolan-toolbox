const path = require("path");

const {
  buildClientVisiblePayload,
  buildGenerationPayload,
  sanitizeHiddenPromptEnhancement,
} = require("./generation");
const { requestImageGenerationBatch } = require("./image-api");

function createGenerationService({
  normalizeConfig,
  appendHistoryEntries,
  saveImageResults,
  requestBatch = requestImageGenerationBatch,
}) {
  let activeRequest = null;

  async function generateImages(input) {
    const config = normalizeConfig(input.config);
    if (!config.apiKey) {
      throw new Error("请先填写 API Key。");
    }

    const payload = buildGenerationPayload(config, input);
    const batchResult = await requestBatch(config, payload, input.referenceImagePaths || []);
    const upstream = batchResult.upstream;
    const images = await saveImageResults(config, payload, upstream);
    if (images.length === 0) {
      throw new Error("生成失败，未收到可保存的图片。");
    }

    const createdAt = new Date().toISOString();
    const referenceImagePaths = Array.isArray(input.referenceImagePaths)
      ? input.referenceImagePaths.map((filePath) => String(filePath || "").trim()).filter(Boolean)
      : [];
    const historyEntries = images.map((image, index) => ({
      id: `${createdAt}-${index}-${path.basename(image.filePath)}`,
      createdAt,
      prompt: payload.visiblePrompt || payload.prompt,
      mode: referenceImagePaths.length > 0 ? "image" : "text",
      size: payload.size,
      outputFormat: payload.requestedOutputFormat || payload.output_format,
      quality: payload.quality,
      referenceImagePaths,
      image: {
        fileName: image.fileName,
        filePath: image.filePath,
        mimeType: image.mimeType,
      },
    }));
    const history = await appendHistoryEntries(historyEntries);

    return {
      success: true,
      payload: buildClientVisiblePayload(payload),
      images,
      upstream: sanitizeHiddenPromptEnhancement(upstream),
      history,
    };
  }

  async function generateImagesWithGuard(input) {
    const requestPromise = generateImages(input);
    activeRequest = requestPromise;

    try {
      return await requestPromise;
    } finally {
      if (activeRequest === requestPromise) {
        activeRequest = null;
      }
    }
  }

  function setActiveGenerationRequestForTest(value) {
    activeRequest = value;
  }

  return {
    generateImages,
    generateImagesWithGuard,
    setActiveGenerationRequestForTest,
  };
}

module.exports = {
  createGenerationService,
};
