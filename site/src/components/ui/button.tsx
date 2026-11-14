import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium tracking-tight transition disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:bg-ink/90",
        clay: "bg-clay text-paper hover:bg-clay/90",
        ghost: "bg-transparent text-ink hover:bg-ink/5",
        line: "border border-line bg-paper text-ink hover:bg-ink/5",
      },
      size: {
        default: "h-11",
        lg: "h-12 px-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
