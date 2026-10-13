export const garmentCategories = [
  "Polos",
  "Pants",
  "Shorts",
  "Skorts",
  "Layers",
  "Outerwear",
  "Headwear",
  "Golf bags",
  "Accessories",
  "Footwear",
  "Clubhouse",
] as const;
export type FashionSample = {
  id: string;
  title: string;
  category: string;
  image: string;
  kind: "shell" | "fabric" | "real";
  description: string;
  view?: "front" | "back" | "detail";
};
const golfProducts = [
  { id: "performance-polo", title: "Performance golf polo", category: "Polos" },
  { id: "long-sleeve-polo", title: "Long-sleeve golf polo", category: "Polos" },
  { id: "golf-pants", title: "Tapered golf pants", category: "Pants" },
  { id: "golf-shorts", title: "Tailored golf shorts", category: "Shorts" },
  { id: "golf-skort", title: "Pleated golf skort", category: "Skorts" },
  { id: "quarter-zip", title: "Golf quarter-zip", category: "Layers" },
  { id: "golf-vest", title: "Golf layering vest", category: "Layers" },
  { id: "golf-wind-jacket", title: "Golf wind jacket", category: "Outerwear" },
  { id: "golf-rain-jacket", title: "Golf rain jacket", category: "Outerwear" },
  { id: "golf-cap", title: "Six-panel golf cap", category: "Headwear" },
  { id: "golf-visor", title: "Golf visor", category: "Headwear" },
  { id: "golf-bucket", title: "Golf bucket hat", category: "Headwear" },
  { id: "golf-stand-bag", title: "Golf stand bag", category: "Golf bags" },
  { id: "golf-shoe-bag", title: "Golf shoe bag", category: "Golf bags" },
  { id: "golf-towel", title: "Golf towel", category: "Accessories" },
  { id: "golf-headcover", title: "Driver headcover", category: "Accessories" },
  { id: "golf-shoe", title: "Golf shoe", category: "Footwear" },
  {
    id: "clubhouse-knit-polo",
    title: "Clubhouse knit polo",
    category: "Clubhouse",
  },
  {
    id: "clubhouse-knit",
    title: "Clubhouse crew-neck knit",
    category: "Clubhouse",
  },
  {
    id: "clubhouse-overshirt",
    title: "Clubhouse overshirt",
    category: "Clubhouse",
  },
];
export const fashionSamples: FashionSample[] = [
  ...[
    {id:"real-golf-bag",title:"Realistic golf bag",category:"Golf bags",asset:"golf-bag-cream"},
    {id:"real-cream-polo",title:"Realistic cream polo",category:"Polos",asset:"cream-polo"},
    {id:"real-blue-polo",title:"Realistic royal blue polo",category:"Polos",asset:"royal-blue-polo"},
    {id:"real-cream-cap",title:"Realistic cream cap",category:"Headwear",asset:"cream-cap"},
    {id:"real-blue-cap",title:"Realistic royal blue cap",category:"Headwear",asset:"royal-blue-cap"},
    {id:"real-knit",title:"Realistic clubhouse knit",category:"Clubhouse",asset:"cream-knit"},
  ].map(s=>({...s,image:`/mockup-assets/${s.asset}.png`,kind:"real" as const,view:"front" as const,description:"Editable realistic exploratory sample. Existing CF marks are exploratory, not approved Hunter & Heckard branding. Generate a matching blank shell from this exact sample on your board."})),

  ...golfProducts.flatMap((product) =>
    (["front", "back", "detail"] as const).map((view) => ({
      id: `${product.id}-${view}`,
      title: `${product.title} · ${view}`,
      category: product.category,
      image: `/studio-samples/golf/${product.id}-${view}.svg`,
      kind: "shell" as const,
      view,
      description: `Original blank golf collection shell: ${product.title}, ${view} view. Use for our own design development, fabrics, colors and approved branding. Construction is illustrative, not a production specification.`,
    })),
  ),
  ...[
    "Performance pique",
    "Smooth performance jersey",
    "Four-way stretch reference",
    "Breathable mesh",
    "Lightweight wind weave",
    "Rain-shell fabric reference",
    "Stretch chino twill",
    "Cotton blend reference",
    "Rib-knit trim",
    "Towel microfiber reference",
  ].map((title, i) => ({
    id: `golf-fabric-${i}`,
    title,
    category: "Fabrics",
    image: `/studio-samples/golf/fabric-${i}.svg`,
    kind: "fabric" as const,
    description:
      "Illustrative golf fabric reference. Performance, stretch, waterproofing, UV protection and supplier specifications require verification before production.",
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
