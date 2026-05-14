const http = require("http");
const https = require("https");

function isAbortTimeoutError(error) {
  return error?.name === "AbortError" || error?.message === "upstream-timeout";
}

function isTimeoutLikeError(error) {
  const message = String(error?.message || error || "");
  return /timeout|超时|upstream-timeout/i.test(message);
}

function isRetryableNetworkError(error) {
  const message = String(error?.message || error?.cause?.message || error || "");
  return /fetch failed|network|socket|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|TLS connection|secure TLS|socket hang up/i.test(
    message
  );
}

function getErrorDetail(error) {
  const message = String(error?.message || error || "").trim();
  const cause = String(error?.cause?.message || "").trim();
  return cause && !message.includes(cause) ? `${message}；${cause}` : message;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs, timeoutMessage) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error("upstream-timeout"));
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortTimeoutError(error)) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function postBufferWithTimeout(url, headers, body, timeoutMs, timeoutMessage) {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;

  return await new Promise((resolve, reject) => {
    const request = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers,
        timeout: timeoutMs,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode || 0,
            statusText: response.statusMessage || "",
            text: async () => Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("upstream-timeout"));
    });
    request.on("error", (error) => {
      if (error?.message === "upstream-timeout") {
        reject(new Error(timeoutMessage));
        return;
      }
      reject(error);
    });
    request.end(body);
  });
}

async function parseJsonResponse(response) {
  const rawText = await response.text();
  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    return { raw: rawText };
  }
}

module.exports = {
  isAbortTimeoutError,
  isTimeoutLikeError,
  isRetryableNetworkError,
  getErrorDetail,
  wait,
  fetchWithTimeout,
  postBufferWithTimeout,
  parseJsonResponse,
};
