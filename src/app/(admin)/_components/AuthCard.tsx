export function AuthCard({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="adm-auth">
      <section className="adm-auth-card" aria-labelledby="adm-auth-title">
        <div className="adm-auth-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/develmo-logo.png" alt="DevelMo" />
          <span>Admin console</span>
        </div>
        <h1 id="adm-auth-title">{title}</h1>
        {lead && <p className="adm-lead">{lead}</p>}
        {children}
      </section>
    </div>
  );
}
