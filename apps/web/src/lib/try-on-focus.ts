export type TryOnFocus = "upper" | "lower" | "full";

export const TRY_ON_FOCUS_OPTIONS: {
  id: TryOnFocus;
  label: string;
  hint: string;
}[] = [
  { id: "upper", label: "Tops only", hint: "T-shirts, shirts, dresses" },
  { id: "lower", label: "Bottoms only", hint: "Jeans, trousers, skirts" },
  { id: "full", label: "Full outfit", hint: "Mix tops + bottoms" },
];

export function focusShowsUpper(focus: TryOnFocus): boolean {
  return focus === "upper" || focus === "full";
}

export function focusShowsLower(focus: TryOnFocus): boolean {
  return focus === "lower" || focus === "full";
}

/** Which catalog categories match the user's shopping intent. */
export function categoriesForFocus(focus: TryOnFocus): string[] {
  if (focus === "upper") return ["tops", "one_pieces"];
  if (focus === "lower") return ["bottoms"];
  return ["tops", "bottoms", "one_pieces"];
}

export function productMatchesFocus(category: string, focus: TryOnFocus): boolean {
  return categoriesForFocus(focus).includes(category);
}

export function defaultCatalogCategory(focus: TryOnFocus): string {
  if (focus === "upper") return "tops";
  if (focus === "lower") return "bottoms";
  return "all";
}

export function vtoCategoryForProduct(category: string): "tops" | "bottoms" | "one-pieces" {
  if (category === "bottoms") return "bottoms";
  if (category === "one_pieces") return "one-pieces";
  return "tops";
}
