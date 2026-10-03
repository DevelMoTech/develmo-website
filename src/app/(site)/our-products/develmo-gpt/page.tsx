import type { Metadata } from "next";
import { withSeoOverride } from "@/lib/meta";
import { Button } from "@/components/ui";
import { CtaBand } from "@/components/CtaBand";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { faqSchemaEnabled } from "@/lib/seo/overrides";
import { jsonLd } from "@/lib/jsonld";

// DevelMoGPT, from the product brief of 25 September 2026. A working
// prototype, so the page says "coming soon" and asks for a demo rather than
// quoting a price. The brief rules out claiming security certifications,
// self learning, large document libraries, named deployments or production
// readiness, and asks that the repository is never linked. None of that
// appears here.
export const generateMetadata = (): Promise<Metadata> => withSeoOverride("/our-products/develmo-gpt", {
  title: "DevelMoGPT — A private AI assistant that runs on your own servers",
  description:
    "DevelMoGPT is a private AI chat assistant that runs entirely on your own hardware. Ask questions of your own documents and get answers with the sources listed, without sending anything to an outside AI provider.",
});

const steps = [
  { n: "01", t: "Upload", d: "Admins add documents in the admin console or paste text directly. PDF, Word, Excel, CSV, PowerPoint and plain text are supported." },
  { n: "02", t: "Index", d: "Each document is converted to text, turned into an embedding by a local embedding model and stored in a vector index on your own server." },
  { n: "03", t: "Ask", d: "A user types a question in the chat window." },
  { n: "04", t: "Retrieve", d: "DevelMoGPT finds the three most relevant documents by meaning, not just keywords." },
  { n: "05", t: "Answer", d: "A language model running locally writes the answer from those documents and the recent conversation, then lists the sources it used with a confidence score." },
];

const flow = [
  { t: "Upload", d: "Your documents" },
  { t: "Index", d: "On your server" },
  { t: "Ask", d: "In plain language" },
  { t: "Retrieve", d: "By meaning" },
  { t: "Answer", d: "With its sources" },
];

const features = [
  "Runs fully on premises. The language model, the search index and the chat history all stay on your hardware.",
  "Answers grounded in your own documents, with the source documents listed on every reply.",
  "Semantic search that matches on meaning, so people can ask in their own words.",
  "Reads PDF, Word, Excel, CSV, PowerPoint and text files.",
  "Admin console to upload, browse and search the knowledge base.",
  "Secure sign in, passwords stored as secure hashes, and separate user and admin roles.",
  "Saved, searchable conversations for every user, so work picks up where it left off.",
  "No per message API fees. Once installed, it runs on your own GPU.",
];

const stack = [
  { k: "Chat app", v: "Next.js and React" },
  { k: "Sign in", v: "Token based sessions, hashed passwords, separate user and admin roles" },
  { k: "App database", v: "MongoDB, holding users and chat history" },
  { k: "AI service", v: "A Python REST API" },
  { k: "Language model", v: "Served locally, on your own GPU" },
  { k: "Embeddings", v: "A local embedding model, 768 dimensions" },
  { k: "Vector search", v: "FAISS, cosine similarity" },
  { k: "File types", v: "PDF, DOCX, XLSX, CSV, PPTX, TXT" },
];

const hardware = [
  { k: "Minimum", v: "16 GB RAM, an NVIDIA GPU with 8 GB of video memory, 50 GB of free disk" },
  { k: "Recommended", v: "32 GB RAM, an NVIDIA GPU with 16 GB of video memory, an NVMe SSD" },
  { k: "Operating system", v: "Ubuntu, Windows or macOS" },
];

const staysHere = [
  "The language model",
  "The document index",
  "Every conversation",
  "Your uploaded files",
];

const faqs = [
  { q: "Does any of our data leave our servers?", a: "No. The language model, the document index and the chat history all run on your own hardware. Nothing is sent to an outside AI provider." },
  { q: "What files can it read?", a: "PDF, Word, Excel, CSV, PowerPoint and plain text. Admins can also paste text straight in." },
  { q: "What hardware do we need?", a: "A server or workstation with an NVIDIA GPU, 8 GB of video memory minimum and 16 GB recommended, and at least 16 GB of RAM. DevelMo can advise on sizing for your team." },
  { q: "Can we try it?", a: "Yes. DevelMoGPT is a working prototype today, so the next step is a demo on a sample of your own documents rather than a signup page." },
];

