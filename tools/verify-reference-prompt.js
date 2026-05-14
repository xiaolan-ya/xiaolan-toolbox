const assert = require("assert/strict");

const {
  buildReferencePromptInstruction,
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

  const instruction = buildReferencePromptInstruction("艾尔登法环史诗封面");
  assert.match(instruction, /reference images are the source of truth/i);
  assert.match(instruction, /typography\/logo references/i);
  assert.match(instruction, /Do not infer any franchise/i);
  assert.match(instruction, /never use it to replace visible image content/i);

  console.log("Reference prompt checks passed.");
}

run();
