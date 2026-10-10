import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-[1.1em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-magenta text-ink hover:bg-magenta-soft active:bg-magenta-deep active:text-paper",
        outline: "border border-line-strong text-paper hover:border-magenta hover:text-magenta-soft",
        ghost: "text-mute hover:text-paper",
      },
      size: {
        default: "h-11 rounded-full px-5 text-[0.95rem]",
        lg: "h-13 rounded-full px-7 py-3.5 text-base",
        sm: "h-9 rounded-full px-3.5 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : (type ?? "button")}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
