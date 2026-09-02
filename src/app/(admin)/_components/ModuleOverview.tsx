import type { ReactNode } from "react";
import { Card, EmptyState, PageHeader } from "./ui/Basics";
import type { IconName } from "./ui/Icon";

export type Stat = { label: string; value: string | number; hint?: string };

// Landing page for a module whose editing tools land in a later phase. Shows
// only real numbers from the database and an honest empty state; it never
// renders a control that does nothing.
export function ModuleOverview({
  kicker,
  title,
  description,
  icon,
  stats,
  empty,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  icon: IconName;
  stats: Stat[];
  empty?: { title: string; body: ReactNode; action?: ReactNode };
  children?: ReactNode;
}) {
  const hasData = stats.some((s) => typeof s.value === "number" && s.value > 0);
  return (
    <>
      <PageHeader kicker={kicker} title={title} description={description} />
      <div className="adm-grid adm-grid-tight">
        {stats.map((s) => (
          <Card key={s.label}>
            <div className="adm-tile">
              <div className="adm-tile-top">{s.label}</div>
              <div className="adm-tile-value">{s.value}</div>
              {s.hint && <div className="adm-tile-sub">{s.hint}</div>}
            </div>
          </Card>
        ))}
      </div>
      {!hasData && empty && (
        <div className="adm-card" style={{ marginBlockStart: 18 }}>
          <EmptyState icon={icon} title={empty.title} body={empty.body} action={empty.action} />
        </div>
      )}
      {children}
    </>
  );
}
