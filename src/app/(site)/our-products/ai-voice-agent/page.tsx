import type { Metadata } from "next";
import { withSeoOverride } from "@/lib/meta";
import { Button } from "@/components/ui";
import { CtaBand } from "@/components/CtaBand";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { faqSchemaEnabled } from "@/lib/seo/overrides";
import { jsonLd } from "@/lib/jsonld";

// The DevelMo AI Voice Agent, from the product document of September 2026.
// Pricing, the confirmed language list, telephony providers, data residency
// and time to a live pilot are all still open in that document, so nothing
// on this page states any of them.
export const generateMetadata = (): Promise<Metadata> => withSeoOverride("/our-products/ai-voice-agent", {
  title: "DevelMo AI Voice Agent — Intelligent conversations, real business actions",
  description:
    "An AI voice agent that answers and makes business calls in real time, in multiple languages, and turns each conversation into a CRM update, a booked meeting or a workflow action inside the systems you already run.",
});

const problems = [
  { p: "Missed opportunities", c: "Calls outside working hours or during peaks go unanswered, and leads go cold." },
  { p: "Repetitive conversations", c: "Skilled staff spend their day answering the same questions." },
  { p: "Slow follow ups", c: "Leads wait hours or days for a callback." },
  { p: "Limited availability", c: "Coverage is capped by headcount and shift hours." },
  { p: "Language barriers", c: "Customers who do not speak the team's language get a weaker experience." },
  { p: "Manual data entry", c: "Call outcomes are typed into the CRM by hand, late or not at all." },
];

const callFlow = [
  { t: "Connect", d: "Phone and business systems" },
  { t: "Converse", d: "Understand the request" },
  { t: "Access", d: "CRM, data, APIs, calendar" },
  { t: "Act", d: "Booking, update, workflow" },
  { t: "Escalate", d: "Hand off to a person" },
];

const capabilities = [
  { t: "Multilingual voice", d: "Holds conversations in multiple languages, so one system can serve a diverse customer base." },
  { t: "Low latency", d: "Responds in real time, with minimal delay between caller and agent." },
  { t: "Context aware", d: "Adapts to what the caller actually says instead of following a rigid script." },
  { t: "Lead qualification", d: "Identifies requirements, asks qualifying questions and decides the right next step." },
  { t: "Appointment scheduling", d: "Moves qualified conversations into booked meetings through connected calendars." },
  { t: "Human escalation", d: "Triggers a handoff the moment a conversation needs human judgment." },
];

const integrations = [
  { s: "CRM", d: "Create and update leads, contacts, statuses, notes and call outcomes." },
  { s: "Databases", d: "Look up your own business data during a live call." },
  { s: "APIs", d: "Reach internal or third party services to fetch information or take actions." },
  { s: "Calendars and scheduling", d: "Check availability and run booking workflows." },
  { s: "Automation platforms", d: "Trigger notifications, emails, follow ups, lead routing and internal tasks." },
];

const control = [
  { d: "Which systems the agent can access", e: "CRM and calendar, but not billing" },
  { d: "What information it can retrieve", e: "Order status, but not payment details" },
  { d: "Which actions it can perform", e: "Book a viewing, but not cancel a contract" },
  { d: "What data passes between systems", e: "Only the fields sales needs are written to the CRM" },
  { d: "When human approval is required", e: "Discounts or refunds go to a manager" },
];

const useCases = [
  { u: "Sales and lead qualification", d: "Calls new prospects, discovers needs, qualifies them and passes details to sales.", w: "Sales teams, B2B services" },
  { u: "Customer support", d: "Answers routine questions using data from connected systems.", w: "Support and service teams" },
  { u: "Appointment management", d: "Books and reschedules appointments.", w: "Clinics, consultants, agencies, service providers" },
  { u: "Lead follow up", d: "Re-engages leads who did not respond to forms, campaigns or earlier outreach.", w: "Marketing and sales teams" },
  { u: "Recruitment", d: "Runs first round candidate screening before interviews are scheduled.", w: "HR teams and recruiters" },
  { u: "Real estate", d: "Captures buyer and seller requirements, qualifies them and routes to agents.", w: "Brokerages and developers" },
  { u: "Customer feedback", d: "Collects post service feedback and flags calls that need attention.", w: "Service and CX teams" },
];

