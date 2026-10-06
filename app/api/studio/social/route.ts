import { StudioError } from '@/lib/studio/contracts';
import { validateSocialMutation } from '@/lib/studio/social/contracts';
import { readSocial,mutateSocial } from '@/lib/studio/social/server';
import { isSameOriginWrite } from '@/lib/studio/request-origin';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
function failure(error:unknown){const known=error instanceof StudioError?error:new StudioError('Social data is temporarily unavailable.','INTERNAL',500);return Response.json({error:known.message,code:known.code},{status:known.status,headers});}
export async function GET(request:Request){try{
 const result=await readSocial(new URL(request.url).searchParams);
 if(result.kind==='asset')return new Response(null,{status:307,headers:{...headers,Location:`/api/studio/media?versionId=${encodeURIComponent(result.versionId)}&download=1`}});
 if(result.kind==='package')return Response.json(result.data,{headers:{...headers,'Content-Disposition':'attachment; filename="fairway-publication-manifest.json"'}});
 return Response.json(result.data,{headers});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 if(!isSameOriginWrite(request)||request.headers.get('sec-fetch-site')==='cross-site')throw new StudioError('Cross-origin writes are not allowed.','FORBIDDEN',403);
 if(Number(request.headers.get('content-length')??0)>65000)throw new StudioError('Request too large.','VALIDATION',413);
 const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>65000)throw new StudioError('Request too large.','VALIDATION',413);
 let body:unknown;try{body=JSON.parse(raw)}catch{throw new StudioError('Valid JSON is required.','VALIDATION')}
 return Response.json({data:await mutateSocial(validateSocialMutation(body))},{headers});
}catch(error){return failure(error);}}
