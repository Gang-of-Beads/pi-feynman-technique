import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";

const root = new URL("..", import.meta.url).pathname;

test("index.ts loads through the host loader and registers its commands", async () => {
  const result = await discoverAndLoadExtensions(["./index.ts"], root);
  // The discovery also picks up the host's own global extension dir, so keep
  // only the copy loaded from this checkout.
  const loaded = result.extensions.filter(
    (extension) => extension.resolvedPath === new URL("../index.ts", import.meta.url).pathname,
  );

  assert.deepEqual(result.errors, []);
  assert.equal(loaded.length, 1);
  assert.deepEqual(
    [...loaded[0].commands.keys()].sort(),
    ["feynman_answer", "feynman_teach", "feynman_technique"],
  );
});

test("README documents the npm install command and the release tag", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  assert.match(readme, /^pi install npm:pi-feynman-technique$/m);
  assert.match(readme, /`v<version>` tag/);
});