const leadFlow = [
  { t: "New lead", d: "Arrives in your CRM" },
  { t: "AI voice call", d: "Within minutes" },
  { t: "Understand needs", d: "The right questions" },
  { t: "Qualify", d: "Worth sales time or not" },
  { t: "CRM update", d: "Written back" },
];

const outcomes = [
  { t: "If the lead is interested", d: "The agent schedules a meeting and sends a notification to the sales team." },
  { t: "If they are not interested yet", d: "The agent sets a follow up for a later date." },
];

const benefits = [
  { b: "Scale conversations", m: "More calls handled without adding staff at the same pace." },
  { b: "Respond quickly", m: "Leads and customers are engaged without waiting on team availability." },
  { b: "Reduce repetitive work", m: "Routine conversations and data collection are automated." },
  { b: "Connect calls to operations", m: "Conversations become CRM updates, API actions, appointments and workflows." },
  { b: "Support multiple languages", m: "A broader customer base is served from one system." },
  { b: "Keep humans involved", m: "The agent handles defined tasks and people take over where judgment is needed." },
];

const faqs = [
  { q: "Do we have to move our systems onto a new platform?", a: "No. The agent is a voice layer on top of the stack you already run. It connects to your CRM, databases, APIs, calendars and automation tools rather than replacing them." },
  { q: "What can the agent actually do with our systems?", a: "Whatever you allow. You decide which systems it can reach, what information it may retrieve, which actions it may perform, what data passes between systems, and when a person has to approve something." },
  { q: "What happens when a call needs a person?", a: "The agent hands off. Escalation is one of the defined outcomes of a call, alongside an appointment, a CRM update, an API action and a notification." },
  { q: "Is every deployment the same?", a: "No. There is no one size fits all conversation, so each agent is configured around your conversation flow, business rules, data sources, CRM, APIs, scheduling process and escalation rules." },
];

