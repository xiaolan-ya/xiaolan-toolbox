const DEFAULT_VISION_PROMPT_MODEL = "gpt-4o-mini";

const REFERENCE_PROMPT_SYSTEM = [
  "You are an expert prompt writer for AI image generation.",
  "Your job is to analyze the user's reference images and turn them into one final prompt in Simplified Chinese.",
  "Only output the final prompt text.",
  "Do not use markdown, bullet points, labels, titles, or explanations.",
].join(" ");

function normalizeVisionPromptModel(model) {
  return String(model || "").trim() || DEFAULT_VISION_PROMPT_MODEL;
}

function buildReferencePromptInstruction(currentPrompt = "") {
  const prompt = String(currentPrompt || "").trim();
  const parts = [
    "Analyze the uploaded reference images and write one production-ready image generation prompt in Simplified Chinese.",
    "The reference images are the source of truth. Describe only what is visually supported by the images.",
    "If the image is a logo, title card, typography sample, or text-only design, write a prompt for recreating that typography or logo design only.",
    "For typography/logo references, focus on exact visible text, font shape, stroke weight, layout, color, texture, small decorative marks, background treatment, and readability.",
    "If the image has a transparent background, white text, or very light strokes, identify the visible typography and describe the intended transparent or dark-preview background instead of calling the image blank or all white.",
    "Do not turn typography/logo references into posters, characters, game covers, landscapes, scenes, or cinematic illustrations.",
    "Do not infer any franchise, game, movie, brand, character, lore, or IP unless it is explicitly visible in the image text.",
    "Include the main subject, style, composition, camera angle, lighting, color palette, material details, background, and mood only when they are clearly visible.",
    "Do not invent important objects, text, names, characters, or styles that are not actually visible.",
    "Keep the result concrete, vivid, and directly usable for image generation.",
    "Aim for one clean paragraph of roughly 120 to 220 Chinese characters.",
  ];

  if (prompt) {
    parts.push(
      `Optional user requirement, use only when it does not conflict with the images and never use it to replace visible image content: ${prompt}`
    );
  }

  parts.push("Return only the final prompt text in Simplified Chinese.");
  return parts.join("\n");
}

function buildVisionChatCompletionsPayload({ model, instruction, imageDataUrls, imageShape = "object", responseFormat }) {
  const imageParts = (imageDataUrls || []).map((imageUrl) => {
    if (imageShape === "string") {
      return {
        type: "image_url",
        image_url: imageUrl,
      };
    }

    return {
      type: "image_url",
      image_url: {
        url: imageUrl,
      },
    };
  });

  return {
    model: normalizeVisionPromptModel(model),
    messages: [
      {
        role: "system",
        content: REFERENCE_PROMPT_SYSTEM,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: instruction,
          },
          ...imageParts,
        ],
      },
    ],
    max_tokens: 350,
    ...(responseFormat ? { response_format: responseFormat } : {}),
  };
}

function buildVisionResponsesPayload({ model, instruction, imageDataUrls, imageShape = "image_url" }) {
  return {
    model: normalizeVisionPromptModel(model),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: instruction,
          },
          ...(imageDataUrls || []).map((imageUrl) => ({
            type: "input_image",
            [imageShape]: imageUrl,
          })),
        ],
      },
    ],
    max_output_tokens: 350,
  };
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    data: match[2],
  };
}

function buildGeminiGenerateContentPayload({ instruction, imageDataUrls }) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: instruction,
          },
          ...(imageDataUrls || [])
            .map(parseDataUrl)
            .filter(Boolean)
            .map((image) => ({
              inlineData: {
                mimeType: image.mimeType,
                data: image.data,
              },
            })),
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 350,
    },
  };
}

function extractTextFromValue(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => extractTextFromValue(item))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (typeof value === "object") {
    if (typeof value.text === "string") {
      return value.text.trim();
    }

    if (typeof value.output_text === "string") {
      return value.output_text.trim();
    }

    if (typeof value.content === "string") {
      return value.content.trim();
    }

    if (typeof value.value === "string") {
      return value.value.trim();
    }

    if (typeof value.message === "string") {
      return value.message.trim();
    }

    if (typeof value.result === "string") {
      return value.result.trim();
    }

    if (Array.isArray(value.content)) {
      return extractTextFromValue(value.content);
    }

    if (Array.isArray(value.parts)) {
      return extractTextFromValue(value.parts);
    }

    if (Array.isArray(value.output)) {
      return extractTextFromValue(value.output);
    }

    if (Array.isArray(value.summary)) {
      return extractTextFromValue(value.summary);
    }
  }

  return "";
}

function cleanGeneratedPrompt(text) {
  return String(text || "")
    .replace(/^```[a-zA-Z]*\s*/u, "")
    .replace(/\s*```$/u, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "")
    .replace(/^final prompt[:：]\s*/iu, "")
    .replace(/^prompt[:：]\s*/iu, "")
    .replace(/^最终提示词[:：]\s*/u, "")
    .trim();
}

function extractVisionPromptText(body) {
  const chatText = extractTextFromValue(body?.choices?.[0]?.message?.content || body?.choices?.[0]?.text);
  if (chatText) {
    return cleanGeneratedPrompt(chatText);
  }

  const geminiText = extractTextFromValue(body?.candidates?.[0]?.content?.parts);
  if (geminiText) {
    return cleanGeneratedPrompt(geminiText);
  }

  const responseText = extractTextFromValue(
    body?.output_text ||
      body?.output ||
      body?.content ||
      body?.response ||
      body?.data ||
      body?.result ||
      body?.message
  );
  return cleanGeneratedPrompt(responseText);
}

function shouldRetryWithResponses(result) {
  if (!result || result.ok) {
    return false;
  }

  const detail = JSON.stringify(result.body || {}).toLowerCase();
  return (
    result.status === 404 ||
    result.status === 405 ||
    detail.includes("chat/completions") ||
    detail.includes("not found") ||
    detail.includes("unsupported") ||
    detail.includes("image_url") ||
    detail.includes("unknown parameter")
  );
}

module.exports = {
  DEFAULT_VISION_PROMPT_MODEL,
  buildReferencePromptInstruction,
  buildGeminiGenerateContentPayload,
  buildVisionChatCompletionsPayload,
  buildVisionResponsesPayload,
  extractVisionPromptText,
  normalizeVisionPromptModel,
  shouldRetryWithResponses,
};
