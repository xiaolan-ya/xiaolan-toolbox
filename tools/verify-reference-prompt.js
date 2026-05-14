const assert = require("assert/strict");

const {
  buildGeminiGenerateContentPayload,
  extractVisionPromptText,
} = require("./reference-prompt");
const { buildGeminiGenerateContentUrl } = require("../core/endpoints");

function run() {
  const dataUrl = "data:image/png;base64,QUJD";
  const payload = buildGeminiGenerateContentPayload({
    instruction: "describe",
    imageDataUrls: [dataUrl],
  });

  assert.equal(payload.contents[0].parts[0].text, "describe");
  assert.deepEqual(payload.contents[0].parts[1].inlineData, {
    mimeType: "image/png",
    data: "QUJD",
  });

  assert.equal(
    buildGeminiGenerateContentUrl("https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-flash"),
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
  );

  assert.equal(
    extractVisionPromptText({
      candidates: [
        {
          content: {
            parts: [{ text: "深海蓝色中文标题字 Logo，透明背景。" }],
          },
        },
      ],
    }),
    "深海蓝色中文标题字 Logo，透明背景。"
  );

  console.log("Reference prompt checks passed.");
}

run();