export default async function VoiceAgentPage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  const faqSchema = await faqSchemaEnabled("/our-products/ai-voice-agent");

  return (
    <>
      <section className="hero">
        <div className="container hero-in">
          <div>
            <span className="kicker">{tr("Coming soon")} · {tr("AI Voice Agent")}</span>
            <h1>
              {locale === "en" ? (
                <>
                  Intelligent conversations. <span className="hl">Real business actions.</span>
                </>
              ) : (
                tr("Intelligent conversations. Real business actions.")
              )}
            </h1>
            <p className="sub">
              {tr(
                "An AI voice agent that talks to your customers in their language and gets real work done in your CRM, calendar and systems. Connect the AI to your systems, not the other way around.",
              )}
            </p>
            <div className="hero-cta">
              <Button href="/contact-develmo?intent=demo&product=ai-voice-agent" variant="teal" lg>
                {tr("Book a discovery call")}
              </Button>
              <Button href="/contact-develmo" variant="ghost" rect lg>
                {tr("Talk to our AI team")}
              </Button>
            </div>
            <div className="hero-trust">
              <div className="who">
                <span className="tag">{tr("Listen")}</span>
                <span className="tag">{tr("Understand")}</span>
                <span className="tag">{tr("Act")}</span>
              </div>
            </div>
          </div>
          <div>
            {/* A sketch of one call, not a recording. */}
            <div className="dash" aria-hidden="true">
              <div className="dash-top">
                <span className="dot a" />
                <span className="dot b" />
                <span className="dot c" />
                &nbsp; {tr("Inbound call")} · 00:41
                <span className="live">
                  <i />
                  {tr("ON CALL")}
                </span>
              </div>
              <div style={{ display: "grid", gap: 8, padding: "2px 2px 10px" }}>
                {[
                  { who: tr("Caller"), line: tr("Do you have anything free on Thursday morning?") },
                  { who: tr("Agent"), line: tr("There is a 10:30 slot. Shall I hold it for you?") },
                  { who: tr("Caller"), line: tr("Yes please.") },
                ].map((m, i) => (
                  <div
                    key={i}
                    style={{
                      borderRadius: 9,
                      padding: "9px 11px",
                      background: i % 2 === 0 ? "rgba(255,255,255,.04)" : "rgba(61,242,224,.10)",
                      border: "1px solid rgba(255,255,255,.08)",
                    }}
                  >
                    <small style={{ display: "block", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "#AEBAD6" }}>{m.who}</small>
                    <span style={{ color: "#C2CCE4", fontSize: 13.5 }}>{m.line}</span>
                  </div>
                ))}
              </div>
              <div className="kpi-row">
                <div className="kpi-card">
                  <b>{tr("Booked")}</b>
                  <small>{tr("Calendar, 10:30 Thursday")}</small>
                </div>
                <div className="kpi-card">
                  <b>{tr("Updated")}</b>
                  <small>{tr("CRM, with the call outcome")}</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("The problem")}</div>
          <h2 className="h2">{tr("Phone conversations do not scale")}</h2>
          <hr className="hr-tick" />
          <p className="lead">
            {tr(
              "Businesses depend on calls for sales, support, appointments, recruitment and follow ups, and every extra call needs another person. What they need is a way to scale conversations while keeping every call connected to real business processes.",
            )}
          </p>
          <div className="spec-wrap">
            <table className="spec">
              <thead>
                <tr>
                  <th scope="col">{tr("Pain point")}</th>
                  <th scope="col">{tr("What it costs the business")}</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((r) => (
                  <tr key={r.p}>
                    <th scope="row">{tr(r.p)}</th>
                    <td data-label={tr("What it costs the business")}>{tr(r.c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("The solution")}</div>
          <h2 className="h2">{tr("From the first hello to the next business action")}</h2>
          <hr className="hr-tick" />
          <p className="lead">
            {tr(
              "The agent understands what the caller wants, asks the right questions, pulls information from connected systems and acts on it. It is a conversational front end to your infrastructure rather than an isolated chatbot.",
            )}
          </p>
          <div className="flow">
            {callFlow.map((f) => (
              <span className="flow-step" key={f.t}>
                <b>{tr(f.t)}</b>
                <span>{tr(f.d)}</span>
              </span>
            ))}
          </div>
          <div className="callout" style={{ marginTop: 30 }}>
            <p className="callout-title">{tr("Every call ends somewhere definite")}</p>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              {tr("An appointment, a CRM update, an API action, a notification, or a handoff to the right person.")}
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Capabilities")}</div>
          <h2 className="h2">{tr("Six things it does on every call")}</h2>
          <div className="grid g3" style={{ marginTop: 40 }}>
            {capabilities.map((c) => (
              <div className="card" key={c.t}>
                <h3 style={{ fontSize: 17 }}>{tr(c.t)}</h3>
                <p>{tr(c.d)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("Integrations")}</div>
          <h2 className="h2">{tr("Your infrastructure stays at the centre")}</h2>
          <hr className="hr-tick" />
          <div className="spec-wrap">
            <table className="spec">
              <thead>
                <tr>
                  <th scope="col">{tr("System")}</th>
                  <th scope="col">{tr("What the agent can do with it")}</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((r) => (
                  <tr key={r.s}>
                    <th scope="row">{tr(r.s)}</th>
                    <td data-label={tr("What the agent can do with it")}>{tr(r.d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Privacy and control")}</div>
          <h2 className="h2">{tr("Your data, your access rules")}</h2>
          <hr className="hr-tick" />
          <p className="lead">
            {tr(
              "The agent is designed around your existing data infrastructure and access requirements, so you set the boundaries. That is what lets an organisation add voice automation on top of its own stack instead of moving a whole workflow into a separate platform.",
            )}
          </p>
          <div className="spec-wrap">
            <table className="spec">
              <thead>
                <tr>
                  <th scope="col">{tr("You decide")}</th>
                  <th scope="col">{tr("For example")}</th>
                </tr>
              </thead>
              <tbody>
                {control.map((r) => (
                  <tr key={r.d}>
                    <th scope="row">{tr(r.d)}</th>
                    <td data-label={tr("For example")}>{tr(r.e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("Use cases")}</div>
          <h2 className="h2">{tr("One voice platform, many jobs")}</h2>
          <div className="spec-wrap">
            <table className="spec">
              <thead>
                <tr>
                  <th scope="col">{tr("Use case")}</th>
                  <th scope="col">{tr("What the agent does")}</th>
                  <th scope="col">{tr("Who it is for")}</th>
                </tr>
              </thead>
              <tbody>
                {useCases.map((r) => (
                  <tr key={r.u}>
                    <th scope="row">{tr(r.u)}</th>
                    <td data-label={tr("What the agent does")}>{tr(r.d)}</td>
                    <td data-label={tr("Who it is for")}>{tr(r.w)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Example workflow")}</div>
          <h2 className="h2">{tr("From lead to meeting")}</h2>
          <hr className="hr-tick" />
          <p className="lead">
            {tr("A new lead gets a call within minutes, and sales only hears about the ones worth their time.")}
          </p>
          <div className="flow">
            {leadFlow.map((f) => (
              <span className="flow-step" key={f.t}>
                <b>{tr(f.t)}</b>
                <span>{tr(f.d)}</span>
              </span>
            ))}
          </div>
          <div className="grid g2" style={{ marginTop: 34 }}>
            {outcomes.map((o) => (
              <div className="card" key={o.t}>
                <h3>{tr(o.t)}</h3>
                <p>{tr(o.d)}</p>
              </div>
            ))}
          </div>
          <p className="lead" style={{ marginTop: 26 }}>
            {tr("The same architecture adapts to support, recruitment, appointment management and other workflows.")}
          </p>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("Technology")}</div>
          <h2 className="h2">{tr("A voice layer, and everything around it")}</h2>
          <hr className="hr-tick" />
          <div className="flow">
            <span className="flow-step"><b>{tr("Customer")}</b><span>{tr("Calls, or is called")}</span></span>
            <span className="flow-step"><b>{tr("AI Voice Agent")}</b><span>{tr("ElevenLabs voice")}</span></span>
            <span className="flow-step"><b>{tr("CRM, data, APIs")}</b><span>{tr("Read and write")}</span></span>
            <span className="flow-step"><b>{tr("Your workflows")}</b><span>{tr("Your business rules")}</span></span>
            <span className="flow-step"><b>{tr("Your team")}</b><span>{tr("Scheduling, follow up, handoff")}</span></span>
          </div>
          <p className="lead" style={{ marginTop: 30 }}>
            {tr(
              "ElevenLabs handles voice generation and real time voice interaction. DevelMo combines that voice layer with conversational intelligence, integrations, business logic and automation to deliver a complete voice based business system.",
            )}
          </p>
          <p className="lead">
            {tr(
              "Because each deployment is configured around your languages, business logic and integrations, one voice system can serve a local market or customers across several regions with a consistent experience. In our core markets that usually means Arabic and English on the same line.",
            )}
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Business value")}</div>
          <h2 className="h2">{tr("What it changes for the team")}</h2>
          <div className="spec-wrap">
            <table className="spec">
              <thead>
                <tr>
                  <th scope="col">{tr("Benefit")}</th>
                  <th scope="col">{tr("What it means for you")}</th>
                </tr>
              </thead>
              <tbody>
                {benefits.map((r) => (
                  <tr key={r.b}>
                    <th scope="row">{tr(r.b)}</th>
                    <td data-label={tr("What it means for you")}>{tr(r.m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="callout" style={{ marginTop: 30 }}>
            <p className="callout-title">{tr("Configured, not templated")}</p>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              {tr(
                "There is no one size fits all conversation. Every business has different customers, data, qualification criteria, systems and processes, so each agent is built around your conversation flow, business rules, data sources, CRM, APIs, scheduling and escalation rules.",
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("FAQ")}</div>
          <h2 className="h2">{tr("Common questions")}</h2>
          <div className="faq" style={{ marginTop: 30 }}>
            {faqs.map((f) => (
              <details key={f.q}>
                <summary>{tr(f.q)}</summary>
                <p>{tr(f.a)}</p>
              </details>
            ))}
          </div>
        </div>
        {faqSchema && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: jsonLd({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: faqs.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              }),
            }}
          />
        )}
      </section>

      <CtaBand
        titleText="Turn conversations into business outcomes."
        title={
          <>
            Turn conversations into <span className="hl">business outcomes</span>
          </>
        }
        text="Book a discovery call and we will map one call flow end to end, from the first hello to the CRM update."
        primaryLabel="Book a discovery call"
        primaryHref="/contact-develmo?intent=demo&product=ai-voice-agent"
      />
    </>
  );
}
