"use client";

import { useState } from "react";
import { DIGEST_MODES, type DigestMode } from "@/lib/schemas/submission";
import { apiPost, describeError } from "../api-client";
import { Select } from "../ui/Field";
import { useToast } from "../ui/Toast";

const LABELS: Record<DigestMode, string> = { off: "Off", instant: "Instant, one email per submission", daily: "Daily summary" };

// Per-user submission digest preference (brief §3.5).
export function DigestForm({ csrf, initial }: { csrf: string; initial: string }) {
  const toast = useToast();
  const [value, setValue] = useState<DigestMode>((DIGEST_MODES as readonly string[]).includes(initial) ? (initial as DigestMode) : "off");
  const [pending, setPending] = useState(false);

  async function change(next: DigestMode) {
    const previous = value;
    setValue(next);
    setPending(true);
    const res = await apiPost("/api/admin/account/digest", { digest: next }, csrf);
    setPending(false);
    if (res.data.ok) toast({ kind: "success", title: `Digest: ${LABELS[next]}`, body: next === "off" ? undefined : "Sent through the configured email provider. Without one (SMTP or RESEND_API_KEY) the send is only logged." });
    else {
      setValue(previous);
      toast({ kind: "error", title: "Preference not saved", body: describeError(res.status, res.data.error) });
    }
  }

  return (
    <div className="adm-form">
      <Select id="digest" label="Email me about new submissions" options={DIGEST_MODES.map((m) => ({ value: m, label: LABELS[m] }))} value={value} onChange={(e) => change(e.target.value as DigestMode)} disabled={pending} help="Applies to contact enquiries and applications you are allowed to see." />
    </div>
  );
}
