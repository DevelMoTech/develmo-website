"use client";

import { useState } from "react";
import type { EmailDeliveryStatus, NoticeOutcome } from "@/lib/notify";
import { useSubmit } from "./api-client";
import { Alert, Badge, Card } from "./ui/Basics";
import { Button } from "./ui/Button";
import { Input } from "./ui/Field";

// Email delivery, as it actually is. Which channels the environment provides,
// who is told about access requests, and a button that sends a real message
// and reports what happened. Nothing on this page claims delivery works
// without having tried.
export function EmailSettings({ csrf, notifyEmail, status, canWrite }: { csrf: string; notifyEmail: string; status: EmailDeliveryStatus; canWrite: boolean }) {
  const save = useSubmit();
  const test = useSubmit();
  const [email, setEmail] = useState(notifyEmail);
  const [saved, setSaved] = useState(notifyEmail);
  const [result, setResult] = useState<{ to: string; outcome: NoticeOutcome } | null>(null);

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await save.run("/api/admin/settings/email", { notifyEmail: email }, csrf);
    if (res?.data.ok) setSaved(email.trim().toLowerCase());
  }

  async function onTest() {
    setResult(null);
    const res = await test.run<{ to: string; outcome: NoticeOutcome }>("/api/admin/settings/email/test", {}, csrf);
    if (res?.data.ok) setResult({ to: res.data.to, outcome: res.data.outcome });
  }

  const anyChannel = status.resend.configured || status.smtp.configured || status.webhook.configured || !status.formsubmit.overridden;

  return (
    <div className="adm-grid" style={{ marginBlockStart: 18 }}>
      <Card title="Delivery channels" description="Tried in this order until one accepts the message. Set in the environment, not here.">
        <dl className="adm-dl">
          <dt>Resend</dt>
          <dd>
            <Badge tone={status.resend.configured ? "ok" : "warn"}>{status.resend.configured ? "configured" : "no API key"}</Badge>
            <div className="adm-help">
              From <code>{status.resend.from}</code>.
              {status.resend.fromIsShared && " That is Resend's shared onboarding address, which only delivers to the Resend account owner. Production needs CONTACT_FROM on a domain verified in Resend."}
            </div>
          </dd>
          <dt>SMTP</dt>
          <dd>
            <Badge tone={status.smtp.configured ? "ok" : status.smtp.missing.length < 3 ? "warn" : "muted"}>
              {status.smtp.configured ? "configured" : status.smtp.missing.length < 3 ? "incomplete" : "not set"}
            </Badge>
            <div className="adm-help">
              {status.smtp.configured ? (
                <>
                  Through <code>{status.smtp.host}:{status.smtp.port}</code> as <code>{status.smtp.user}</code>, from <code>{status.smtp.from}</code>.
                  {status.smtp.gmail && " Gmail sends as the account itself and reaches any address, so this also carries invitations and applicant emails."}
                </>
              ) : status.smtp.missing.length < 3 ? (
                <>
                  {status.smtp.issue ? <>{status.smtp.issue}. </> : null}
                  {status.smtp.missing.length ? <>Still needed: <code>{status.smtp.missing.join(", ")}</code>.</> : null}
                  {status.smtp.gmail && status.smtp.authMethod === "password" && " For Gmail password authentication, SMTP_PASS is a 16-letter app password from myaccount.google.com/apppasswords."}
                  {status.smtp.authMethod === "gmail-oauth" && " Gmail OAuth needs a Google OAuth client ID, client secret, and refresh token. Those values stay on the server."}
                </>
              ) : (
                "SMTP_HOST, SMTP_USER and SMTP_PASS. Or set SMTP_AUTH_METHOD to gmail-oauth and provide the Gmail OAuth server credentials."
              )}
            </div>
          </dd>
          <dt>Webhook</dt>
          <dd>
            <Badge tone={status.webhook.configured ? "ok" : "muted"}>{status.webhook.configured ? "configured" : "not set"}</Badge>
            <div className="adm-help">CONTACT_WEBHOOK_URL. Receives a JSON message for your own automation.</div>
          </dd>
          <dt>FormSubmit</dt>
          <dd>
            <Badge tone={status.formsubmit.overridden ? "warn" : "ok"}>{status.formsubmit.overridden ? "endpoint overridden" : "default"}</Badge>
            <div className="adm-help">
              <code>{status.formsubmit.endpoint}</code>. The last resort, and the route the contact form has always used. Each recipient address must have activated FormSubmit once by clicking the email it sends on first use.
            </div>
          </dd>
        </dl>
        {!anyChannel && <Alert kind="warn">No channel is likely to deliver in this environment. The test below will say so honestly.</Alert>}
      </Card>

      <Card title="Who is told about access requests" description="One address. The default is the same inbox the contact form delivers to.">
        <form className="adm-form" onSubmit={onSave} noValidate>
          <Input id="notify-email" label="Notification address" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canWrite || save.pending} error={save.issues.notifyEmail} />
          {save.error && !save.issues.notifyEmail && <Alert kind="error">{save.error}</Alert>}
          <div className="adm-actions">
            <Button type="submit" disabled={!canWrite || save.pending || email.trim().toLowerCase() === saved}>{save.pending ? "Saving" : "Save"}</Button>
            <span className="adm-help">Currently <strong>{saved}</strong></span>
          </div>
        </form>
      </Card>

      <Card title="Send a test email" description="Sends a real message to the address above through the same chain the notifications use, and shows what happened.">
        <div className="adm-actions">
          <Button onClick={onTest} disabled={!canWrite || test.pending}>{test.pending ? "Sending" : `Send a test to ${saved}`}</Button>
        </div>
        {test.error && <Alert kind="error">{test.error}</Alert>}
        {result && (
          <div style={{ marginBlockStart: 12 }} aria-live="polite">
            {result.outcome.status === "sent" ? (
              <Alert kind="success">
                Sent to {result.to} via <strong>{result.outcome.channel}</strong>. Check the inbox and the spam folder.
                {result.outcome.error && <div className="adm-help">Earlier channels failed first: {result.outcome.error}</div>}
              </Alert>
            ) : (
              <Alert kind="error">
                Not delivered to {result.to}. Every channel failed: {result.outcome.error}
              </Alert>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
