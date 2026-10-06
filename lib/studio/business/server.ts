import { authorize, databaseError } from "../server";
import { StudioError } from "../contracts";
import { BUSINESS_SCHEMA_VERSION, type BusinessMutation } from "./contracts";

async function capability(workspaceId: string) {
 const auth = await authorize(workspaceId);
 const { data, error } = await auth.client.rpc("studio_business_capabilities", {p_workspace: workspaceId});
 if (error) throw databaseError(error);
 if (data?.schemaVersion !== BUSINESS_SCHEMA_VERSION || data?.foundation !== true) throw new StudioError("Business setup is required. Apply the reviewed Business schema before saving.", "SCHEMA_REQUIRED", 503);
 return auth;
}
export async function readBusiness(params: URLSearchParams) {
 const workspaceId = params.get("workspaceId") ?? "";
 const { client } = await capability(workspaceId);
 const page = Number(params.get("page") ?? 0);
 if (!Number.isSafeInteger(page) || page < 0 || page > 100000) throw new StudioError("Invalid page.", "VALIDATION");
 const { data, error } = await client.rpc("studio_business_read", {p_workspace: workspaceId, p_plan: params.get("planId") || null, p_page: page, p_view: params.get("view") || "all", p_options: params.get("options") || null, p_query: params.get("q") || ""});
 if (error) throw databaseError(error);
 return data;
}
export async function mutateBusiness(mutation: BusinessMutation) {
 const { client } = await capability(mutation.workspaceId);
 const { data, error } = await client.rpc("studio_business_mutate", {p_workspace: mutation.workspaceId, p_operation: mutation.operation, p_request: mutation.requestId, p_input: mutation.input});
 if (error) throw databaseError(error);
 return data;
}
