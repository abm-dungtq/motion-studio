// Native form controls styled with the tokens: Button (default, primary, ghost, icon), Input,
// Textarea, Checkbox. The only controls besides the shadcn set (Tabs, Dialog, DropdownMenu,
// Tooltip, Resizable, ScrollArea, Select, Slider, Sonner).
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "primary" | "ghost" | "icon";

const BUTTON: Record<ButtonVariant, string> = {
  default: "h-8 px-3 border border-border bg-panel-2 text-foreground hover:bg-accent",
  primary: "h-8 px-3 border border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
  ghost: "h-8 px-2 border border-transparent bg-transparent text-foreground hover:bg-panel-2",
  icon: "size-8 justify-center border border-transparent bg-transparent text-muted-foreground hover:bg-panel-2 hover:text-foreground",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "default", className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        BUTTON[variant],
        className,
      )}
      {...props}
    />
  );
});

const FIELD = "w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, type = "text", ...props }, ref) {
  return <input ref={ref} type={type} className={cn(FIELD, "h-8", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(FIELD, "min-h-16 py-1.5", className)} {...props} />;
});

export const Checkbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(function Checkbox({ className, ...props }, ref) {
  return <input ref={ref} type="checkbox" className={cn("size-4 accent-primary", className)} {...props} />;
});
