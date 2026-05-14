const assert = require("assert/strict");
const {
  buildVisionReadableReferenceSvg,
  compositeBitmapOnVisionBackground,
  REFERENCE_VISION_BACKGROUND,
  REFERENCE_VISION_BACKGROUND_RGBA,
  REFERENCE_VISION_CHECKER,
  REFERENCE_VISION_CHECKER_RGBA,
} = require("../core/reference-images");

function run() {
  const svg = buildVisionReadableReferenceSvg("data:image/png;base64,QUJD", {
    width: 320,
    height: 180,
  });

  assert.match(svg, /pattern id="checker"/);
  assert.match(svg, /data:image\/png;base64,QUJD/);
  assert.match(svg, /width="320"/);
  assert.match(svg, /height="180"/);
  assert.match(REFERENCE_VISION_BACKGROUND, /^#/);
  assert.match(REFERENCE_VISION_CHECKER, /^#/);

  const transparentWhitePixel = Buffer.from([255, 255, 255, 0]);
  const opaqueWhitePixel = Buffer.from([255, 255, 255, 255]);
  const compositedTransparent = compositeBitmapOnVisionBackground(transparentWhitePixel, 1, 1);
  const compositedOpaque = compositeBitmapOnVisionBackground(opaqueWhitePixel, 1, 1);

  assert.deepEqual(Array.from(compositedTransparent), REFERENCE_VISION_CHECKER_RGBA);
  assert.deepEqual(Array.from(compositedOpaque), [255, 255, 255, 255]);
  assert.notDeepEqual(REFERENCE_VISION_BACKGROUND_RGBA, [255, 255, 255, 255]);

  console.log("Reference image preprocessing checks passed.");
}

run();
