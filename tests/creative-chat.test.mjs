import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const context = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      new URL("../lib/studio/creative-chat.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  context,
);
const { validateCreativePrompt, creativeHistory } = context.exports;
test("creative prompt validation rejects missing, empty and oversized messages", () => {
  for (const value of [null, {}, "", " ", "a".repeat(2001)])
    assert.throws(() => validateCreativePrompt(value));
  assert.equal(validateCreativePrompt("  Burgundy trim  "), "Burgundy trim");
});
test("conversation context excludes pending/failed turns and never impersonates a founder comment as AI", () => {
  const result = creativeHistory([
    { prompt: "failed", answer: "incomplete", mode: "chat", status: "failed" },
    { prompt: "waiting", answer: "", mode: "chat", status: "pending" },
    {
      prompt: "Kyle: softer fabric",
      answer: "",
      mode: "comment",
      status: "complete",
    },
    {
      prompt: "burgundy bag",
      answer: "Image request saved.",
      mode: "image",
      status: "complete",
    },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { role: "user", content: "Kyle: softer fabric" },
    { role: "user", content: "Image request: burgundy bag" },
    { role: "assistant", content: "Image request saved." },
  ]);
});
test("AI context is bounded to latest twenty completed turns", () => {
  const result = creativeHistory(
    Array.from({ length: 30 }, (_, i) => ({
      prompt: String(i),
      answer: "reply",
      status: "complete",
      mode: "chat",
    })),
  );
  assert.equal(result.length, 40);
  assert.equal(result[0].content, "10");
  assert.equal(result.at(-2).content, "29");
});

test("short collection requests have persistent original golf development context even after shopping history",()=>{
 const system=context.exports.golfStudioSystem({title:"Golf clothing collection",brief:"Reference notes"});
 assert.match(system,/Hunter & Heckard/);assert.match(system,/creating the team's own brand and products/);assert.match(system,/golf clothing collection/);assert.match(system,/capsule lineup/);assert.match(system,/only when explicitly requested/);assert.match(system,/Previous shopping answers/);assert.match(system,/does not claim to have created artwork/);
});

test("pants creation is product-only even within a golf collection project",()=>{
 const prompt=context.exports.golfVisualPrompt({prompt:"Create tailored golf pants for our golf collection",target:"design"},{hasSource:false,hasReferences:false});
 assert.match(prompt,/Current user request: Create tailored golf pants/);
 assert.match(prompt,/pants means pants only/);assert.match(prompt,/Default to one standalone requested product/);
 assert.match(prompt,/Merely mentioning 'our golf collection'.*is not such a request/);
 assert.doesNotMatch(prompt,/Default to original on-course apparel|For a collection request, show a coordinated concept board/);
});
test("extracting pants from a collection board overrides whole-source preservation",()=>{
 const prompt=context.exports.golfVisualPrompt({prompt:"Only the pants from this board",preserve:"Preserve the source design except for the changes requested."},{hasSource:true,hasReferences:true});
 assert.match(prompt,/first attached image is the selected source/);
 assert.match(prompt,/isolate that product as the entire new output/);
 assert.match(prompt,/Preserve product details, not unrelated board contents/);
 assert.match(prompt,/do not reproduce their board layout/);
 assert.ok(prompt.indexOf("OUTPUT SCOPE") > prompt.indexOf("Preservation instructions"));
});
test("explicit capsule boards and explicit in-place board edits remain available",()=>{
 const prompt=context.exports.golfVisualPrompt({prompt:"Create a golf capsule concept board"},{hasSource:false,hasReferences:false});
 assert.match(prompt,/permitted only when the current request explicitly asks/);
 assert.match(prompt,/Preserve the whole source board only when explicitly asked to edit that board in place/);
});
