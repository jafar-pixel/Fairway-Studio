/** Turns an idea into its starter Team board: the photo, a brief, a spec sheet of what's known and
 * what's missing, and the colours actually in the photo. Pure helpers plus one browser-only extractor. */
type Row = Record<string, any>;
export type SeedItem = { kind: "note" | "swatch" | "image"; title: string; body?: string; color?: string; image_url?: string; x: number; y: number; width: number; height: number };

export function ideaImage(idea: Row | undefined): string {
  return String(idea?.cover_url || idea?.image_url || idea?.preview_url || idea?.provenance?.image_url || "");
}

/** Boards store https links only. Same-origin paths become absolute on an https site; anything else is dropped. */
export function storableImage(url: string, origin: string): string | null {
  if (/^https:\/\//i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//") && /^https:\/\//i.test(origin)) return `${origin}${url}`;
  return null;
}

const SPEC_BASE = ["Materials / fabric", "Stitch pattern", "Hardware & trims", "Construction details", "Dimensions"];
/** Spec fields worth asking about for this kind of product. */
export function specFields(idea: Row | undefined): string[] {
  const text = `${idea?.title || ""} ${idea?.category || ""} ${(idea?.tags || []).join(" ")}`.toLowerCase();
  const extra: string[] = [];
  if (/bag|case|pouch/.test(text)) extra.push("Pockets & compartments", "Straps & carry system");
  if (/polo|shirt|apparel|jacket|pant|short|wear/.test(text)) extra.push("Fit", "Sizing range", "Trims & labels");
  if (/connected|smart|tech|sensor|gps/.test(text)) extra.push("Technology / electronics");
  if (/shoe|footwear|spike/.test(text)) extra.push("Sole & traction", "Upper material");
  return [...SPEC_BASE, ...extra];
}

/** Values the idea already states, matched by field name in "Field: value" lines of the idea's text. */
export function knownSpecs(idea: Row | undefined, fields: string[]): Record<string, string> {
  const known: Record<string, string> = {};
  const lines = String(idea?.body || "").split(/\r?\n/);
  for (const field of fields) {
    const key = field.split(/[ /&]/)[0].toLowerCase();
    const line = lines.find((l) => l.toLowerCase().startsWith(key) && l.includes(":"));
    if (line) known[field] = line.slice(line.indexOf(":") + 1).trim();
  }
  return known;
}

export function colourName(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d < 0.08) return l > 0.85 ? "Off-white" : l < 0.18 ? "Near black" : l > 0.55 ? "Light grey" : "Charcoal";
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const s = d / (1 - Math.abs(2 * l - 1));
  const tone = l < 0.25 ? "Deep " : l > 0.7 ? "Light " : "";
  if (h < 15 || h >= 345) return `${tone}${s < 0.45 ? "Oxblood" : "Red"}`.trim();
  if (h < 40) return l > 0.78 ? "Cream" : l < 0.2 ? "Espresso" : s > 0.6 ? "Cognac" : l < 0.4 ? "Brown" : s < 0.5 ? "Tan" : "Caramel";
  if (h < 55) return l > 0.55 ? "Sand" : "Gold";
  if (h < 75) return l < 0.4 ? "Olive" : "Khaki";
  if (h < 160) return `${tone}${s < 0.35 ? "Sage" : "Green"}`.trim();
  if (h < 200) return `${tone}Teal`.trim();
  if (h < 255) return `${tone}${s < 0.35 ? "Slate" : "Blue"}`.trim();
  if (h < 300) return `${tone}Purple`.trim();
  return `${tone}Burgundy`.trim();
}

/** Most common distinct colours in RGBA pixel data. Pure, so it is testable without a browser. */
export function dominantColours(pixels: ArrayLike<number>, max = 5): string[] {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 200) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b;
    counts.set(key, bucket);
  }
  const picked: number[][] = [];
  for (const bucket of [...counts.values()].sort((a, z) => z.n - a.n)) {
    const colour = [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n];
    if (picked.every((p) => Math.hypot(p[0] - colour[0], p[1] - colour[1], p[2] - colour[2]) > 48)) picked.push(colour);
    if (picked.length >= max) break;
  }
  return picked.map((c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase());
}

/** Browser only: sample the centre of the photo (where the product usually sits, not the background)
 * and return its main colours, or [] if the image can't be read. */
export async function extractPalette(src: string, max = 5): Promise<string[]> {
  if (!src || typeof document === "undefined") return [];
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 72; canvas.height = 72;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    const w = img.naturalWidth, h = img.naturalHeight;
    ctx.drawImage(img, w * 0.32, h * 0.15, w * 0.36, h * 0.75, 0, 0, 72, 72);
    return dominantColours(ctx.getImageData(0, 0, 72, 72).data, max);
  } catch { return []; }
}

export function seedItems(idea: Row | undefined, palette: string[], image: string | null): SeedItem[] {
  const items: SeedItem[] = [];
  const fields = specFields(idea), known = knownSpecs(idea, fields);
  const tags = (idea?.tags || []).filter((t: string) => !String(t).startsWith("mockup-idea:"));
  // Laid out to fit the first screen of the board: photo + brief, then spec sheet + colours.
  if (image) items.push({ kind: "image", title: idea?.title || "Concept image", image_url: image, x: 40, y: 40, width: 360, height: 280 });
  items.push({
    kind: "note", title: "Brief", x: image ? 420 : 40, y: 40, width: 300, height: 280,
    body: [idea?.body || "Describe what this should feel like.", "", idea?.category && `Category: ${idea.category}`, idea?.status && `Status: ${idea.status}`, tags.length ? `Tags: ${tags.join(", ")}` : "Tags: none yet"].filter((l) => l !== undefined && l !== false).join("\n").trim(),
  });
  const missing = fields.filter((f) => !known[f]);
  items.push({
    kind: "note", title: missing.length ? `Spec sheet · ${missing.length} missing` : "Spec sheet", x: 40, y: 350, width: 360, height: 300,
    body: [
      ...fields.map((f) => (known[f] ? `✓ ${f}: ${known[f]}` : `☐ ${f}: missing`)),
      palette.length ? `✓ Colourways: ${palette.length} pulled from the photo` : "☐ Colourways: missing",
    ].join("\n"),
  });
  palette.forEach((color, i) => items.push({ kind: "swatch", title: colourName(color), body: "From the idea photo", color, x: 420 + (i % 2) * 155, y: 350 + Math.floor(i / 2) * 135, width: 145, height: 120 }));
  return items;
}
