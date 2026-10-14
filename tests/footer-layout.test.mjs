import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../components/jl-influence-footer.tsx", import.meta.url),
  "utf8",
);

test("footer is a compact integrated utility row and preserves install actions", () => {
  assert.match(source, /bg-\[#f4f1eb\]/);
  assert.match(source, /h-11 w-\[180px\]/);
  assert.match(source, /md:grid-cols-\[180px_minmax\(0,1fr\)\]/);
  assert.match(source, /md:col-span-2 md:justify-end/);
  assert.doesNotMatch(source, /bg-foreground px-5 py-2/);
  assert.match(source, /<PwaControls \/>/);
  assert.match(source, /Replay onboarding/);
  assert.match(source, /new Event\("fs:open-onboarding", \{ cancelable: true \}\)/);
  assert.match(source, /sessionStorage\.setItem\("fs:replay-onboarding", "1"\)/);
});


