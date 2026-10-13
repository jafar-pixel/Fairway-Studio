import { NextRequest, NextResponse } from "next/server";
import { authorize, databaseError } from "@/lib/studio/server";
import { StudioError, uuidPattern } from "@/lib/studio/contracts";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) throw new StudioError("Cross-origin writes are not allowed.", "FORBIDDEN", 403);
    const body = await request.json();
    if (!body || typeof body.teamId !== "string" || !uuidPattern.test(body.teamId)) throw new StudioError("Select a Team Workspace.", "VALIDATION");
    const {client,user} = await authorize(body.teamId);
    const {data,error} = await client.rpc("studio_ensure_personal", {p_team:body.teamId});
    if(error) throw databaseError(error);
    return NextResponse.json({id:data,userId:user.id},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {
    const known=error instanceof StudioError ? error : new StudioError("Your private studio could not be opened.", "INTERNAL",500);
    return NextResponse.json({error:known.message,code:known.code},{status:known.status,headers:{"Cache-Control":"no-store"}});
  }
}
