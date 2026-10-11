export const garmentCategories = [
  "Hats",
  "Bags",
  "Shirts",
  "Polos",
  "Pants",
  "Shorts",
  "Jackets",
  "Shoes",
] as const;
export type FashionSample = {
  id: string;
  title: string;
  category: string;
  image: string;
  kind: "shell" | "fabric";
  description: string;
};
const names: Record<string, string[]> = {
  Hats: ["Six-panel cap", "Bucket hat"],
  Bags: ["Tote bag", "Duffle bag"],
  Shirts: ["Crew-neck shirt", "Long-sleeve shirt"],
  Polos: ["Classic polo", "Long-sleeve polo"],
  Pants: ["Straight-leg pants", "Tapered pants"],
  Shorts: ["Tailored shorts", "Performance shorts"],
  Jackets: ["Bomber jacket", "Zip-front jacket"],
  Shoes: ["Low-top shoe", "Golf shoe"],
};
export const fashionSamples: FashionSample[] = [
  ...garmentCategories.flatMap((category) =>
    names[category].map((title, i) => ({
      id: `${category.toLowerCase()}-${i}`,
      title,
      category,
      image: `/studio-samples/${category.toLowerCase()}-${i}.svg`,
      kind: "shell" as const,
      description: `Original blank ${title.toLowerCase()} shell. Apply your own colors, fabrics, prints and branding.`,
    })),
  ),
  ...[
    "Linen weave",
    "Cotton twill",
    "Performance knit",
    "Denim",
    "Canvas",
    "Rib knit",
    "Herringbone",
    "Pique",
  ].map((title, i) => ({
    id: `fabric-${i}`,
    title,
    category: "Fabrics",
    image: `/studio-samples/fabric-${i}.svg`,
    kind: "fabric" as const,
    description:
      "Illustrative texture reference. Confirm actual material with a supplier before production.",
  })),
];
export const fashionColors = [
  { name: "Cream", hex: "#efe9db" },
  { name: "Forest", hex: "#244a3a" },
  { name: "Burgundy", hex: "#760d24" },
  { name: "Navy", hex: "#233247" },
  { name: "Clay", hex: "#ae7356" },
  { name: "Black", hex: "#262626" },
  { name: "White", hex: "#fafafa" },
  { name: "Sage", hex: "#9ba78a" },
  { name: "Chocolate", hex: "#594135" },
  { name: "Sky", hex: "#a2c2d2" },
  { name: "Sand", hex: "#c9b69a" },
  { name: "Gold", hex: "#b29760" },
];
export function isVerificationProject(p: Record<string, any>) {
  return (
    p.id === "78c8ba89-4339-4b84-a2c1-975333c500fd" ||
    p.category === "verification"
  );
}
export function founderProjects(
  projects: Record<string, any>[],
  userId: string,
) {
  return projects.filter(
    (p) =>
      !isVerificationProject(p) &&
      !p.is_tutorial &&
      !p.is_sample &&
      !p.contains_tutorial_content &&
      p.status !== "archived" &&
      (p.created_by === userId || p.lead_id === userId),
  );
}
