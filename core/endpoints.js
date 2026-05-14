const { DEFAULT_BASE_URL } = require("./generation");

function normalizeBaseUrl(baseUrl) {
  const raw = String(baseUrl || "").trim();
  if (!raw) {
    throw new Error("请填写 API 地址。");
  }

  const prefixed = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return prefixed.replace(/\/+$/, "");
}

function normalizeOptionalBaseUrl(baseUrl) {
  const raw = String(baseUrl || "").trim();
  if (!raw) {
    return "";
  }
  return normalizeBaseUrl(raw);
}

function trimUrlQueryAndHash(url) {
  return String(url || "").replace(/[?#].*$/, "");
}

function replaceEndpointSuffix(url, fromSuffix, toSuffix) {
  const cleanUrl = trimUrlQueryAndHash(url).replace(/\/+$/, "");
  return cleanUrl.replace(new RegExp(`${fromSuffix.replace(/\//g, "\\/")}$`, "i"), toSuffix);
}

function buildVisionEndpointUrls(rawBaseUrl) {
  const baseUrl = normalizeBaseUrl(rawBaseUrl || DEFAULT_BASE_URL);
  const cleanUrl = trimUrlQueryAndHash(baseUrl).replace(/\/+$/, "");
  const lower = cleanUrl.toLowerCase();

  if (lower.endsWith("/v1/chat/completions")) {
    return {
      chatCompletionsUrl: cleanUrl,
      responsesUrl: replaceEndpointSuffix(cleanUrl, "/v1/chat/completions", "/v1/responses"),
    };
  }

  if (lower.endsWith("/chat/completions")) {
    return {
      chatCompletionsUrl: cleanUrl,
      responsesUrl: replaceEndpointSuffix(cleanUrl, "/chat/completions", "/responses"),
    };
  }

  if (lower.endsWith("/v1/responses")) {
    return {
      chatCompletionsUrl: replaceEndpointSuffix(cleanUrl, "/v1/responses", "/v1/chat/completions"),
      responsesUrl: cleanUrl,
    };
  }

  if (lower.endsWith("/responses")) {
    return {
      chatCompletionsUrl: replaceEndpointSuffix(cleanUrl, "/responses", "/chat/completions"),
      responsesUrl: cleanUrl,
    };
  }

  if (lower.endsWith("/v1")) {
    return {
      chatCompletionsUrl: `${cleanUrl}/chat/completions`,
      responsesUrl: `${cleanUrl}/responses`,
    };
  }

  return {
    chatCompletionsUrl: `${cleanUrl}/v1/chat/completions`,
    responsesUrl: `${cleanUrl}/v1/responses`,
  };
}

function buildGeminiGenerateContentUrl(rawBaseUrl, model) {
  const baseUrl = normalizeBaseUrl(rawBaseUrl || "https://generativelanguage.googleapis.com/v1beta");
  const cleanUrl = trimUrlQueryAndHash(baseUrl).replace(/\/+$/, "");
  const lower = cleanUrl.toLowerCase();
  const encodedModel = encodeURIComponent(String(model || "").trim()).replace(/%2F/g, "/");

  if (lower.includes(":generatecontent")) {
    return cleanUrl;
  }

  if (lower.endsWith("/v1beta") || lower.endsWith("/v1")) {
    return `${cleanUrl}/models/${encodedModel}:generateContent`;
  }

  if (lower.endsWith("/models")) {
    return `${cleanUrl}/${encodedModel}:generateContent`;
  }

  if (/generativelanguage\.googleapis\.com$/i.test(new URL(cleanUrl).hostname)) {
    return `${cleanUrl}/v1beta/models/${encodedModel}:generateContent`;
  }

  return `${cleanUrl}/v1beta/models/${encodedModel}:generateContent`;
}

module.exports = {
  normalizeBaseUrl,
  normalizeOptionalBaseUrl,
  trimUrlQueryAndHash,
  replaceEndpointSuffix,
  buildVisionEndpointUrls,
  buildGeminiGenerateContentUrl,
};
