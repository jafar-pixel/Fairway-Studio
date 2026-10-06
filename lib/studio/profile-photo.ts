/** Browser-safe profile photo rules; no remote URLs or identity inference. */
export const PROFILE_INPUT_LIMIT = 8 * 1024 * 1024;
export const PROFILE_PIXEL_LIMIT = 40_000_000;
export const PROFILE_OUTPUT_SIZE = 512;
export const PROFILE_FORMATS = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoCrop = { zoom: number; x: number; y: number };
export const DEFAULT_PHOTO_CROP: PhotoCrop = { zoom: 1, x: 0, y: 0 };
export function profileFileError(file: {size: number; type: string}): string | null {
  if (!PROFILE_FORMATS.includes(file.type as typeof PROFILE_FORMATS[number])) return 'Choose a JPEG, PNG or WebP photo. Convert HEIC photos to JPEG first.';
  if (file.size <= 0 || file.size > PROFILE_INPUT_LIMIT) return 'Choose a photo smaller than 8 MB.';
  return null;
}
export function profileCropRect(width: number, height: number, crop: PhotoCrop) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width * height > PROFILE_PIXEL_LIMIT) throw new Error('This photo is too large to crop. Choose a photo under 40 megapixels.');
  const bound = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
  const side = Math.min(width, height) / bound(crop.zoom, 1, 3);
  return { x: (width - side) * (bound(crop.x, -100, 100) + 100) / 200, y: (height - side) * (bound(crop.y, -100, 100) + 100) / 200, size: side };
}
export function avatarInitials(name = '') {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase() || '?';
}
export function profileImageUrl(userId: string | undefined, version = 0) {
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return null;
  return `/api/studio/profile-photo?userId=${encodeURIComponent(userId)}&image=1&v=${version}`;
}
const labels: Record<string, string> = {
  linkIdeaAsset: 'Linked an asset to an idea', unlinkIdeaAsset: 'Removed an idea asset link', createIdea: 'Created an idea', updateIdea: 'Updated an idea', deleteIdea: 'Deleted an idea',
  createProject: 'Created a project', updateProject: 'Updated a project', createTask: 'Created a task', updateTask: 'Updated a task', deleteTask: 'Deleted a task',
  createVersion: 'Added a version', requestReview: 'Requested a review', submitReview: 'Submitted a review', createDecision: 'Recorded a decision', sendMessage: 'Sent a message',
  addFile: 'Added a file', addReference: 'Saved a reference', updateWorkspace: 'Updated workspace settings', updateMember: 'Updated a team member',
};
export function activityLabel(activity: {description?: string; event?: string; operation?: string}) {
  if (activity.description?.trim()) return activity.description;
  const key = activity.event || activity.operation || '';
  if (labels[key]) return labels[key];
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_:.\-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Updated the workspace';
}

/** Read raster headers before asking the browser to decode compressed pixels. */
export function profilePhotoDimensions(bytes: Uint8Array, declaredType: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  const invalid = () => { throw new Error('This photo has an invalid image header. Choose another JPEG, PNG or WebP.'); };
  const dimensions: Array<{width: number; height: number}> = [];
  if (declaredType === 'image/png' && bytes.length >= 33 && bytes[0] === 137 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') {
    dimensions.push({width:view.getUint32(16),height:view.getUint32(20)});
    for(let at=8;at+12<=bytes.length;){const length=view.getUint32(at);if(ascii(at+4,4)==='acTL')throw new Error('Choose a still photo rather than an animated PNG.');if(length>bytes.length-at-12)break;at+=length+12;}
  } else if (declaredType === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let at=2;
    while(at+3<bytes.length){
      if(bytes[at++]!==255)invalid();while(bytes[at]===255)at++;const marker=bytes[at++];
      if(marker===0xda||marker===0xd9)break;
      if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(at+2>bytes.length)invalid();const length=view.getUint16(at);if(length<2||at+length>bytes.length)invalid();
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
        if(length<8)invalid();dimensions.push({height:view.getUint16(at+3),width:view.getUint16(at+5)});
      }
      at+=length;
    }
  } else if(declaredType==='image/webp'&&bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
    const u24=(at:number)=>bytes[at]+(bytes[at+1]<<8)+(bytes[at+2]<<16);
    for(let at=12;at+8<=bytes.length;){
      const chunk=ascii(at,4),length=view.getUint32(at+4,true),data=at+8;if(length>bytes.length-data)invalid();
      if(chunk==='ANIM'||chunk==='ANMF')throw new Error('Choose a still photo rather than an animated WebP.');
      if(chunk==='VP8X'&&length>=10){if(bytes[data]&2)throw new Error('Choose a still photo rather than an animated WebP.');dimensions.push({width:1+u24(data+4),height:1+u24(data+7)});}
      if(chunk==='VP8 '&&length>=10&&bytes[data+3]===0x9d&&bytes[data+4]===1&&bytes[data+5]===0x2a)dimensions.push({width:view.getUint16(data+6,true)&0x3fff,height:view.getUint16(data+8,true)&0x3fff});
      if(chunk==='VP8L'&&length>=5&&bytes[data]===0x2f){const bits=view.getUint32(data+1,true);dimensions.push({width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1});}
      at=data+length+(length%2);
    }
  }
  if(!dimensions.length)invalid();
  for(const dimension of dimensions){if(dimension.width>16384||dimension.height>16384)throw new Error('This photo is too large. Choose a photo under 40 megapixels and 16,384 pixels per side.');profileCropRect(dimension.width,dimension.height,DEFAULT_PHOTO_CROP);}
  return dimensions[0];
}
