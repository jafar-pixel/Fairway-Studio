import { inferMediaType, validateMediaSize } from "../media";
export class MediaError extends Error {
  constructor(public code: string, message: string, public status = 422, public retryable = false) { super(message); }
}
/** A bounded signature gate, not a replacement for the worker's complete native decode. */
export function detectSignature(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes), ascii = (a: number, z: number) => b.toString("ascii", a, z);
  if (b.length < 12) return null;
  if (b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (["GIF87a","GIF89a"].includes(ascii(0,6))) return "image/gif";
  if (ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP") return "image/webp";
  if (b.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))) return "video/x-matroska";
  if (ascii(0,3) === "ID3" || (b[0] === 255 && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) return "audio/mpeg";
  // Only inspect brands inside the declared ftyp atom. Arbitrary occurrences cannot masquerade as a brand.
  if (ascii(4,8) === "ftyp") {
    const size = b.readUInt32BE(0);
    if (size < 16 || size > 4096 || size > b.length || size % 4) return null;
    const brands = [ascii(8,12)]; for (let i=16;i<size;i+=4) brands.push(ascii(i,i+4));
    if (brands.some(x => ["avif","avis"].includes(x))) return "image/avif";
    if (brands.some(x => ["heic","heix","hevc","hevx"].includes(x))) return "image/heic";
    if (brands.some(x => ["mif1","msf1"].includes(x))) return "image/heif";
    if (brands.includes("qt  ")) return "video/quicktime";
    if (brands.some(x => /^(isom|iso[2-9]|mp4[12]|M4V |avc1)$/.test(x))) return "video/mp4";
  }
  // Legacy QuickTime may start with a bounded wide/free atom. Native probe still must validate it.
  if (["wide","free","mdat"].includes(ascii(4,8))) return "video/quicktime";
  return null;
}
export function validateHeader(name: string, supplied: string, size: number, bytes: Uint8Array) {
  if (!validateMediaSize(size)) throw new MediaError("INVALID_SIZE", "Choose a nonempty file up to 100 MB (100,000,000 bytes).");
  const type = inferMediaType(name, supplied), detected = detectSignature(bytes);
  const heifPair = type?.startsWith("image/hei") && detected?.startsWith("image/hei");
  if (!type || (!heifPair && type !== detected)) throw new MediaError("INVALID_MEDIA", "The file contents do not match a supported media format.");
  return type;
}
export function safeMediaFailure(error: unknown) {
  if (error instanceof SyntaxError) return {code:"INVALID_REQUEST",message:"The request is not valid JSON.",status:400,retryable:false};
  if (error instanceof MediaError) return {code:error.code, message:error.message, status:error.status, retryable:error.retryable};
  return {code:"PROCESSING_FAILED", message:"The preview could not be prepared. Your original is preserved.", status:503, retryable:true};
}
