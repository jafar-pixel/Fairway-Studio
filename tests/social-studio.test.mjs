import test from "node:test";
import assert from "node:assert/strict";
import {
  loadModule,
  workspaceId,
  userId,
  plain,
} from "./media-test-harness.mjs";
import { requestOrigin } from "./request-origin-test-loader.mjs";
const shared = loadModule("lib/studio/contracts.ts");
const contracts = loadModule("lib/studio/social/contracts.ts", {
  "../contracts": shared,
});
const requestId = "33333333-3333-4333-8333-333333333333";
const campaign = {
  workspaceId,
  requestId,
  operation: "createCampaign",
  input: {
    title: "Our first collection",
    purpose: "Tell our own story",
    owner_id: userId,
  },
};
test("campaign contract rejects forged state, missing owner and unbounded objective", () => {
  assert.equal(
    contracts.validateSocialMutation(campaign).operation,
    "createCampaign",
  );
  for (const input of [
    { ...campaign.input, state: "approved" },
    { ...campaign.input, owner_id: null },
    { ...campaign.input, purpose: "" },
    { ...campaign.input, purpose: "a".repeat(2001) },
  ])
    assert.throws(() =>
      contracts.validateSocialMutation({ ...campaign, input }),
    );
});
test("campaign uses authenticated project RPC, retains replay ID, rejects departed owner", async () => {
  const calls = [];
  let member = true;
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle: async () => ({
      data: member ? { user_id: userId } : null,
      error: null,
    }),
  };
  const client = {
    from(name) {
      assert.equal(name, "workspace_members");
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data:
          name === "studio_social_capabilities"
            ? { schemaVersion: 1, manualPackages: true }
            : { id: requestId, revision: 0 },
        error: null,
      };
    },
  };
  const server = loadModule("lib/studio/social/server.ts", {
    "../contracts": shared,
    "./contracts": contracts,
    "../server": {
      authorize: async (id) => {
        assert.equal(id, workspaceId);
        return { client };
      },
      databaseError: (e) => e,
    },
  });
  assert.deepEqual(plain(await server.mutateSocial(campaign)), {
    postId: requestId,
    revision: 0,
  });
  assert.equal(calls[1].name, "studio_mutate");
  assert.equal(calls[1].args.p_request, requestId);
  assert.equal(calls[1].args.p_operation, "createProject");
  assert.equal(calls[1].args.p_input.category, "campaign");
  member = false;
  await assert.rejects(
    () => server.mutateSocial(campaign),
    (e) => e.code === "VALIDATION",
  );
  assert.equal(calls.filter((c) => c.name === "studio_mutate").length, 1);
});
function assistant({ denied = false, failure = false } = {}) {
  let generations = 0,
    parameters;
  const route = loadModule(
    "app/api/studio/social/assist/route.ts",
    {
      "@/lib/studio/contracts": shared,
      "@/lib/studio/request-origin": requestOrigin,
      "@/lib/studio/server": {
        authorize: async () => {
          if (denied)
            throw new shared.StudioError("Access denied", "FORBIDDEN", 403);
        },
      },
      "@/lib/studio/openai-ai": {
        OPENAI_TEXT_MODEL: "configured-model",
        studioOpenAI: () => (name) => ({ name }),
      },
      ai: {
        generateText: async (input) => {
          generations++;
          parameters = input;
          if (failure) throw Error("PRIVATE PROVIDER DETAIL");
          return { text: "An original caption." };
        },
      },
    },
    { Response, Request, TextEncoder },
  );
  return { ...route, count: () => generations, parameters: () => parameters };
}
const body = {
  workspaceId,
  instruction: "Write an original launch teaser",
  context: {
    title: "Jacket",
    purpose: "Introduce design process",
    audience: "Golfers",
    channel: "instagram",
    format: "post",
    caption: "",
  },
};
const post = (payload = body, origin = "https://studio.example") =>
  new Request("https://studio.example/api/studio/social/assist", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
test("assistant checks origin, validation and membership before any paid provider call", async () => {
  const api = assistant();
  assert.equal(
    (await api.POST(post(body, "https://evil.example"))).status,
    403,
  );
  assert.equal(
    (await api.POST(post({ ...body, instruction: "" }))).status,
    400,
  );
  assert.equal(
    (await api.POST(post({ ...body, instruction: "世".repeat(21000) }))).status,
    413,
  );
  assert.equal(api.count(), 0);
  const denied = assistant({ denied: true });
  assert.equal((await denied.POST(post())).status, 403);
  assert.equal(denied.count(), 0);
});
test("assistant returns editable copy with direct configured model, timeout, no retries and no private fields", async () => {
  const api = assistant();
  const response = await api.POST(
    post({
      ...body,
      context: {
        ...body.context,
        release_note: "PRIVATE",
        rights_note: "PRIVATE",
      },
    }),
  );
  assert.deepEqual(await response.json(), { caption: "An original caption." });
  assert.match(response.headers.get("cache-control"), /no-store/);
  const input = api.parameters();
  assert.equal(input.model.name, "configured-model");
  assert.equal(input.maxRetries, 0);
  assert.equal(input.providerOptions.openai.store, false);
  assert.doesNotMatch(input.prompt, /PRIVATE/);
  assert.ok(input.abortSignal);
  const failed = assistant({ failure: true });
  const result = await failed.POST(post());
  assert.equal(result.status, 502);
  assert.doesNotMatch(
    JSON.stringify(await result.json()),
    /PRIVATE PROVIDER DETAIL/,
  );
});
test("workspace overview pagination fails closed on missing or duplicate records", async () => {
  let count = 0;
  const list = {
    schemaVersion: 1,
    actorId: userId,
    members: [],
    pageSize: 1,
    total: 2,
    capabilities: {
      manualPackages: true,
      automaticPosting: false,
      metricsSync: false,
    },
  };
  const api = loadModule(
    "lib/studio/social/client.ts",
    {},
    {
      fetch: async () =>
        Response.json({
          ...list,
          page: count,
          posts: [{ id: String(count++), workspace_id: workspaceId }],
        }),
      Response,
    },
  );
  const data = await api.readAllSocialPosts(workspaceId);
  assert.equal(data.posts.length, 2);
  assert.equal(count, 2);
  count = 0;
  const broken = loadModule(
    "lib/studio/social/client.ts",
    {},
    {
      fetch: async () =>
        Response.json({
          ...list,
          page: count++,
          posts: [{ id: "same", workspace_id: workspaceId }],
        }),
      Response,
    },
  );
  await assert.rejects(
    () => broken.readAllSocialPosts(workspaceId),
    (e) => e.code === "INVALID_RESPONSE",
  );
});

test('publication review refuses a draft that has no destination account yet',async()=>{
 const calls=[];
 const server=loadModule('lib/studio/social/server.ts',{'../contracts':shared,'./contracts':contracts,'../server':{authorize:async()=>({client:{rpc:async(name)=>{calls.push(name);return {data:name==='studio_social_capabilities'?{schemaVersion:1,manualPackages:true}:{post:{account_label:'Account not selected'}},error:null}}}}),databaseError:e=>e}});
 await assert.rejects(()=>server.mutateSocial({workspaceId,requestId,operation:'submitReview',input:{post_id:requestId,expected_revision:0,reviewers:[userId]}}),e=>e.code==='VALIDATION');
 assert.ok(!calls.includes('studio_social_mutate'));
});
