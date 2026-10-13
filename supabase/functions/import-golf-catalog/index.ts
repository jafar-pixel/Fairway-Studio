import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const digest=async(bytes:Uint8Array)=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)));
Deno.serve(async(request:Request)=>{
 try {
  if(request.method!=="POST")return new Response('{"error":"Method not allowed"}',{status:405,headers});
  if(Number(request.headers.get("content-length")||0)>8500000)return new Response('{"error":"Too large"}',{status:413,headers});
  const token=request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!token)return new Response('{"error":"Import authorization required"}',{status:401,headers});
  const body=await request.json();
  if(typeof body.key!=="string" || !/^[a-z0-9-]{1,100}$/.test(body.key) || typeof body.png!=="string" || body.png.length>8400000)return new Response('{"error":"Invalid asset"}',{status:400,headers});
  const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const p_hash=await digest(new TextEncoder().encode(token));
  const {data:asset,error}=await client.rpc("studio_catalog_import_asset",{p_hash,p_key:body.key,p_finish:false});
  if(error||!asset)return new Response('{"error":"Import not authorized"}',{status:403,headers});
  if(asset.complete)return Response.json({fileId:asset.file_id,complete:true},{headers});
  const bytes=Uint8Array.from(atob(body.png),c=>c.charCodeAt(0));
  if(bytes.length>6291456 || bytes.length<8 || hex(bytes.slice(0,8))!=="89504e470d0a1a0a" || await digest(bytes)!==asset.sha256)return new Response('{"error":"Image hash or signature mismatch"}',{status:422,headers});
  const {error:upload}=await client.storage.from("workspace-media").upload(asset.path,bytes,{contentType:"image/png",upsert:false});
  if(upload){const {data:existing}=await client.storage.from("workspace-media").download(asset.path);if(!existing || await digest(new Uint8Array(await existing.arrayBuffer()))!==asset.sha256)return new Response('{"error":"Upload could not be verified"}',{status:409,headers});}
  const {data:finished,error:finishError}=await client.rpc("studio_catalog_import_asset",{p_hash,p_key:body.key,p_finish:true});
  if(finishError)return new Response('{"error":"Registration could not finish"}',{status:503,headers});
  return Response.json({fileId:finished.file_id,complete:true},{headers});
 }catch{return new Response('{"error":"Import could not finish"}',{status:500,headers});}
});
