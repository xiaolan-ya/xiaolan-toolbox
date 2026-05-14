const DEFAULT_BASE_URL = "https://www.packyapi.com";
const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_QUALITY = "high";
const DEFAULT_OUTPUT_FORMAT = "png";
const DEFAULT_SIZE = "auto";

const ALLOWED_SIZES = new Set([
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2048x2048",
  "2048x1152",
  "3840x2160",
  "2160x3840",
]);

const MIN_IMAGE_PIXELS = 655360;
const MAX_IMAGE_PIXELS = 8294400;
const MAX_IMAGE_EDGE = 3840;
const MAX_IMAGE_RATIO = 3;

const MIME_BY_EXTENSION = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function normalizeSize(size) {
  const normalized = String(size || DEFAULT_SIZE)
    .trim()
    .replace(/\s+/g, "")
    .replace(/脳/g, "x")
    .replace(/×/g, "x")
    .toLowerCase();

  if (ALLOWED_SIZES.has(normalized)) {
    return normalized;
  }

  const match = normalized.match(/^(\d+)x(\d+)$/);
  if (!match) {
    throw new Error("尺寸不在支持列表中。");
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  const pixels = width * height;
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const ratio = longEdge / Math.max(1, shortEdge);

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width % 16 !== 0 ||
    height % 16 !== 0 ||
    longEdge > MAX_IMAGE_EDGE ||
    ratio > MAX_IMAGE_RATIO ||
    pixels < MIN_IMAGE_PIXELS ||
    pixels > MAX_IMAGE_PIXELS
  ) {
    throw new Error("尺寸不符合上游规则：宽高必须为 16 的倍数，最长边不超过 3840，比例不超过 3:1，总像素需在 655360 到 8294400 之间。");
  }

  return normalized;
}
function normalizeOutputFormat(format) {
  const normalized = String(format || DEFAULT_OUTPUT_FORMAT)
    .trim()
    .replace(/^\.+/, "")
    .toLowerCase();
  if (normalized === "jpg") {
    return "jpeg";
  }
  if (!["png", "jpeg", "webp"].includes(normalized)) {
    throw new Error("输出格式只支持 png、jpeg、webp。");
  }
  return normalized;
}

function normalizeQuality(quality) {
  const normalized = String(quality || DEFAULT_QUALITY).trim().toLowerCase();
  if (!["low", "medium", "high"].includes(normalized)) {
    throw new Error("质量只支持 low、medium、high。");
  }
  return normalized;
}

function buildPromptForOutputFormat(prompt, outputFormat) {
  return prompt;
}

function buildPromptForReferenceImages(prompt, referenceImageCount) {
  const cleanPrompt = String(prompt || "").trim();
  const count = Number(referenceImageCount || 0);
  if (count <= 0) {
    return cleanPrompt;
  }

  if (count === 1) {
    return [
      cleanPrompt,
      "",
      "参考图是必须保留的原始主体。请在参考图基础上修改和再设计，保持主体身份、构图关系、主要元素、文字位置和可识别特征，不要生成与参考图无关的新画面。",
    ].join("\n");
  }

  return [
    cleanPrompt,
    "",
    "多张参考图使用规则：图一是必须保留的主图和主体内容，图二及之后只作为风格、排版、色彩、材质或氛围参考。最终画面必须以图一为核心进行改造，保留图一的主体身份、主体结构、主要元素和可识别特征；不要把图二当成主体，不要重新发明一个与图一无关的新画面。",
  ].join("\n");
}

function buildClientVisiblePayload(payload) {
  return {
    ...payload,
    prompt: payload.visiblePrompt || payload.prompt,
    output_format: payload.requestedOutputFormat || payload.output_format,
  };
}

function removeHiddenPromptEnhancement(text) {
  return String(text || "").trim();
}

function sanitizeHiddenPromptEnhancement(value) {
  if (typeof value === "string") {
    return removeHiddenPromptEnhancement(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeHiddenPromptEnhancement);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeHiddenPromptEnhancement(item)])
    );
  }

  return value;
}

function buildGenerationPayload(config, input) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) {
    throw new Error("请输入提示词。");
  }

  const count = Number(input.count || 1);
  if (!Number.isInteger(count) || count < 1 || count > 16) {
    throw new Error("生成数量只能是 1 到 16。");
  }

  const requestedOutputFormat = normalizeOutputFormat(input.outputFormat || config.outputFormat);
  const upstreamOutputFormat = requestedOutputFormat;
  const referenceImageCount = Array.isArray(input.referenceImagePaths)
    ? input.referenceImagePaths.length
    : 0;

  const payload = {
    model: String(input.model || config.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    prompt: buildPromptForReferenceImages(
      buildPromptForOutputFormat(prompt, requestedOutputFormat),
      referenceImageCount
    ),
    size: normalizeSize(input.size),
    quality: normalizeQuality(input.quality || config.quality),
    output_format: upstreamOutputFormat,
    response_format: "b64_json",
    n: count,
  };

  Object.defineProperty(payload, "visiblePrompt", {
    value: prompt,
    enumerable: false,
  });
  Object.defineProperty(payload, "requestedOutputFormat", {
    value: requestedOutputFormat,
    enumerable: false,
  });

  return payload;
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_QUALITY,
  DEFAULT_OUTPUT_FORMAT,
  DEFAULT_SIZE,
  ALLOWED_SIZES,
  MIME_BY_EXTENSION,
  normalizeSize,
  normalizeOutputFormat,
  normalizeQuality,
  buildPromptForOutputFormat,
  buildPromptForReferenceImages,
  buildClientVisiblePayload,
  removeHiddenPromptEnhancement,
  sanitizeHiddenPromptEnhancement,
  buildGenerationPayload,
};
