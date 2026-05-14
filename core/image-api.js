const {
  fetchWithTimeout,
  getErrorDetail,
  isRetryableNetworkError,
  isTimeoutLikeError,
  parseJsonResponse,
  postBufferWithTimeout,
  wait,
} = require("./http-client");
const {
  buildJsonReferenceImagePayload,
  buildMultipartImageRequestBody,
  buildReferenceImageDataUrls,
  buildReferenceImageParts,
} = require("./reference-images");

const UPSTREAM_REQUEST_TIMEOUT_MS = 300000;
const UPSTREAM_REFERENCE_JSON_TIMEOUT_MS = 300000;
const UPSTREAM_MULTIPART_FALLBACK_TIMEOUT_MS = 15000;
const UPSTREAM_NETWORK_RETRY_COUNT = 2;

async function postJsonImageGeneration(
  config,
  payload,
  timeoutMessage,
  timeoutMs = UPSTREAM_REQUEST_TIMEOUT_MS
) {
  const url = `${config.baseUrl}/v1/images/generations`;
  const bodyText = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  let response = null;
  let lastError = null;

  for (let attempt = 0; attempt <= UPSTREAM_NETWORK_RETRY_COUNT; attempt += 1) {
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers,
          body: bodyText,
        },
        timeoutMs,
        timeoutMessage
      );
      break;
    } catch (error) {
      lastError = error;
      if (isTimeoutLikeError(error) || !isRetryableNetworkError(error)) {
        throw error;
      }
      if (attempt >= UPSTREAM_NETWORK_RETRY_COUNT) {
        throw new Error(`网络连接失败：${getErrorDetail(error)}`);
      }
      await wait(900 * (attempt + 1));
    }
  }

  if (!response) {
    throw lastError || new Error("网络请求失败。");
  }

  const body = await parseJsonResponse(response);

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body,
  };
}

function getUpstreamErrorDetail(result) {
  return (
    result?.body?.error?.message ||
    result?.body?.message ||
    result?.body?.raw ||
    result?.statusText ||
    "未知错误"
  );
}

function hasGeneratedImages(body) {
  return Array.isArray(body?.data) && body.data.some((item) => item?.b64_json || item?.url);
}

async function requestJsonReferenceImageGeneration(config, payload, referenceImagePaths, timeoutMessage) {
  const imageDataUrls = await buildReferenceImageDataUrls(referenceImagePaths);
  const attempts = [
    {
      name: "image",
      payload: buildJsonReferenceImagePayload(payload, imageDataUrls, "image"),
    },
    {
      name: "reference_images",
      payload: buildJsonReferenceImagePayload(payload, imageDataUrls, "reference_images"),
    },
  ];
  const errors = [];

  for (const attempt of attempts) {
    const result = await postJsonImageGeneration(
      config,
      attempt.payload,
      timeoutMessage,
      UPSTREAM_REFERENCE_JSON_TIMEOUT_MS
    );
    if (result.ok && hasGeneratedImages(result.body)) {
      return {
        ...result.body,
        reference_image_transport: `json:${attempt.name}`,
        reference_edit_fallback_errors: Array.isArray(payload.__referenceEditErrors)
          ? payload.__referenceEditErrors
          : undefined,
      };
    }

    errors.push(`${attempt.name}: ${getUpstreamErrorDetail(result)}`);
  }

  throw new Error(`参考图生成失败：参考图 JSON 接口不可用。${errors.join("；")}`);
}

async function requestMultipartReferenceImageGeneration(config, payload, referenceImagePaths, timeoutMessage) {
  const imageParts = await buildReferenceImageParts(referenceImagePaths);
  const multipart = buildMultipartImageRequestBody(payload, imageParts);
  const response = await postBufferWithTimeout(
    `${config.baseUrl}/v1/images/edits`,
    {
      ...multipart.headers,
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    multipart.body,
    UPSTREAM_MULTIPART_FALLBACK_TIMEOUT_MS,
    `参考图备用接口超时，已等待 ${Math.floor(UPSTREAM_MULTIPART_FALLBACK_TIMEOUT_MS / 1000)} 秒。`
  );
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`edits: ${body?.error?.message || body?.message || response.statusText}`);
  }

  if (!hasGeneratedImages(body)) {
    throw new Error("edits: 上游没有返回可保存的图片");
  }

  return {
    ...body,
    reference_image_transport: "multipart:edits",
  };
}

