const assert = require("assert/strict");
const {
  buildVisionReadableReferenceSvg,
  REFERENCE_VISION_BACKGROUND,
  REFERENCE_VISION_CHECKER,
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

  console.log("Reference image preprocessing checks passed.");
}

run();
