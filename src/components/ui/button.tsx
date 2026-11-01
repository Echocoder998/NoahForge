import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";

const button = cva(
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-cyan text-ink hover:brightness-110",
        secondary: "border border-line bg-panel text-paper hover:bg-raised",
        ghost: "text-dust hover:bg-raised hover:text-paper",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={clsx(button({ variant }), className)} {...props} />
  );
});
