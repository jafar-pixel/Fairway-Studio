import { timingSafeEqual } from "node:crypto";
import { runMediaJob } from "@/lib/studio/media/jobs";
import { PRIVATE_HEADERS } from "@/lib/studio/media/storage";
import { safeMediaFailure } from "@/lib/studio/media/validation";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=240;
/** Optional existing scheduler target. This route alone is not a durable scheduler. */
export async function POST(request:Request) {
 const secret=process.env.STUDIO_MEDIA_WORKER_SECRET,actual=request.headers.get("authorization")??"",expected=`Bearer ${secret??""}`;
 if(!secret||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return Response.json({error:"Worker authorization required."},{status:401,headers:PRIVATE_HEADERS});
 try{const job=await runMediaJob();return Response.json({processed:Boolean(job),jobId:job?.id??null,status:job?.status??null},{headers:PRIVATE_HEADERS});}
 catch(e){const f=safeMediaFailure(e);return Response.json({error:f.message,code:f.code},{status:f.status,headers:PRIVATE_HEADERS});}
}
