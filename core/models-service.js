const { DEFAULT_BASE_URL } = require("./generation");
const { normalizeBaseUrl, replaceEndpointSuffix, trimUrlQueryAndHash } = require("./endpoints");
const { fetchWithTimeout, parseJsonResponse } = require("./http-client");

const MODEL_LIST_TIMEOUT_MS = 12000;

function uniqueModels(models) {
  return Array.from(
    new Set(
      (models || [])
        .map((model) => String(model || "").trim())
        .filter(Boolean)
    )
  );
}

function extractModelIds(body) {
  if (Array.isArray(body?.data)) {
    return uniqueModels(
      body.data.map((item) =>
        typeof item === "string" ? item : item?.id || item?.name || item?.model
      )
    );
  }
  if (Array.isArray(body?.models)) {
    return uniqueModels(
      body.models.map((item) =>
        typeof item === "string" ? item : item?.id || item?.name || item?.model
      )
    );
  }
  return [];
}

function buildModelsUrl(rawBaseUrl) {
  const cleanUrl = trimUrlQueryAndHash(normalizeBaseUrl(rawBaseUrl || DEFAULT_BASE_URL)).replace(/\/+$/, "");
  const lower = cleanUrl.toLowerCase();
  const suffixes = [
    "/v1/chat/completions",
    "/chat/completions",
    "/v1/responses",
    "/responses",
    "/v1/images/generations",
    "/images/generations",
    "/v1/images/edits",
    "/images/edits",
  ];
  for (const suffix of suffixes) {
    if (lower.endsWith(suffix)) {
      return replaceEndpointSuffix(cleanUrl, suffix, suffix.startsWith("/v1/") ? "/v1/models" : "/models");
    }
  }
  if (lower.endsWith("/v1")) {
    return `${cleanUrl}/models`;
  }
  if (lower.endsWith("/models") || lower.endsWith("/v1/models")) {
    return cleanUrl;
  }
  return `${cleanUrl}/v1/models`;
}

async function listModels(input = {}) {
  const modelsUrl = buildModelsUrl(input.baseUrl || DEFAULT_BASE_URL);
  const apiKey = String(input.apiKey || "").trim();
  const response = await fetchWithTimeout(
    modelsUrl,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
    },
    MODEL_LIST_TIMEOUT_MS,
    `模型列表请求超时，已等待 ${Math.floor(MODEL_LIST_TIMEOUT_MS / 1000)} 秒。`
  );
  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(body?.error?.message || body?.message || response.statusText || "模型列表读取失败");
  }
  return extractModelIds(body);
}

module.exports = {
  MODEL_LIST_TIMEOUT_MS,
  buildModelsUrl,
  extractModelIds,
  listModels,
  uniqueModels,
};