export default async function DevelMoGptPage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  const faqSchema = await faqSchemaEnabled("/our-products/develmo-gpt");

  return (
    <>
      <section className="hero">
        <div className="container hero-in">
          <div>
            <span className="kicker">{tr("Coming soon")} · DevelMoGPT</span>
            <h1>
              {locale === "en" ? (
                <>
                  Your documents <span className="hl">never leave</span> your servers
                </>
              ) : (
                tr("Your documents never leave your servers")
              )}
            </h1>
            <p className="sub">
              {tr(
                "DevelMoGPT is a private AI chat assistant that runs entirely on your own hardware. Upload your company documents and your team can ask questions in plain language and get answers drawn from those documents, with the source files listed on every reply.",
              )}
            </p>
            <div className="hero-cta">
              <Button href="/contact-develmo?intent=demo&product=develmo-gpt" variant="teal" lg>
                {tr("Book a demo")}
              </Button>
              <Button href="/contact-develmo" variant="ghost" rect lg>
                {tr("Talk to our AI team")}
              </Button>
            </div>
            <div className="hero-trust">
              <div className="who">
                <span className="tag">{tr("On premises")}</span>
                <span className="tag">PDF</span>
                <span className="tag">DOCX</span>
                <span className="tag">XLSX</span>
                <span className="tag">PPTX</span>
              </div>
            </div>
          </div>
          <div>
            <div className="dash">
              <div className="dash-top">
                <span className="dot a" />
                <span className="dot b" />
                <span className="dot c" />
                &nbsp; {tr("Inside your network")}
                <span className="live">
                  <i />
                  {tr("LOCAL")}
                </span>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: "4px 2px", display: "grid", gap: 10 }}>
                {staysHere.map((x) => (
                  <li key={x} style={{ display: "flex", gap: 10, alignItems: "center", color: "#C2CCE4", fontSize: 14.5 }}>
                    <span aria-hidden="true" style={{ color: "var(--teal)", fontWeight: 800 }}>✓</span>
                    {tr(x)}
                  </li>
                ))}
              </ul>
              <div className="kpi-row" style={{ marginTop: 12 }}>
                <div className="kpi-card">
                  <b>0</b>
                  <small>{tr("Bytes sent to an outside AI provider")}</small>
                </div>
                <div className="kpi-card">
                  <b>0</b>
                  <small>{tr("Per message API fees")}</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("The problem")}</div>
          <h2 className="h2">{tr("The answer is in a folder nobody can search")}</h2>
          <hr className="hr-tick" />
          <p className="lead">
            {tr(
              "Contracts, policies, handbooks and reports pile up faster than anyone can read them, and the assistants that could answer questions about them want the files uploaded somewhere else. For teams with data residency rules, or anything commercially sensitive, that is the end of the conversation.",
            )}
          </p>
          <div className="flow">
            {flow.map((f) => (
              <span className="flow-step" key={f.t}>
                <b>{tr(f.t)}</b>
                <span>{tr(f.d)}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("How it works")}</div>
          <h2 className="h2">{tr("From a folder of files to an answer with sources")}</h2>
          <div className="grid g3" style={{ marginTop: 40 }}>
            {steps.map((s) => (
              <div className="outcome" key={s.t}>
                <div className="n">{s.n}</div>
                <h3>{tr(s.t)}</h3>
                <p>{tr(s.d)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Capabilities")}</div>
          <h2 className="h2">{tr("What it does")}</h2>
          <ul className="feat-light" style={{ marginTop: 26 }}>
            {features.map((f) => (
              <li key={f}>
                <span className="tick">✓</span>
                <div>{tr(f)}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("Under the hood")}</div>
          <h2 className="h2">{tr("What it is built on, and what it needs")}</h2>
          <hr className="hr-tick" />
          <div className="spec-wrap">
            <table className="spec">
              <thead>
                <tr>
                  <th scope="col">{tr("Component")}</th>
                  <th scope="col">{tr("What it uses")}</th>
                </tr>
              </thead>
              <tbody>
                {stack.map((r) => (
                  <tr key={r.k}>
                    <th scope="row">{tr(r.k)}</th>
                    <td data-label={tr("What it uses")}>{tr(r.v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="spec-wrap">
            <table className="spec">
              <thead>
                <tr>
                  <th scope="col">{tr("Hardware")}</th>
                  <th scope="col">{tr("What you need")}</th>
                </tr>
              </thead>
              <tbody>
                {hardware.map((r) => (
                  <tr key={r.k}>
                    <th scope="row">{tr(r.k)}</th>
                    <td data-label={tr("What you need")}>{tr(r.v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="callout" style={{ marginTop: 30 }}>
            <p className="callout-title">{tr("Where it is today")}</p>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              {tr("DevelMoGPT is a working prototype. We are taking it into pilots now, so the honest next step is a demo on a sample of your own documents.")}
            </p>
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
        titleText="Ask your own documents, on your own hardware."
        title={
          <>
            Ask your own documents, on <span className="hl">your own hardware</span>
          </>
        }
        text="Book a demo and we will run DevelMoGPT against a sample of your files."
        primaryLabel="Book a demo"
        primaryHref="/contact-develmo?intent=demo&product=develmo-gpt"
      />
    </>
  );
}
