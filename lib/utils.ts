import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function for conditionally merging Tailwind CSS classes
 * Uses clsx to handle conditional classes and tailwind-merge to dedupe
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
