import type { Metadata } from "next";
import { withSeoOverride } from "@/lib/meta";
import { Button } from "@/components/ui";
import { CtaBand } from "@/components/CtaBand";
import { HeroDashboard } from "@/components/Dashboard";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const generateMetadata = (): Promise<Metadata> => withSeoOverride("/our-products/crowdiq", {
  title: "CrowdIQ — AI Video Analytics",
  description:
    "CrowdIQ turns existing cameras into AI-powered business intelligence: visitor detection, tracking IDs, dwell time, heatmaps and reports. Connects to RTSP, ONVIF, HTTP and local cameras.",
});

const features = [
  { t: "Camera connectivity", d: "RTSP, ONVIF, HTTP, local cameras and webcams. No new hardware." },
  { t: "Live inference", d: "Real-time detection running on your existing feeds." },
  { t: "Visitor detection", d: "People detection at 90-95% accuracy on custom-trained models." },
  { t: "Unique tracking IDs", d: "Follow each visitor across the scene." },
  { t: "Age & gender estimation", d: "Demographic breakdowns, hour by hour." },
  { t: "Cultural attire recognition", d: "Region-aware visitor understanding." },
  { t: "Dwell time", d: "Measure how long people stay, and exactly where." },
  { t: "Heatmaps & flow", d: "See hot zones and visitor movement at a glance." },
  { t: "Reports & CSV logs", d: "Exportable, filterable records of every visit." },
  { t: "Analytics dashboard", d: "Live dashboards, timelines and trend lines." },
  { t: "Historical comparison", d: "Compare performance across custom timeframes." },
  { t: "Flexible deployment", d: "Cloud, on-premise or edge, with privacy-aware design." },
];

const steps = [
  { n: "01", t: "Connect cameras", d: "Add RTSP, ONVIF, HTTP or local sources in minutes." },
  { n: "02", t: "Run detection", d: "Launch real-time detection with the custom-trained model." },
  { n: "03", t: "Analyze visitors", d: "Capture age, gender, dwell time and tracking." },
  { n: "04", t: "Generate insight", d: "Review live dashboards, timelines and reports." },
  { n: "05", t: "Export & act", d: "Export CSV reports and feed decisions." },
];

// The product catalogue, offered at the end of the use cases. Saved under a
// friendly name rather than the one the file happens to have on disk.
const CATALOGUE = {
  href: "/crowdiq/develmo-crowdiq-catalog.pdf",
  filename: "DevelMo-CrowdIQ-Catalog.pdf",
};

const useCases = [
  { t: "Retail stores", d: "Footfall, dwell and conversion by zone." },
  { t: "Shopping malls", d: "Tenant traffic and common-area flow." },
  { t: "Events", d: "Crowd density and engagement in real time." },
  { t: "Public spaces", d: "Movement patterns and safety monitoring." },
  { t: "Hospitality", d: "Guest flow and service-area demand." },
  { t: "Smart buildings", d: "Occupancy and space utilization." },
];

const pricing = [
  {
    name: "Starter",
    tag: "Try it on a single feed",
    amount: "Free",
    note: "7-day trial",
    featured: false,
    cta: { label: "Start free trial", href: "/contact-develmo" },
    features: ["1 camera source", "Live detection", "Core dashboard", "Visitor counts"],
  },
  {
    name: "Business",
    tag: "For SMEs & retail chains",
    amount: "$99",
    per: "/month",
    was: "$199",
    featured: true,
    cta: { label: "Request a demo", href: "/contact-develmo" },
    features: [
      "Multiple camera sources",
      "Age, gender & dwell analytics",
      "Heatmaps & visitor flow",
      "CSV exports & historical comparison",
    ],
  },
  {
    name: "Enterprise",
    tag: "Fully customized",
    amount: "Custom",
    note: "Tailored AI pipelines",
    featured: false,
    cta: { label: "Contact sales", href: "/contact-develmo" },
    features: ["Custom-trained models", "On-prem or edge deployment", "Integrations & SLAs", "Dedicated support"],
  },
];

const faqs = [
  { q: "What cameras does CrowdIQ work with?", a: "Any camera that exposes an RTSP, ONVIF or HTTP stream, plus local cameras and webcams. You do not need to replace existing hardware." },
  { q: "How accurate is detection?", a: "Our custom-trained models reach 90-95% person-detection accuracy in typical deployments, tuned further for your environment on Enterprise plans." },
  { q: "How is data privacy handled?", a: "CrowdIQ is privacy-aware by design and can run in the cloud, on-premise or at the edge so footage and data stay where you need them." },
  { q: "Can it run on-premise?", a: "Yes. Enterprise deployments support on-premise and edge so video never has to leave your network." },
  { q: "How long does setup take?", a: "Most teams connect a first camera and see live insight the same day." },
];

