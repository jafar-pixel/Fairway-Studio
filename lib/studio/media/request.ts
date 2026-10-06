import { MediaError } from "./validation";
/** Metadata only: stop reading even when a caller omits Content-Length. */
export async function readMediaJson(request:Request,maxBytes=16000):Promise<Record<string,unknown>> {
  const declared=Number(request.headers.get("content-length")??0);
  if(Number.isFinite(declared)&&declared>maxBytes)throw new MediaError("INVALID_REQUEST","Media details are too large.",413);
  const reader=request.body?.getReader();if(!reader)throw new MediaError("INVALID_REQUEST","Media details are required.",400);
  const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw new MediaError("INVALID_REQUEST","Media details are too large.",413);chunks.push(value);}
  }finally{await reader.cancel().catch(()=>undefined);}
  let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new MediaError("INVALID_REQUEST","Media details must be valid JSON.",400);}
  if(!body||typeof body!=="object"||Array.isArray(body))throw new MediaError("INVALID_REQUEST","Media details must be an object.",400);
  return body as Record<string,unknown>;
}
