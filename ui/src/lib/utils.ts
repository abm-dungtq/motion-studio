// From shadcn/ui (https://github.com/shadcn-ui/ui, MIT): the `cn` helper the CLI generates.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
