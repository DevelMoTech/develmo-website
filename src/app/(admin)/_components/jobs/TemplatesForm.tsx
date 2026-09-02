"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedChanges } from "../../_lib/useUnsavedChanges";
import { apiPost, describeError } from "../api-client";
import { Alert, Card } from "../ui/Basics";
import { Button } from "../ui/Button";
import { Input, Textarea } from "../ui/Field";
import { useToast } from "../ui/Toast";

type Template = { subject: string; body: string };
type Templates = { application_ack: Template; application_rejection: Template };

export function TemplatesForm({ csrf, initial, canWrite }: { csrf: string; initial: Templates; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(value) !== saved;
  useUnsavedChanges(dirty && canWrite);

  function set(key: keyof Templates, field: keyof Template, v: string) {
    setValue((cur) => ({ ...cur, [key]: { ...cur[key], [field]: v } }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setIssues({});
    const res = await apiPost("/api/admin/jobs/templates", value, csrf);
    setPending(false);
    if (res.data.ok) {
      setSaved(JSON.stringify(value));
      toast({ kind: "success", title: "Templates saved" });
      router.refresh();
    } else {
      const raw = res.data as { issues?: { path: string; message: string }[] };
      if (raw.issues?.length) setIssues(Object.fromEntries(raw.issues.map((i) => [i.path, i.message])));
      toast({ kind: "error", title: "Not saved", body: describeError(res.status, res.data.error) });
    }
  }

  const disabled = !canWrite || pending;
  return (
    <form className="adm-stack" onSubmit={save} noValidate>
      <Alert kind="info" live={false}>Placeholders: {"{{first_name}}"}, {"{{name}}"}, {"{{job}}"}, {"{{company}}"}. Emails are plain text.</Alert>
      <Card title="Acknowledgement" description="Sent automatically the moment an application is submitted.">
        <div className="adm-form">
          <Input id="ack-subject" label="Subject" value={value.application_ack.subject} onChange={(e) => set("application_ack", "subject", e.target.value)} maxLength={200} error={issues["application_ack.subject"]} disabled={disabled} />
          <Textarea id="ack-body" label="Message" rows={9} value={value.application_ack.body} onChange={(e) => set("application_ack", "body", e.target.value)} maxLength={10_000} error={issues["application_ack.body"]} disabled={disabled} />
        </div>
      </Card>
      <Card title="Rejection" description="The starting text when staff send a rejection from an application; editable before each send.">
        <div className="adm-form">
          <Input id="rej-subject" label="Subject" value={value.application_rejection.subject} onChange={(e) => set("application_rejection", "subject", e.target.value)} maxLength={200} error={issues["application_rejection.subject"]} disabled={disabled} />
          <Textarea id="rej-body" label="Message" rows={9} value={value.application_rejection.body} onChange={(e) => set("application_rejection", "body", e.target.value)} maxLength={10_000} error={issues["application_rejection.body"]} disabled={disabled} />
        </div>
      </Card>
      {canWrite && (
        <div className="adm-actions">
          <Button type="submit" disabled={disabled || !dirty}>{pending ? "Saving" : "Save templates"}</Button>
          {dirty && <span className="adm-help">Unsaved changes.</span>}
        </div>
      )}
    </form>
  );
}
