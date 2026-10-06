import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";
const manifest = JSON.parse(
  fs.readFileSync("lib/studio/original-assets.json", "utf8"),
);
const context = {
  exports: {},
  Response,
  Uint8Array,
  URL,
  require(name) {
    if (name === "node:crypto") return crypto;
    if (name === "./original-assets.json") return manifest;
    throw Error(name);
  },
};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("lib/studio/original-media.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText,
  context,
);
const { serveOriginalAsset, originalAssetFor } = context.exports;
const asset = manifest.assets[0],
  id = "33333333-3333-4333-8333-333333333333";
const record = {
  id,
  workspace_id: manifest.workspace_id,
  provenance: {
    import_batch: "fairway-mockups-v1",
    mockup_import: true,
    media_origin: "bundled_original",
    import_asset_path: asset.logical_path,
    asset_sha256: asset.sha256,
  },
};
function fixture({
  user = true,
  member = true,
  version = record,
  corrupt = false,
} = {}) {
  const reads = [];
  const queries = [];
  return {
    reads,
    queries,
    client: {
      auth: {
        async getUser() {
          return { data: { user: user ? { id: "owner" } : null }, error: null };
        },
      },
      from(table) {
        const conditions = [];
        queries.push({ table, conditions });
        return {
          select() {
            return this;
          },
          eq(k, v) {
            conditions.push([k, v]);
            return this;
          },
          async maybeSingle() {
            return {
              data:
                table === "studio_versions"
                  ? version
                  : member
                    ? { workspace_id: manifest.workspace_id }
                    : null,
              error: null,
            };
          },
        };
      },
    },
    async read(name) {
      reads.push(name);
      return corrupt
        ? new Uint8Array([0])
        : new Uint8Array(fs.readFileSync(`assets/originals/${name}`));
    },
  };
}
function url(query = `versionId=${id}`) {
  return new URL(`https://app.example/api/studio/starter-asset?${query}`);
}
function privateResponse(r) {
  assert.match(r.headers.get("cache-control"), /private.*no-store/);
  assert.equal(r.headers.get("cdn-cache-control"), "no-store");
  assert.equal(r.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.equal(r.headers.get("vary"), "Cookie, Authorization");
}
test("original artwork requires verified sign-in before any filesystem read", async () => {
  const d = fixture({ user: false }),
    r = await serveOriginalAsset(url(), d);
  assert.equal(r.status, 401);
  assert.equal(d.reads.length, 0);
  assert.equal(d.queries.length, 0);
  privateResponse(r);
});
test("outsiders and forged cross-workspace provenance cannot retrieve originals", async () => {
  for (const options of [
    { member: false },
    {
      version: {
        ...record,
        workspace_id: "44444444-4444-4444-8444-444444444444",
      },
    },
  ]) {
    const d = fixture(options),
      r = await serveOriginalAsset(url(), d);
    assert.equal(r.status, 404);
    assert.equal(d.reads.length, 0);
    privateResponse(r);
  }
});
test("unknown asset paths, traversal, hash changes and path query escape hatches are rejected", async () => {
  for (const patch of [
    { import_asset_path: "/original-assets/../secret.png" },
    { import_asset_path: "/original-assets/unknown.png" },
    { import_asset_path: "https://evil.test/a.png" },
    { asset_sha256: "0".repeat(64) },
    { media_origin: "bundled_exploratory" },
  ])
    assert.equal(
      originalAssetFor({
        ...record,
        provenance: { ...record.provenance, ...patch },
      }),
      null,
    );
  for (const query of [
    "versionId=../../secret",
    `versionId=${id}&path=/etc/passwd`,
    `versionId=${id}&workspaceId=${manifest.workspace_id}`,
  ]) {
    const d = fixture(),
      r = await serveOriginalAsset(url(query), d);
    assert.equal(r.status, 404);
    assert.equal(d.reads.length, 0);
  }
});
test("members receive exact original bytes with no shared-cache access", async () => {
  const d = fixture(),
    r = await serveOriginalAsset(url(), d);
  assert.equal(r.status, 200);
  privateResponse(r);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.equal(r.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(
    crypto
      .createHash("sha256")
      .update(new Uint8Array(await r.arrayBuffer()))
      .digest("hex"),
    asset.sha256,
  );
  assert.deepEqual(d.queries[1].conditions, [
    ["workspace_id", manifest.workspace_id],
    ["user_id", "owner"],
  ]);
  assert.deepEqual(d.reads, [asset.file]);
});
test("changed bundled bytes fail closed and originals are not public static assets", async () => {
  const d = fixture({ corrupt: true }),
    r = await serveOriginalAsset(url(), d);
  assert.equal(r.status, 404);
  privateResponse(r);
  for (const a of manifest.assets) {
    assert.ok(fs.existsSync(`assets/originals/${a.file}`));
    assert.ok(!fs.existsSync(`public/original-assets/${a.file}`));
    assert.equal(
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(`assets/originals/${a.file}`))
        .digest("hex"),
      a.sha256,
    );
  }
  const config = fs.readFileSync("next.config.mjs", "utf8");
  assert.match(config, /outputFileTracingIncludes/);
  assert.match(config, /assets\/originals\/\*\.png/);
  const route = fs.readFileSync(
    "app/api/studio/starter-asset/route.ts",
    "utf8",
  );
  assert.match(route, /force-dynamic/);
  assert.doesNotMatch(route, /service_role|SERVICE_ROLE/);
});
