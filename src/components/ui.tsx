import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "navy" | "teal" | "ghost" | "ghost-d";

export function Button({
  href,
  variant = "navy",
  lg,
  rect,
  download,
  children,
}: {
  href: string;
  variant?: Variant;
  lg?: boolean;
  rect?: boolean;
  // A file to save rather than a page to open, and the name to save it under.
  // It renders a plain anchor: the router has no business prefetching a file
  // or intercepting the click that downloads it.
  download?: string;
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

  if (download !== undefined) {
    return (
      <a href={href} className={cls} download={download}>
        {children}
      </a>
    );
  }

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
