const assert = require("assert/strict");

process.env.XIAOLAN_DESKTOP_TEST = "1";

const { __test__ } = require("../main");
const generation = require("../core/generation");

const baseConfig = {
  baseUrl: "https://www.packyapi.com",
  apiKey: "test",
  model: "gpt-image-2",
  quality: "high",
  outputFormat: "png",
};

function build(input) {
  return __test__.buildGenerationPayload(baseConfig, {
    prompt: "test prompt",
    count: 1,
    size: "1024x1024",
    outputFormat: "png",
    ...input,
  });
}

function run() {
  assert.equal(__test__.buildGenerationPayload, generation.buildGenerationPayload);

  const textDefault = build();
  assert.equal(textDefault.background, undefined);

  const customMulti = build({ count: 16, size: "1280x720" });
  assert.equal(customMulti.n, 16);
  assert.equal(customMulti.size, "1280x720");

  assert.throws(() => build({ count: 17 }), /1 到 16/);

  const imageDefault = build({
    referenceImagePaths: ["D:/tmp/reference.png"],
  });
  assert.equal(imageDefault.background, undefined);

  const multipart = __test__.buildMultipartImageRequestBody(imageDefault, [
    { buffer: Buffer.from("x"), fileName: "reference.png", mimeType: "image/png" },
  ]);
  assert.equal(multipart.body.toString("utf8").includes('name="background"'), false);

  console.log("Generation rule checks passed.");
}

run();
