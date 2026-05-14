const { DEFAULT_VISION_PROMPT_MODEL } = require("../tools/reference-prompt");
const {
  buildGeminiGenerateContentPayload,
  buildReferencePromptInstruction,
  buildVisionChatCompletionsPayload,
  buildVisionResponsesPayload,
  extractVisionPromptText,
  normalizeVisionPromptModel,
} = require("../tools/reference-prompt");
const { DEFAULT_BASE_URL } = require("./generation");
const {
  buildGeminiGenerateContentUrl,
  buildVisionEndpointUrls,
  normalizeBaseUrl,
  normalizeOptionalBaseUrl,
} = require("./endpoints");
const { buildReferenceImageDataUrls } = require("./reference-images");
const { fetchWithTimeout } = require("./http-client");

const UPSTREAM_VISION_REQUEST_TIMEOUT_MS = 90000;

function getUpstreamErrorDetail(result) {
  return (
    result?.body?.error?.message ||
    result?.body?.message ||
    result?.body?.raw ||
    result?.statusText ||
    "未知错误"
  );
}

async function callVisionEndpoint({
  url,
  apiKey,
  payload,
  timeoutMs = UPSTREAM_VISION_REQUEST_TIMEOUT_MS,
}) {
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
    `参考图识别超时，已等待 ${Math.floor(timeoutMs / 1000)} 秒。`
  );

  const rawText = await response.text();
  let parsedBody;
  try {
    parsedBody = rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    parsedBody = { raw: rawText };
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: parsedBody,
  };
}

async function callGeminiEndpoint({
  url,
  apiKey,
  payload,
  timeoutMs = UPSTREAM_VISION_REQUEST_TIMEOUT_MS,
}) {
  const target = new URL(url);
  if (!target.searchParams.has("key")) {
    target.searchParams.set("key", apiKey);
  }

  const response = await fetchWithTimeout(
    target.toString(),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
    `参考图识别超时，已等待 ${Math.floor(timeoutMs / 1000)} 秒。`
  );

  const rawText = await response.text();
  let parsedBody;
  try {
    parsedBody = rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    parsedBody = { raw: rawText };
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: parsedBody,
  };
}

function isGeminiModel(model) {
  return /(^|[\/:_-])gemini([\/:_-]|$)/i.test(String(model || ""));
}

function isGeminiBaseUrl(baseUrl) {
  return /generativelanguage\.googleapis\.com|:generateContent/i.test(String(baseUrl || ""));
}

function normalizeReferencePromptConfig(rawConfig = {}) {
  const baseUrl = normalizeBaseUrl(rawConfig.baseUrl || DEFAULT_BASE_URL);
  return {
    baseUrl,
    apiKey: String(rawConfig.apiKey || "").trim(),
    referencePromptModel: normalizeVisionPromptModel(
      rawConfig.referencePromptModel || DEFAULT_VISION_PROMPT_MODEL
    ),
    referencePromptApiKey: String(rawConfig.referencePromptApiKey || "").trim(),
    referencePromptBaseUrl: normalizeOptionalBaseUrl(rawConfig.referencePromptBaseUrl),
  };
}

async function generatePromptFromReferenceImages(_, input) {
  const config = normalizeReferencePromptConfig(input?.config || {});
  const apiKey = config.referencePromptApiKey || config.apiKey;
  if (!apiKey) {
    throw new Error("请先填写 API Key，或单独填写图片转生成词 API Key。");
  }

  const referenceImagePaths = Array.isArray(input?.referenceImagePaths)
    ? input.referenceImagePaths.filter(Boolean)
    : [];
  if (referenceImagePaths.length === 0) {
    throw new Error("请先添加至少一张参考图。");
  }

  const imageDataUrls = await buildReferenceImageDataUrls(referenceImagePaths);
  const instruction = buildReferencePromptInstruction(input?.prompt || "");
  const model = normalizeVisionPromptModel(
    input?.referencePromptModel || config.referencePromptModel || DEFAULT_VISION_PROMPT_MODEL
  );
  const endpointUrls = buildVisionEndpointUrls(config.referencePromptBaseUrl || config.baseUrl || DEFAULT_BASE_URL);
  const { chatCompletionsUrl, responsesUrl } = endpointUrls;
  const geminiAttempt = {
    type: "gemini",
    payload: buildGeminiGenerateContentPayload({
      instruction,
      imageDataUrls,
    }),
    url: buildGeminiGenerateContentUrl(
      config.referencePromptBaseUrl || "https://generativelanguage.googleapis.com/v1beta",
      model
    ),
  };
  const openAiCompatibleAttempts = [
    {
      type: "chat",
      payload: buildVisionChatCompletionsPayload({
        model,
        instruction,
        imageDataUrls,
        imageShape: "object",
      }),
    },
    {
      type: "chat",
      payload: buildVisionChatCompletionsPayload({
        model,
        instruction,
        imageDataUrls,
        imageShape: "object",
        responseFormat: { type: "text" },
      }),
    },
    {
      type: "chat",
      payload: buildVisionChatCompletionsPayload({
        model,
        instruction,
        imageDataUrls,
        imageShape: "string",
      }),
    },
    {
      type: "responses",
      payload: buildVisionResponsesPayload({
        model,
        instruction,
        imageDataUrls,
        imageShape: "image_url",
      }),
    },
  ];
  const attempts = isGeminiBaseUrl(config.referencePromptBaseUrl)
    ? [geminiAttempt, ...openAiCompatibleAttempts]
    : isGeminiModel(model)
      ? [...openAiCompatibleAttempts, geminiAttempt]
      : openAiCompatibleAttempts;
  const errors = [];

  for (const attempt of attempts) {
    let result;
    try {
      if (attempt.type === "gemini") {
        result = await callGeminiEndpoint({
          url: attempt.url,
          apiKey,
          payload: attempt.payload,
        });
      } else {
        result = await callVisionEndpoint({
          url: attempt.type === "responses" ? responsesUrl : chatCompletionsUrl,
          apiKey,
          payload: attempt.payload,
        });
      }
    } catch (error) {
      errors.push(`${attempt.type}: ${error.message}`);
      continue;
    }

    if (!result.ok) {
      errors.push(`${attempt.type}: ${getUpstreamErrorDetail(result)}`);
      continue;
    }

    const prompt = extractVisionPromptText(result.body);
    if (!prompt) {
      const shape = JSON.stringify(result.body || {}).slice(0, 500);
      errors.push(`${attempt.type}: 没有拿到可用提示词。响应片段：${shape}`);
      continue;
    }

    return {
      success: true,
      prompt,
      model,
      upstream: result.body,
      transport: attempt.type,
      endpoint: attempt.type === "gemini"
        ? attempt.url
        : attempt.type === "responses"
          ? responsesUrl
          : chatCompletionsUrl,
    };
  }

  throw new Error(`参考图生成词失败：${errors.join("；")}`);
}

module.exports = {
  UPSTREAM_VISION_REQUEST_TIMEOUT_MS,
  callVisionEndpoint,
  callGeminiEndpoint,
  generatePromptFromReferenceImages,
  normalizeReferencePromptConfig,
};
