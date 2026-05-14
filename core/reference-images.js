const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { nativeImage } = require("electron");
const { MIME_BY_EXTENSION } = require("./generation");

const REFERENCE_IMAGE_MAX_DIMENSION = 1600;
const REFERENCE_IMAGE_COMPRESS_SIZE_BYTES = 1_000_000;
const REFERENCE_IMAGE_JPEG_QUALITY = 82;
const REFERENCE_IMAGE_MIN_DIMENSION = 768;
const REFERENCE_IMAGE_MIN_JPEG_QUALITY = 64;
const REFERENCE_BOARD_MAX_WIDTH = 1600;
const REFERENCE_BOARD_MAX_HEIGHT = 1600;
const REFERENCE_BOARD_JPEG_QUALITY = 78;

function getMimeTypeForFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_BY_EXTENSION[extension] || "application/octet-stream";
}

function getScaledImageSize(width, height, maxDimension) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const largestSide = Math.max(safeWidth, safeHeight);

  if (largestSide <= maxDimension) {
    return {
      width: safeWidth,
      height: safeHeight,
    };
  }

  const scale = maxDimension / largestSide;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function buildCompressedReferenceFileName(filePath, targetExtension) {
  const baseName = path.basename(filePath, path.extname(filePath));
  return `${baseName}${targetExtension}`;
}

function buildMultipartReferenceFileName(index, mimeType) {
  const extensionByMime = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
  };
  const extension = extensionByMime[mimeType] || ".png";
  return `reference-${index + 1}${extension}`;
}

function escapeSvgAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getImagePartDimensions(imagePart) {
  try {
    if (!nativeImage?.createFromBuffer || !imagePart?.buffer) {
      return null;
    }
    const image = nativeImage.createFromBuffer(imagePart.buffer);
    if (image.isEmpty()) {
      return null;
    }
    return image.getSize();
  } catch (error) {
    return null;
  }
}

function fitRectIntoBox(width, height, boxWidth, boxHeight) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(boxWidth / safeWidth, boxHeight / safeHeight);
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function buildReferenceBoardPart(imageParts) {
  if (!nativeImage?.createFromDataURL || !Array.isArray(imageParts) || imageParts.length <= 1) {
    return null;
  }

  const columns = imageParts.length <= 2 ? imageParts.length : 2;
  const rows = Math.ceil(imageParts.length / columns);
  const gap = 24;
  const padding = 28;
  const labelHeight = 34;
  const cellWidth = Math.floor((REFERENCE_BOARD_MAX_WIDTH - padding * 2 - gap * (columns - 1)) / columns);
  const cellHeight = Math.floor(
    (REFERENCE_BOARD_MAX_HEIGHT - padding * 2 - gap * (rows - 1)) / rows
  );
  const boardWidth = padding * 2 + columns * cellWidth + (columns - 1) * gap;
  const boardHeight = padding * 2 + rows * cellHeight + (rows - 1) * gap;

  const imageTags = imageParts
    .map((imagePart, index) => {
      const dimensions = getImagePartDimensions(imagePart) || { width: cellWidth, height: cellHeight };
      const row = Math.floor(index / columns);
      const column = index % columns;
      const originX = padding + column * (cellWidth + gap);
      const originY = padding + row * (cellHeight + gap);
      const imageBoxHeight = Math.max(1, cellHeight - labelHeight);
      const fitted = fitRectIntoBox(dimensions.width, dimensions.height, cellWidth, imageBoxHeight);
      const x = originX + Math.round((cellWidth - fitted.width) / 2);
      const y = originY + labelHeight + Math.round((imageBoxHeight - fitted.height) / 2);
      const dataUrl = `data:${imagePart.mimeType};base64,${imagePart.buffer.toString("base64")}`;
      const label = index === 0 ? "PRIMARY REFERENCE" : `STYLE REFERENCE ${index + 1}`;
      return [
        `<rect x="${originX}" y="${originY}" width="${cellWidth}" height="${cellHeight}" fill="#f6f2ea" stroke="#c7bda8" stroke-width="3"/>`,
        `<text x="${originX + 18}" y="${originY + 24}" font-size="18" font-family="Arial, sans-serif" font-weight="700" fill="#251f18">${escapeSvgAttribute(label)}</text>`,
        `<image href="${dataUrl}" x="${x}" y="${y}" width="${fitted.width}" height="${fitted.height}" preserveAspectRatio="xMidYMid meet"/>`,
      ].join("");
    })
    .join("");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${boardWidth}" height="${boardHeight}" viewBox="0 0 ${boardWidth} ${boardHeight}">`,
    `<rect width="100%" height="100%" fill="#efe7da"/>`,
    imageTags,
    `</svg>`,
  ].join("");
  const boardImage = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
  if (!boardImage || boardImage.isEmpty()) {
    return null;
  }

  const buffer = boardImage.toJPEG(REFERENCE_BOARD_JPEG_QUALITY);
  return {
    buffer,
    fileName: "reference-board.jpg",
    originalFileName: "reference-board.jpg",
    mimeType: "image/jpeg",
    size: buffer.length,
  };
}

