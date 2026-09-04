"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DeadLink } from "@/lib/admin/content";
import type { NavigationInput } from "@/lib/schemas/content";
import { apiPost, describeError } from "../api-client";
import { Alert, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { useToast } from "../ui/Toast";

type ListName = "primary" | "company";

const LIST_LABEL: Record<ListName, { title: string; description: string }> = {
  primary: { title: "Top bar", description: "The links across the header, in order." },
  company: { title: "Company panel", description: "The links inside the Who We Are panel and the mobile menu." },
};

export function NavigationEditor({ initial, routes, csrf, canWrite }: { initial: NavigationInput; routes: string[]; csrf: string; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [nav, setNav] = useState<NavigationInput>(initial);
  const [pending, setPending] = useState(false);
  const [dead, setDead] = useState<DeadLink[]>([]);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(nav) !== JSON.stringify(initial);
  const known = new Set(routes);

  const resolves = (href: string) => /^(https?:\/\/|mailto:)/i.test(href) || known.has(href.split(/[?#]/)[0].replace(/\/+$/, "") || "/");

  function update(list: ListName, index: number, patch: Partial<{ label: string; href: string }>) {
    setNav((n) => ({ ...n, [list]: n[list].map((l, i) => (i === index ? { ...l, ...patch } : l)) }));
    setDead([]);
  }
  function move(list: ListName, index: number, by: number) {
    setNav((n) => {
      const next = [...n[list]];
      const to = index + by;
      if (to < 0 || to >= next.length) return n;
      [next[index], next[to]] = [next[to], next[index]];
      return { ...n, [list]: next };
    });
  }
  function remove(list: ListName, index: number) {
    setNav((n) => ({ ...n, [list]: n[list].filter((_, i) => i !== index) }));
    setDead([]);
  }
  function add(list: ListName) {
    setNav((n) => ({ ...n, [list]: [...n[list], { label: "", href: routes[0] ?? "/" }] }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setDead([]);
    setIssues({});
    const res = await apiPost("/api/admin/content/navigation", nav, csrf);
    setPending(false);
    if (res.data.ok) {
      toast({ kind: "success", title: "Navigation saved", body: "The menu changes on the next request." });
      router.refresh();
      return;
    }
    const raw = res.data as { dead?: DeadLink[]; issues?: { path: string; message: string }[] };
    if (raw.dead?.length) {
      setDead(raw.dead);
      toast({ kind: "error", title: "Not saved: dead links", body: `${raw.dead.length} link${raw.dead.length === 1 ? "" : "s"} point at a route that does not exist.` });
      return;
    }
    if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path, i.message])));
    toast({ kind: "error", title: "Not saved", body: describeError(res.status, res.data.error) });
  }

  return (
    <form onSubmit={save} noValidate>
      {dead.length > 0 && (
        <Alert kind="error">
          The menu was refused because these links do not resolve to a page:
          <ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
            {dead.map((d) => (
              <li key={`${d.list}-${d.index}`}>
                {LIST_LABEL[d.list].title}, position {d.index + 1}: <span className="adm-mono">{d.href}</span>{d.label ? ` (${d.label})` : ""}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {(["primary", "company"] as ListName[]).map((list) => (
        <Card key={list} title={LIST_LABEL[list].title} description={LIST_LABEL[list].description}>
          {nav[list].map((link, index) => {
            const bad = !link.href || !resolves(link.href);
            return (
              <div className="adm-form-row" key={`${list}-${index}`} style={{ alignItems: "start" }}>
                <Input id={`${list}-${index}-label`} label="Label" value={link.label} onChange={(e) => update(list, index, { label: e.target.value })} disabled={!canWrite || pending} error={issues[`${list}.${index}.label`]} />
                <div className="adm-field">
                  <label className="adm-label" htmlFor={`${list}-${index}-href`}>Link</label>
                  <input
                    id={`${list}-${index}-href`}
                    className="adm-input"
                    list="nav-routes"
                    value={link.href}
                    onChange={(e) => update(list, index, { href: e.target.value })}
                    disabled={!canWrite || pending}
                    aria-invalid={bad ? "true" : undefined}
                  />
                  {bad ? <p className="adm-error">No page answers this path. Saving is refused until it does.</p> : <p className="adm-help">Resolves.</p>}
                </div>
                {canWrite && (
                  <div className="adm-actions">
                    <Button type="button" size="sm" variant="ghost" disabled={pending || index === 0} onClick={() => move(list, index, -1)} aria-label={`Move ${link.label || "link"} up`}>Up</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={pending || index === nav[list].length - 1} onClick={() => move(list, index, 1)} aria-label={`Move ${link.label || "link"} down`}>Down</Button>
                    <Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => remove(list, index)} aria-label={`Remove ${link.label || "link"}`}>Remove</Button>
                  </div>
                )}
              </div>
            );
          })}
          {canWrite && (
            <div className="adm-actions">
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => add(list)}>Add a link</Button>
            </div>
          )}
        </Card>
      ))}

      <datalist id="nav-routes">
        {routes.map((r) => <option key={r} value={r} />)}
      </datalist>

      <Alert kind="info" live={false}>
        The service, industry and product groups inside the mega menu come from the content editors, so renaming or reordering a service changes the
        menu with it. This page owns the top bar and the company panel.
      </Alert>

      {canWrite && (
        <div className="adm-actions">
          <Button type="submit" size="sm" disabled={pending || !dirty}>{pending ? "Saving" : "Save navigation"}</Button>
        </div>
      )}
    </form>
  );
}
