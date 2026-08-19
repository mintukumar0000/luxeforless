export interface SizeProfile {
  upper: string;
  lower: string;
}

export const UPPER_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "Free Size"] as const;
export const LOWER_SIZES = ["28", "30", "32", "34", "36", "38", "40", "Free Size"] as const;

export type UpperSize = (typeof UPPER_SIZES)[number];
export type LowerSize = (typeof LOWER_SIZES)[number];

export const DEFAULT_SIZE_PROFILE: SizeProfile = {
  upper: "M",
  lower: "32",
};

export function declaredSizeForCategory(
  profile: SizeProfile,
  category: string
): string {
  if (category === "bottoms") return profile.lower;
  return profile.upper;
}
