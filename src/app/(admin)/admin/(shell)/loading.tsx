import { Skeleton } from "@/app/(admin)/_components/ui/Basics";

// Shown by the App Router while a console page's data loads. Skeletons, not
// spinners (brief §6.4).
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="adm-sr">Loading</span>
      <div className="adm-page-head">
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton width={90} height={12} />
          <Skeleton width={260} height={28} />
          <Skeleton width={360} height={14} />
        </div>
      </div>
      <div className="adm-grid">
        {[0, 1, 2].map((i) => (
          <div className="adm-card" key={i} style={{ display: "grid", gap: 12 }}>
            <Skeleton width={120} height={14} />
            <Skeleton width={80} height={34} />
            <Skeleton width="100%" height={40} />
          </div>
        ))}
      </div>
      <div className="adm-card" style={{ marginBlockStart: 18, display: "grid", gap: 12 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width="100%" height={18} />
        ))}
      </div>
    </div>
  );
}
