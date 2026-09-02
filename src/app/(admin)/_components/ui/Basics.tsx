import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function PageHeader({ kicker, title, description, actions }: { kicker?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="adm-page-head">
      <div>
        {kicker && <div className="adm-kicker">{kicker}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="adm-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, actions, children, className, labelledBy }: { title?: string; description?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; labelledBy?: string }) {
  const id = labelledBy ?? (title ? `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  return (
    <section className={["adm-card", className].filter(Boolean).join(" ")} aria-labelledby={id}>
      {(title || actions) && (
        <div className="adm-card-head">
          <div>
            {title && <h2 id={id}>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="adm-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function CardLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={["adm-card adm-card-link", className].filter(Boolean).join(" ")}>
      {children}
    </Link>
  );
}

export function Badge({ tone = "info", children }: { tone?: "info" | "muted" | "ok" | "warn" | "danger"; children: ReactNode }) {
  return <span className={`adm-badge${tone === "info" ? "" : ` adm-badge-${tone}`}`}>{children}</span>;
}

export function Alert({ kind, children, live = true }: { kind: "error" | "success" | "info" | "warn"; children: ReactNode; live?: boolean }) {
  const icon: IconName = kind === "error" ? "alert" : kind === "success" ? "check" : kind === "warn" ? "alert" : "info";
  return (
    <div className={`adm-alert adm-alert-${kind}`} role={kind === "error" ? "alert" : "status"} aria-live={live ? (kind === "error" ? "assertive" : "polite") : undefined}>
      <Icon name={icon} size={18} />
      <div>{typeof children === "string" ? <p>{children}</p> : children}</div>
    </div>
  );
}

export function Skeleton({ width = "100%", height = 16, className, style }: { width?: string | number; height?: string | number; className?: string; style?: React.CSSProperties }) {
  // Pixel widths are capped at the container so skeletons never overflow
  // narrow viewports.
  const inlineSize = typeof width === "number" ? `min(${width}px, 100%)` : width;
  return <span className={["adm-skel", className].filter(Boolean).join(" ")} style={{ inlineSize, blockSize: height, ...style }} aria-hidden="true" />;
}

export function EmptyState({ icon = "inbox", title, body, action }: { icon?: IconName; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="adm-state">
      <Icon name={icon} size={36} />
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && <div className="adm-actions">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", body, action }: { title?: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="adm-state adm-state-error" role="alert">
      <Icon name="alert" size={36} />
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && <div className="adm-actions">{action}</div>}
    </div>
  );
}