async function postFormDataReferenceImageEdit(config, payload, referenceImagePaths, timeoutMessage, imageFieldName) {
  const imageParts = await buildReferenceImageParts(referenceImagePaths);
  if (imageParts.length === 0 || imageParts.some((image) => !image?.buffer)) {
    throw new Error("edits-formdata: 参考图读取失败");
  }

  const form = new FormData();
  form.append("model", payload.model);
  form.append("prompt", payload.prompt);
  if (payload.size) {
    form.append("size", payload.size);
  }
  if (payload.quality) {
    form.append("quality", payload.quality);
  }
  if (payload.output_format) {
    form.append("output_format", payload.output_format);
  }
  form.append("response_format", "b64_json");
  const fieldName = imageFieldName || "image[]";
  for (const image of imageParts) {
    form.append(
      fieldName,
      new Blob([image.buffer], {
        type: image.mimeType || "image/png",
      }),
      image.fileName || "reference.png"
    );
  }

  const response = await fetchWithTimeout(
    `${config.baseUrl}/v1/images/edits`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: form,
    },
    UPSTREAM_REFERENCE_JSON_TIMEOUT_MS,
    timeoutMessage
  );
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`edits-formdata: ${body?.error?.message || body?.message || response.statusText}`);
  }

  if (!hasGeneratedImages(body)) {
    throw new Error("edits-formdata: 上游没有返回可保存的图片");
  }

  return {
    ...body,
    reference_image_transport: `formdata:edits:${fieldName}`,
  };
}

async function requestFormDataReferenceImageEdit(config, payload, referenceImagePaths, timeoutMessage) {
  if (!Array.isArray(referenceImagePaths) || referenceImagePaths.length === 0) {
    throw new Error("edits-formdata: 缺少参考图");
  }

  const attempts = ["image[]", "image"];
  const errors = [];
  for (const fieldName of attempts) {
    try {
      return await postFormDataReferenceImageEdit(
        config,
        payload,
        referenceImagePaths,
        timeoutMessage,
        fieldName
      );
    } catch (error) {
      errors.push(`${fieldName}: ${error.message}`);
      if (isTimeoutLikeError(error) || isRetryableNetworkError(error)) {
        throw error;
      }
    }
  }

  throw new Error(`edits-formdata: 标准编辑接口不可用。${errors.join("；")}`);
}

async function requestImageGeneration(config, payload, referenceImagePaths) {
  const hasReferenceImages = Array.isArray(referenceImagePaths) && referenceImagePaths.length > 0;
  const endpoint = hasReferenceImages ? "/v1/images/edits" : "/v1/images/generations";
  const url = `${config.baseUrl}${endpoint}`;

  let response;
  if (hasReferenceImages) {
    const imageParts = await buildReferenceImageParts(referenceImagePaths);
    const multipart = buildMultipartImageRequestBody(payload, imageParts);
    response = await postBufferWithTimeout(
      url,
      {
        ...multipart.headers,
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      multipart.body,
      UPSTREAM_REQUEST_TIMEOUT_MS,
      `生成请求超时，已等待 ${Math.floor(UPSTREAM_REQUEST_TIMEOUT_MS / 1000)} 秒。`
    );
  } else {
    response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
      },
      UPSTREAM_REQUEST_TIMEOUT_MS,
      `生成请求超时，已等待 ${Math.floor(UPSTREAM_REQUEST_TIMEOUT_MS / 1000)} 秒。`
    );
  }

  const parsedBody = await parseJsonResponse(response);

  if (!response.ok) {
    const detail = parsedBody?.error?.message || parsedBody?.message || response.statusText;
    throw new Error(`上游接口返回错误：${detail}`);
  }

  return parsedBody;
}

