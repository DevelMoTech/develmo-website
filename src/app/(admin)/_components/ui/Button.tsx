import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "ghost" | "danger";
type Size = "md" | "sm";

function classes(variant: Variant, size: Size, block?: boolean, extra?: string) {
  return ["adm-btn", `adm-btn-${variant}`, size === "sm" && "adm-btn-sm", block && "adm-btn-block", extra].filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  block,
  className,
  type = "button",
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; block?: boolean }) {
  return <button type={type} className={classes(variant, size, block, className)} {...rest} />;
}

export function ButtonLink({
  variant = "ghost",
  size = "md",
  block,
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; block?: boolean }) {
  return <Link className={classes(variant, size, block, className)} {...rest} />;
}
