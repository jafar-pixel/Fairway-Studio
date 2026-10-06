/** Only invoked by the server's fixed argv; receives no server credentials. */
const fs=require('node:fs'),path=require('node:path');
const sharp=require('sharp');sharp.cache(false);sharp.concurrency(1);
const [input,type,cwd]=process.argv.slice(2);
const MAX_PIXELS=50000000;
(async()=>{
 if(!path.isAbsolute(input)||!path.isAbsolute(cwd)||fs.statSync(input).size>100000000)throw new Error('INVALID_MEDIA');
 if(type==='image/heic'||type==='image/heif'){
  const heif=await require('libheif-js/wasm-bundle'),decoder=new heif.HeifDecoder();
  const images=decoder.decode(fs.readFileSync(input));
  if(!images.length||images.length>256)throw new Error('INVALID_MEDIA');
  let total=0;
  try{
   for(const image of images){const w=image.get_width(),h=image.get_height();if(w<1||h<1||w>16384||h>16384||w*h>MAX_PIXELS||(total+=w*h)>100000000)throw new Error('PROCESSING_TOO_COMPLEX');}
   const primary=images.find(image=>image.is_primary())??images[0],width=primary.get_width(),height=primary.get_height();
   const rgba=await new Promise((resolve,reject)=>primary.display({data:new Uint8ClampedArray(width*height*4),width,height},data=>data?resolve(data):reject(new Error('INVALID_MEDIA'))));
   const output=path.join(cwd,'preview.jpg');
   await sharp(rgba.data,{raw:{width,height,channels:4},limitInputPixels:MAX_PIXELS}).resize({width:2560,height:2560,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).toColourspace('srgb').jpeg({quality:88}).toFile(output);
   await sharp(output,{failOn:'error'}).stats();
   process.stdout.write('FAIRWAY_MEDIA_RESULT='+JSON.stringify({output,type:'image/jpeg',metadata:{width,height,frames:images.length,conversion:'libheif-wasm-srgb-jpeg'},originalReady:false})+'\n');
  }finally{for(const image of images)image.free();}
 }else{
  const source=sharp(input,{animated:true,failOn:'error',limitInputPixels:100000000});
  const meta=await source.metadata(),height=meta.pageHeight??meta.height,width=meta.width,frames=meta.pages??1;
  if(!width||!height||frames>256||width>16384||height>16384||width*height>MAX_PIXELS||width*height*frames>100000000)throw new Error('PROCESSING_TOO_COMPLEX');
  // Force decoding all pages, while retaining the compatible original as canonical preview.
  await source.raw().toBuffer();
  process.stdout.write('FAIRWAY_MEDIA_RESULT='+JSON.stringify({output:null,type,metadata:{width,height,frames},originalReady:true})+'\n');
 }
})().catch(error=>{process.stderr.write(['PROCESSING_TOO_COMPLEX','INVALID_MEDIA'].includes(error.message)?error.message:'INVALID_MEDIA');process.exitCode=1;});