async function requestImageGenerationSafe(config, payload, referenceImagePaths) {
  const hasReferenceImages = Array.isArray(referenceImagePaths) && referenceImagePaths.length > 0;
  const timeoutMessage = `生成请求超时，已等待 ${Math.floor(UPSTREAM_REQUEST_TIMEOUT_MS / 1000)} 秒。`;
  const referenceJsonTimeoutMessage =
    `参考图请求超时，已等待 ${Math.floor(UPSTREAM_REFERENCE_JSON_TIMEOUT_MS / 1000)} 秒。` +
    "参考图已压缩上传，但上游长时间没有返回，请稍后重试，或降低生成尺寸/质量。";
  if (hasReferenceImages) {
    const errors = [];
    try {
      return await requestFormDataReferenceImageEdit(
        config,
        payload,
        referenceImagePaths,
        referenceJsonTimeoutMessage
      );
    } catch (error) {
      errors.push(error.message);
      Object.defineProperty(payload, "__referenceEditErrors", {
        value: [...errors],
        enumerable: false,
        configurable: true,
      });
      if (isTimeoutLikeError(error)) {
        throw new Error(`参考图生成失败：${error.message}`);
      }
    }

    try {
      return await requestJsonReferenceImageGeneration(
        config,
        payload,
        referenceImagePaths,
        referenceJsonTimeoutMessage
      );
    } catch (error) {
      errors.push(error.message);
      if (isTimeoutLikeError(error)) {
        throw new Error(`参考图生成失败：${error.message}`);
      }
    }

    try {
      return await requestMultipartReferenceImageGeneration(
        config,
        payload,
        referenceImagePaths,
        timeoutMessage
      );
    } catch (error) {
      errors.push(error.message);
    }

    throw new Error(
      `参考图生成失败：参考图已经上传，但上游没有接受任何参考图请求；已停止生成，避免丢掉参考图后跑偏。${errors.join("；")}`
    );
  }

  const result = await postJsonImageGeneration(
    config,
    payload,
    timeoutMessage,
    UPSTREAM_REQUEST_TIMEOUT_MS
  );
  const body = result.body;

  if (!result.ok) {
    const detail = body?.error?.message || body?.message || result.statusText;
    throw new Error(`上游接口返回错误：${detail}`);
  }

  return body;
}

async function requestImageGenerationBatch(config, payload, referenceImagePaths) {
  const requestedCount = Number(payload.n || 1);
  let upstream = null;
  let lastError = null;
  let images = [];

  if (requestedCount <= 1) {
    upstream = await requestImageGenerationSafe(config, payload, referenceImagePaths);
    return {
      upstream,
      images: Array.isArray(upstream?.data) ? upstream.data : [],
    };
  }

  try {
    upstream = await requestImageGenerationSafe(config, payload, referenceImagePaths);
    images = Array.isArray(upstream?.data) ? [...upstream.data] : [];
  } catch (error) {
    lastError = error;
  }

  if (!upstream && images.length === 0 && lastError) {
    throw lastError;
  }

  if (images.length < requestedCount) {
    const supplementPayload = {
      ...payload,
      n: 1,
    };
    const missingCount = requestedCount - images.length;
    const supplementResults = await Promise.allSettled(
      Array.from({ length: missingCount }, () =>
        requestImageGenerationSafe(config, supplementPayload, referenceImagePaths)
      )
    );

    for (const result of supplementResults) {
      if (result.status === "fulfilled") {
        if (!upstream) {
          upstream = result.value;
        }
        if (Array.isArray(result.value?.data) && result.value.data.length > 0) {
          images.push(...result.value.data.slice(0, 1));
        }
        continue;
      }

      lastError = result.reason;
    }
  }

  if (!upstream) {
    throw lastError || new Error("生成失败，请稍后重试。");
  }

  return {
    upstream: {
      ...upstream,
      data: images.slice(0, requestedCount),
    },
    images: images.slice(0, requestedCount),
  };
}

module.exports = {
  UPSTREAM_REQUEST_TIMEOUT_MS,
  UPSTREAM_REFERENCE_JSON_TIMEOUT_MS,
  UPSTREAM_MULTIPART_FALLBACK_TIMEOUT_MS,
  UPSTREAM_NETWORK_RETRY_COUNT,
  postJsonImageGeneration,
  getUpstreamErrorDetail,
  hasGeneratedImages,
  requestJsonReferenceImageGeneration,
  requestMultipartReferenceImageGeneration,
  postFormDataReferenceImageEdit,
  requestFormDataReferenceImageEdit,
  requestImageGeneration,
  requestImageGenerationSafe,
  requestImageGenerationBatch,
};
