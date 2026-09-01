import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "navy" | "teal" | "ghost" | "ghost-d";

export function Button({
  href,
  variant = "navy",
  lg,
  rect,
  children,
}: {
  href: string;
  variant?: Variant;
  lg?: boolean;
  rect?: boolean;
  children: ReactNode;
}) {
  const cls = [
    "btn",
    `btn-${variant}`,
    lg && "btn-lg",
    rect && "btn-rect",
  ]
    .filter(Boolean)
    .join(" ");

  const external = href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#");
  if (external) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <span className="mk" />
      DevelMo
    </span>
  );
}
