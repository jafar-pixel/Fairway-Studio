import {after} from 'next/server';
import {mediaService,runMediaJob,MEDIA_JOB_TABLE} from './jobs';
import {MEDIA_UUID} from '../media';
// Fluid can reuse one process for concurrent requests. Never run two 2 GiB children in it.
let busy=false;
async function defer(id:string,code='WORKER_BUSY',message='The preview worker is busy. Your original is saved; retry the preview.',attempts?:number){
 const client=mediaService();
 let query=client.from(MEDIA_JOB_TABLE).update({status:'blocked',error_code:code,error_message:message,updated_at:new Date().toISOString()}).eq('id',id).eq('status','queued');
 if(attempts!==undefined)query=query.eq('attempts',attempts);
 await query;
}
/** Call only with job IDs returned by the authenticated registration/query/retry route. */
export function scheduleMediaProcessing(ids:string[]){
 for(const id of [...new Set(ids)].slice(0,20)){
  if(!MEDIA_UUID.test(id))continue;
  after(async()=>{
   const deadline=Date.now()+30000;
   while(busy&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
   if(busy){await defer(id);return;}
   busy=true;
   try{
    const result=await runMediaJob(id);
    if(result?.status==='queued')await defer(id,'RECOVERY_REQUIRED','A temporary processing error interrupted this preview. Retry to continue from the saved original.',result.attempts);
   }catch{await defer(id,'WORKER_SETUP_REQUIRED','The preview runtime could not start. Your original is saved; retry after setup is restored.');}
   finally{busy=false;}
  });
 }
}
