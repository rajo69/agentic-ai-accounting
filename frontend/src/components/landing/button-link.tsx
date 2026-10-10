import type { AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonProps } from "@/components/ui/button";

/**
 * A link styled as `ui/button`. Plain anchors keep link semantics (Base UI's Button would add
 * button semantics to an `<a>`). Internal paths use `next/link`; the Xero connect URL is an
 * absolute URL on the API origin, so it stays a plain anchor.
 */
export function ButtonLink({
  href,
  variant = "default",
  size = "default",
  external = false,
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  external?: boolean;
  children: ReactNode;
}) {
  const cls = cn(buttonVariants({ variant, size }), className);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls} {...props}>
        {children}
      </a>
    );
  }
  if (href.startsWith("/")) {
    // No viewport prefetch: `/demo` is created in S3, and the other internal links are one hop away.
    return (
      <Link href={href} prefetch={false} className={cls} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} {...props}>
      {children}
    </a>
  );
}
