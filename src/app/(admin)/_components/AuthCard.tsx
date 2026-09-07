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
      {/* main, so the auth pages carry the one landmark the shell already has. */}
      <main className="adm-auth-card" aria-labelledby="adm-auth-title">
        <div className="adm-auth-brand">
          <img src="/develmo-logo.png" alt="DevelMo" />
          <span>Admin console</span>
        </div>
        <h1 id="adm-auth-title">{title}</h1>
        {lead && <p className="adm-lead">{lead}</p>}
        {children}
      </main>
    </div>
  );
}