function compressReferenceImageBuffer(filePath, inputBuffer) {
  const originalMimeType = getMimeTypeForFile(filePath);
  if (!nativeImage?.createFromBuffer) {
    return {
      buffer: inputBuffer,
      mimeType: originalMimeType,
      fileName: path.basename(filePath),
    };
  }

  const image = nativeImage.createFromBuffer(inputBuffer);

  if (image.isEmpty()) {
    return {
      buffer: inputBuffer,
      mimeType: originalMimeType,
      fileName: path.basename(filePath),
    };
  }

  const originalSize = image.getSize();
  const scaledSize = getScaledImageSize(
    originalSize.width,
    originalSize.height,
    REFERENCE_IMAGE_MAX_DIMENSION
  );
  const shouldResize =
    scaledSize.width !== originalSize.width || scaledSize.height !== originalSize.height;
  const shouldCompress = shouldResize || inputBuffer.length > REFERENCE_IMAGE_COMPRESS_SIZE_BYTES;

  if (!shouldCompress) {
    return {
      buffer: inputBuffer,
      mimeType: originalMimeType,
      fileName: path.basename(filePath),
    };
  }

  const normalizedImage = shouldResize
    ? image.resize({
        width: scaledSize.width,
        height: scaledSize.height,
        quality: "best",
      })
    : image;

  let currentImage = normalizedImage;
  let currentSize = scaledSize;
  let currentQuality = REFERENCE_IMAGE_JPEG_QUALITY;
  let outputBuffer = currentImage.toJPEG(currentQuality);

  while (
    outputBuffer.length > REFERENCE_IMAGE_COMPRESS_SIZE_BYTES &&
    (currentQuality > REFERENCE_IMAGE_MIN_JPEG_QUALITY ||
      Math.max(currentSize.width, currentSize.height) > REFERENCE_IMAGE_MIN_DIMENSION)
  ) {
    if (currentQuality > REFERENCE_IMAGE_MIN_JPEG_QUALITY) {
      currentQuality = Math.max(REFERENCE_IMAGE_MIN_JPEG_QUALITY, currentQuality - 8);
    } else {
      const scale = Math.max(
        REFERENCE_IMAGE_MIN_DIMENSION / Math.max(currentSize.width, currentSize.height),
        0.82
      );
      currentSize = {
        width: Math.max(1, Math.round(currentSize.width * scale)),
        height: Math.max(1, Math.round(currentSize.height * scale)),
      };
      currentImage = currentImage.resize({
        width: currentSize.width,
        height: currentSize.height,
        quality: "best",
      });
    }
    outputBuffer = currentImage.toJPEG(currentQuality);
  }

  if (!shouldResize && inputBuffer.length <= REFERENCE_IMAGE_COMPRESS_SIZE_BYTES) {
    return {
      buffer: inputBuffer,
      mimeType: originalMimeType,
      fileName: path.basename(filePath),
    };
  }

  return {
    buffer: outputBuffer,
    mimeType: "image/jpeg",
    fileName: buildCompressedReferenceFileName(filePath, ".jpg"),
  };
}