export default async function CrowdIQPage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  return (
    <>
      <section className="hero">
        <div className="container hero-in">
          <div>
            <span className="kicker">{tr("Featured product")} · CrowdIQ</span>
            <h1>
              {locale === "en" ? (
                <>
                  See Beyond <span className="hl">the Crowd</span>
                </>
              ) : (
                tr("See Beyond the Crowd")
              )}
            </h1>
            <p className="sub">
              {tr(
                "Turn existing cameras into AI-powered business intelligence. CrowdIQ detects visitors, measures dwell time and reveals movement patterns, in real time.",
              )}
            </p>
            <div className="hero-cta">
              <Button href="/contact-develmo" variant="teal" lg>
                {tr("Request a Demo")}
              </Button>
              <Button href="/contact-develmo" variant="ghost" rect lg>
                {tr("Talk to our AI team")}
              </Button>
            </div>
            <div className="hero-trust">
              <div className="who">
                <span className="tag">RTSP</span>
                <span className="tag">ONVIF</span>
                <span className="tag">HTTP</span>
                <span className="tag">{tr("Local & webcam")}</span>
              </div>
            </div>
          </div>
          <div>
            <HeroDashboard />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("The problem")}</div>
          <h2 className="h2">{tr("Cameras record. They don't explain.")}</h2>
          <p className="lead">
            {tr(
              "Most CCTV systems capture footage but never tell you what it means. Retail and public spaces are full of cameras, yet teams still guess at footfall, dwell time and customer behavior.",
            )}
          </p>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("The solution")}</div>
          <h2 className="h2">{tr("Turn footage into measurable insight")}</h2>
          <p className="lead">
            {tr("CrowdIQ is a plug-and-play AI analytics layer for the cameras you already have.")}
          </p>
          <div className="grid g3" style={{ marginTop: 40 }}>
            {features.map((f) => (
              <div className="card" key={f.t}>
                <h3 style={{ fontSize: 16 }}>{tr(f.t)}</h3>
                <p>{tr(f.d)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("How it works")}</div>
          <h2 className="h2">{tr("From camera to insight in five steps")}</h2>
          <div className="grid g3" style={{ marginTop: 40 }}>
            {steps.map((s) => (
              <div className="outcome" key={s.n}>
                <div className="n">{s.n}</div>
                <h3>{tr(s.t)}</h3>
                <p>{tr(s.d)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("Use cases")}</div>
          <h2 className="h2">{tr("Where CrowdIQ delivers")}</h2>
          <div className="grid g3" style={{ marginTop: 40 }}>
            {useCases.map((u) => (
              <div className="card" key={u.t}>
                <h3 style={{ fontSize: 16 }}>{tr(u.t)}</h3>
                <p>{tr(u.d)}</p>
              </div>
            ))}
          </div>
          {/* The catalogue covers each of these in depth. It downloads rather
              than opening, and the label beside it says what the file is, so
              nobody is surprised by a 5 MB save. */}
          <div className="solutions-foot">
            <span className="mono-label">{tr("The full CrowdIQ catalogue, as a PDF")}</span>
            <Button href={CATALOGUE.href} download={CATALOGUE.filename} variant="navy" lg>
              {tr("View More Details")}
            </Button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Privacy & deployment")}</div>
          <h2 className="h2">{tr("Run it where your data needs to live")}</h2>
          <div className="grid g3" style={{ marginTop: 40 }}>
            <div className="card"><h3>{tr("Cloud")}</h3><p>{tr("Fastest to launch, scales with your camera count, managed and updated for you.")}</p></div>
            <div className="card"><h3>{tr("On-premise & edge")}</h3><p>{tr("Keep footage inside your network. Process at the edge, close to the cameras.")}</p></div>
            <div className="card"><h3>{tr("Privacy-aware")}</h3><p>{tr("Analytics focus on patterns and aggregates, with secure architecture throughout.")}</p></div>
          </div>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("Packages")}</div>
          <h2 className="h2">{tr("Simple pricing that scales")}</h2>
          <div className="grid g3" style={{ marginTop: 40 }}>
            {pricing.map((p) => (
              <div className={`card price${p.featured ? " feat-plan" : ""}`} key={p.name}>
                <h3>{tr(p.name)}</h3>
                <div className="tagp">{tr(p.tag)}</div>
                <div className="amt">
                  {tr(p.amount)}
                  {p.per && <small>{tr(p.per)}</small>}
                  {p.was && <span className="was">{p.was}</span>}
                </div>
                {p.note && <div className="tagp" style={{ marginTop: 6 }}>{tr(p.note)}</div>}
                <ul>
                  {p.features.map((f) => (
                    <li key={f}>{tr(f)}</li>
                  ))}
                </ul>
                <Button href={p.cta.href} variant={p.featured ? "teal" : "ghost-d"}>
                  {tr(p.cta.label)}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
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
      </section>

      <CtaBand
        title={
          <>
            See <span className="hl">CrowdIQ</span> on your cameras
          </>
        }
        titleText="See CrowdIQ on your cameras"
        text="Request a demo and we will connect CrowdIQ to a sample feed so you can see the insight it produces."
        primaryLabel="Request a Demo"
        primaryHref="/contact-develmo?intent=demo&product=crowdiq"
      />
    </>
  );
}
