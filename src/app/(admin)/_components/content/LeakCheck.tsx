"use client";

import { useState } from "react";
import type { LeakResult } from "@/lib/i18n/leak";
import { DECORATIVE_ENGLISH } from "@/lib/i18n/keys";
import { localeLabels } from "@/lib/i18n";
import { apiPost, describeError } from "../api-client";
import { Alert, Badge, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { TableFrame } from "../ui/TableFrame";
import { useToast } from "../ui/Toast";

const LOCALES = ["ar", "ur", "fr", "es"] as const;

// The locale leak check as a button (brief §3.9), replacing the manual
// HANDOFF §10 step 3.
export function LeakCheck({ routes, csrf }: { routes: string[]; csrf: string }) {
  const toast = useToast();
  const [chosen, setChosen] = useState<string[]>(["ar", "fr"]);
  const [results, setResults] = useState<LeakResult[] | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    const res = await apiPost<{ results: LeakResult[] }>("/api/admin/translations/leak-check", { routes, locales: chosen }, csrf);
    setPending(false);
    if (res.data.ok) {
      setResults(res.data.results);
      const leaks = res.data.results.reduce((n, r) => n + r.leaks.length, 0);
      toast(leaks === 0 ? { kind: "success", title: "No residual English", body: `${res.data.results.length} page and locale pairs checked.` } : { kind: "error", title: `${leaks} leaked string${leaks === 1 ? "" : "s"}`, body: "The table below shows where each one appears." });
      return;
    }
    toast({ kind: "error", title: "Check failed", body: describeError(res.status, res.data.error) });
  }

  const totalLeaks = results?.reduce((n, r) => n + r.leaks.length, 0) ?? 0;

  return (
    <Card
      title="Locale leak check"
      description="Fetches each public page in the chosen locales, strips the head and every script block, and reports any English the page still shows."
      actions={<Button size="sm" onClick={run} disabled={pending || chosen.length === 0}>{pending ? "Checking" : "Run check"}</Button>}
    >
      <div className="adm-seo-flags" style={{ marginBlockEnd: 12 }}>
        {LOCALES.map((l) => (
          <label key={l} className="adm-check">
            <input
              type="checkbox"
              checked={chosen.includes(l)}
              onChange={(e) => setChosen((c) => (e.target.checked ? [...c, l] : c.filter((x) => x !== l)))}
              disabled={pending}
            />
            <span>{localeLabels[l]}</span>
          </label>
        ))}
      </div>

      <p className="adm-help">
        The script blocks matter: React serialises component props, key props included, into the payload it streams to the browser, so the English
        source of a correctly translated string is present in the raw HTML of every page. Checking the raw response would report a leak on all of
        them. What is examined here is the text a visitor actually sees.
      </p>
      <p className="adm-help">
        Left out by design: brand and product names, technology names, the postal address, blog and knowledge base titles, excerpts and categories,
        which are content rather than chrome, and the decorative mono labels ({DECORATIVE_ENGLISH.join(", ")}).
      </p>

      {results && (
        <>
          {totalLeaks === 0 ? (
            <Alert kind="success">No residual English across {results.length} page and locale pairs.</Alert>
          ) : (
            <Alert kind="error">{totalLeaks} string{totalLeaks === 1 ? "" : "s"} still render in English.</Alert>
          )}
          <TableFrame>
            <div className="adm-table-wrap">
              <table className="adm-table adm-table-plain">
                <caption className="adm-sr">Leak check results</caption>
                <thead>
                  <tr><th scope="col">Page</th><th scope="col">Locale</th><th scope="col">Document</th><th scope="col">Result</th></tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={`${r.locale}-${r.route}`}>
                      <td data-label="Page"><span className="adm-seo-path">{r.route}</span></td>
                      <td data-label="Locale">{r.locale}</td>
                      <td data-label="Document">
                        <span className="adm-mono">lang={r.lang ?? "none"} dir={r.dir ?? "ltr"}</span>
                        <div className="adm-muted" style={{ fontSize: 13 }}>{r.status === 200 ? `${r.examined.toLocaleString("en-GB")} characters examined` : `answered ${r.status}`}</div>
                      </td>
                      <td data-label="Result">
                        {r.leaks.length === 0 ? (
                          <Badge tone="ok">clean</Badge>
                        ) : (
                          <>
                            <Badge tone="danger">{r.leaks.length} leaked</Badge>
                            <ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
                              {r.leaks.map((l) => (
                                <li key={l.key}>
                                  <strong>{l.key}</strong>
                                  <div className="adm-finding-detail">{l.context}</div>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableFrame>
        </>
      )}
    </Card>
  );
}