async function buildReferenceImageParts(referenceImagePaths) {
  const imageParts = [];

  for (const filePath of referenceImagePaths || []) {
    const buffer = await fs.readFile(filePath);
    const normalized = compressReferenceImageBuffer(filePath, buffer);
    imageParts.push({
      buffer: normalized.buffer,
      fileName: buildMultipartReferenceFileName(imageParts.length, normalized.mimeType),
      originalFileName: normalized.fileName,
      mimeType: normalized.mimeType,
      size: normalized.buffer.length,
    });
  }

  return imageParts;
}

function escapeMultipartFieldValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

function buildMultipartImageRequestBody(payload, imageParts) {
  const boundary = `xiaolan${crypto.randomBytes(16).toString("hex")}`;
  const chunks = [];
  const pushText = (text) => {
    chunks.push(Buffer.from(text, "utf8"));
  };

  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) {
      continue;
    }
    pushText(`--${boundary}\r\n`);
    pushText(`Content-Disposition: form-data; name="${escapeMultipartFieldValue(key)}"\r\n\r\n`);
    pushText(`${String(value)}\r\n`);
  }

  for (const image of imageParts || []) {
    pushText(`--${boundary}\r\n`);
    pushText(
      `Content-Disposition: form-data; name="image"; filename="${escapeMultipartFieldValue(
        image.fileName || "reference.png"
      )}"\r\n`
    );
    pushText(`Content-Type: ${image.mimeType || "application/octet-stream"}\r\n\r\n`);
    chunks.push(Buffer.isBuffer(image.buffer) ? image.buffer : Buffer.from(image.buffer));
    pushText("\r\n");
  }

  pushText(`--${boundary}--\r\n`);
  const body = Buffer.concat(chunks);

  return {
    body,
    boundary,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
  };
}

async function buildReferenceImageDataUrls(referenceImagePaths) {
  const imageDataUrls = [];
  const files = await buildReferenceImageParts(referenceImagePaths);
  const referenceBoard = files.length > 1 ? buildReferenceBoardPart(files) : null;
  const uploadFiles = referenceBoard ? [referenceBoard] : files;

  for (const file of uploadFiles) {
    imageDataUrls.push(`data:${file.mimeType};base64,${file.buffer.toString("base64")}`);
  }

  return imageDataUrls;
}

function buildJsonReferenceImagePayload(payload, imageDataUrls, imageFieldName) {
  const cleanPayload = {
    ...(payload || {}),
  };
  delete cleanPayload.visiblePrompt;
  delete cleanPayload.requestedOutputFormat;

  if (imageFieldName === "image") {
    cleanPayload.image = imageDataUrls.length === 1 ? imageDataUrls[0] : imageDataUrls;
  } else {
    cleanPayload[imageFieldName] = imageDataUrls;
  }

  return cleanPayload;
}

module.exports = {
  REFERENCE_IMAGE_MAX_DIMENSION,
  REFERENCE_IMAGE_COMPRESS_SIZE_BYTES,
  REFERENCE_IMAGE_JPEG_QUALITY,
  REFERENCE_IMAGE_MIN_DIMENSION,
  REFERENCE_IMAGE_MIN_JPEG_QUALITY,
  REFERENCE_BOARD_MAX_WIDTH,
  REFERENCE_BOARD_MAX_HEIGHT,
  REFERENCE_BOARD_JPEG_QUALITY,
  getMimeTypeForFile,
  getScaledImageSize,
  buildCompressedReferenceFileName,
  buildMultipartReferenceFileName,
  escapeSvgAttribute,
  getImagePartDimensions,
  fitRectIntoBox,
  buildReferenceBoardPart,
  compressReferenceImageBuffer,
  buildReferenceImageParts,
  escapeMultipartFieldValue,
  buildMultipartImageRequestBody,
  buildReferenceImageDataUrls,
  buildJsonReferenceImagePayload,
};
