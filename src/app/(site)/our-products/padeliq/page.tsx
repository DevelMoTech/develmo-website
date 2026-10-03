import type { Metadata } from "next";
import { withSeoOverride } from "@/lib/meta";
import { Button } from "@/components/ui";
import { CtaBand } from "@/components/CtaBand";
import { getLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { faqSchemaEnabled } from "@/lib/seo/overrides";
import { jsonLd } from "@/lib/jsonld";

// PadelIQ, from the product brief of 25 September 2026. Every claim on this
// page was checked against the product. The brief's "do not claim" list is
// firm and nothing here states reaction time, rally patterns, shot types,
// ball speed, an accuracy figure, or live processing of club camera streams.
export const generateMetadata = (): Promise<Metadata> => withSeoOverride("/our-products/padeliq", {
  title: "PadelIQ — League play and match analytics",
  description:
    "PadelIQ turns ordinary padel match video into performance data for every player: distance, speed, court coverage and work rate in real units, plus a competitive league with honest rankings.",
});

const analyticsSteps = [
  { n: "01", t: "Record", d: "A standard match video from one fixed camera behind the court." },
  { n: "02", t: "Calibrate once", d: "Mark the four court corners. PadelIQ maps the camera view onto the real 10 m by 20 m court, so every result is in metres, not pixels." },
  { n: "03", t: "Detect and track", d: "A detector finds the players in every frame and a tracker keeps each identity steady. The four players are locked in as P1 to P4 by court side, and reflections in the glass walls are filtered out." },
  { n: "04", t: "Measure", d: "Movement is turned into per player metrics, frame by frame." },
  { n: "05", t: "Coach", d: "Every five seconds a summary of the metrics goes to a language model, which returns three short coaching tips shown on screen." },
];

const flow = [
  { t: "Record", d: "One fixed camera" },
  { t: "Calibrate", d: "Four court corners" },
  { t: "Track", d: "P1 to P4 locked" },
  { t: "Measure", d: "Metres and m/s" },
  { t: "Coach", d: "Three tips, every 5 s" },
];

const metrics = [
  { m: "Distance covered", d: "Total ground covered on court", u: "metres" },
  { m: "Average speed", d: "Average movement speed across the match", u: "m/s" },
  { m: "Top speed", d: "Fastest movement recorded", u: "m/s" },
  { m: "Active time", d: "Time spent moving versus standing, and the work rate that gives", u: "seconds and %" },
  { m: "Court coverage", d: "Share of a 240 zone court grid the player has reached", u: "%" },
  { m: "Movement stability", d: "How steady the player's pace is, 0 to 100", u: "score" },
];

const userSees = [
  { t: "Annotated match video", d: "Player boxes, P1 to P4 labels, movement trails and a live stat card above each player." },
  { t: "Mini court map", d: "A bird's eye view drawing every player's path as the match plays." },
  { t: "AI coach panel", d: "Three practical tips, refreshed every five seconds." },
  { t: "Data export", d: "Full position history per player as JSON, and a session summary table as CSV." },
];

const capabilities = [
  "Tracks all four players and keeps each identity locked for the whole match.",
  "Maps the camera view onto the real court, so distance and speed are reported in metres and metres per second.",
  "Live stat card over every player: distance, average speed, active time and court coverage.",
  "Bird's eye mini map that draws every player's movement path as the match plays.",
  "Movement stability score that shows who keeps a steady pace and who plays stop and start.",
  "AI coach that turns the numbers into three short, practical tips every few seconds.",
  "Filters out reflections in the glass walls, a common source of false detections on padel courts.",
  "Exports every session as structured data for coaches and clubs.",
];

const league = [
  { t: "Team based", d: "Pair up with a partner, form an official team and compete under one name." },
  { t: "Results from the court", d: "Record match results in seconds, with no spreadsheets and no manual tallying." },
  { t: "Live leaderboards", d: "Standings update on every logged match, so rankings always reflect real form." },
  { t: "Invite only", d: "Onboarding by invite code, which keeps the league trusted and the rankings clean." },
];

const stats = [
  { v: "110+", l: "active members" },
  { v: "50+", l: "teams" },
  { v: "2+", l: "competitive seasons" },
  { v: "540", l: "points, top player season tally" },
];

const faqs = [
  { q: "How do I join the league?", a: "Get an invite code from an existing member or an admin, then create your account on the platform. Once registered, you can pair with a partner and form your team." },
  { q: "What do I need to analyse a match?", a: "A recorded match video from one fixed camera behind the court, and a one-off calibration where you mark the four court corners. PadelIQ works on recorded video rather than a live club camera stream." },
  { q: "How are the numbers measured?", a: "The four court corners are mapped onto the real 10 m by 20 m court, so every distance is in metres and every speed in metres per second rather than in pixels." },
  { q: "How are rankings calculated?", a: "Rankings are based on real recorded match results. Every match you log updates your team and player points, so the leaderboard always reflects current competitive standing." },
];

export default async function PadelIQPage() {
  const locale = await getLocale();
  const tr = (s: string) => t(s, locale);
  const faqSchema = await faqSchemaEnabled("/our-products/padeliq");

  return (
    <>
      <section className="hero">
        <div className="container hero-in">
          <div>
            <span className="kicker">{tr("Live product")} · PadelIQ</span>
            <h1>
              {locale === "en" ? (
                <>
                  AI that <span className="hl">reads the game</span>
                </>
              ) : (
                tr("AI that reads the game")
              )}
            </h1>
            <p className="sub">
              {tr(
                "PadelIQ turns ordinary match video into performance data for every player. It finds all four players, follows each one through the match, maps every step onto the real court, and reports distance, speed, court coverage and work rate in real units.",
              )}
            </p>
            <div className="hero-cta">
              <Button href="/contact-develmo?intent=demo&product=padeliq" variant="teal" lg>
                {tr("Request a Demo")}
              </Button>
              <Button href="/contact-develmo" variant="ghost" rect lg>
                {tr("Talk to our AI team")}
              </Button>
            </div>
            <div className="hero-trust">
              <div className="who">
                <span className="tag">10 m × 20 m</span>
                <span className="tag">P1 to P4</span>
                <span className="tag">JSON</span>
                <span className="tag">CSV</span>
              </div>
            </div>
          </div>
          <div>
            {/* A sketch of the output, not a live reading. The four cards name
                the metrics the product actually measures. */}
            <div className="dash" aria-hidden="true">
              <div className="dash-top">
                <span className="dot a" />
                <span className="dot b" />
                <span className="dot c" />
                &nbsp; {tr("PadelIQ · Match 14 · P1 to P4")}
                <span className="live">
                  <i />
                  {tr("MATCH")}
                </span>
              </div>
              <div className="kpi-row">
                <div className="kpi-card">
                  <b>2,481 m</b>
                  <small>{tr("Distance covered")}</small>
                </div>
                <div className="kpi-card">
                  <b>1.9 m/s</b>
                  <small>{tr("Average speed")}</small>
                </div>
                <div className="kpi-card">
                  <b>68%</b>
                  <small>{tr("Court coverage")}</small>
                </div>
                <div className="kpi-card">
                  <b>74</b>
                  <small>{tr("Movement stability")}</small>
                </div>
              </div>
              <svg viewBox="0 0 200 110" style={{ width: "100%", height: "auto", marginTop: 10, display: "block" }} role="presentation">
                <rect x="4" y="4" width="192" height="102" rx="4" fill="rgba(15,178,242,.08)" stroke="rgba(61,242,224,.45)" strokeWidth="1.4" />
                <line x1="100" y1="4" x2="100" y2="106" stroke="rgba(61,242,224,.45)" strokeWidth="1.4" />
                <line x1="30" y1="4" x2="30" y2="106" stroke="rgba(61,242,224,.28)" strokeWidth="1" />
                <line x1="170" y1="4" x2="170" y2="106" stroke="rgba(61,242,224,.28)" strokeWidth="1" />
                <path d="M46 30 L60 46 L52 68 L70 82" fill="none" stroke="#3df2e0" strokeWidth="1.6" opacity=".85" />
                <path d="M44 78 L64 66 L58 40 L78 32" fill="none" stroke="#0fb2f2" strokeWidth="1.6" opacity=".85" />
                <path d="M154 34 L138 50 L146 70 L128 84" fill="none" stroke="#3df2e0" strokeWidth="1.6" opacity=".6" />
                <path d="M156 80 L134 68 L142 42 L122 34" fill="none" stroke="#0fb2f2" strokeWidth="1.6" opacity=".6" />
                <circle cx="70" cy="82" r="3.4" fill="#3df2e0" />
                <circle cx="78" cy="32" r="3.4" fill="#0fb2f2" />
                <circle cx="128" cy="84" r="3.4" fill="#3df2e0" opacity=".7" />
                <circle cx="122" cy="34" r="3.4" fill="#0fb2f2" opacity=".7" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("The analytics")}</div>
          <h2 className="h2">{tr("Every step, in metres")}</h2>
          <hr className="hr-tick" />
          <p className="lead">
            {tr(
              "A padel scoreboard tells you who won. It says nothing about who ran further, who held a steady pace, and who covered the court. PadelIQ measures all of it from the video you already record, and an AI coach reads those numbers every few seconds to give short, practical tips.",
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
          <h2 className="h2">{tr("From match video to coaching tips")}</h2>
          <div className="grid g3" style={{ marginTop: 40 }}>
            {analyticsSteps.map((s) => (
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
          <div className="kicker">{tr("Metrics")}</div>
          <h2 className="h2">{tr("What PadelIQ produces")}</h2>
          <hr className="hr-tick" />
          <div className="spec-wrap">
            <table className="spec">
              <thead>
                <tr>
                  <th scope="col">{tr("Metric")}</th>
                  <th scope="col">{tr("What it means")}</th>
                  <th scope="col">{tr("Unit")}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.m}>
                    <th scope="row">{tr(m.m)}</th>
                    <td data-label={tr("What it means")}>{tr(m.d)}</td>
                    <td className="unit" data-label={tr("Unit")}>{tr(m.u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("On screen")}</div>
          <h2 className="h2">{tr("What you see while the match plays")}</h2>
          <div className="grid g2" style={{ marginTop: 40 }}>
            {userSees.map((u) => (
              <div className="card" key={u.t}>
                <h3>{tr(u.t)}</h3>
                <p>{tr(u.d)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="kicker">{tr("Capabilities")}</div>
          <h2 className="h2">{tr("What the analytics layer does")}</h2>
          <ul className="feat-light" style={{ marginTop: 26 }}>
            {capabilities.map((c) => (
              <li key={c}>
                <span className="tick">✓</span>
                <div>{tr(c)}</div>
              </li>
            ))}
          </ul>
          <div className="callout" style={{ marginTop: 30 }}>
            <p className="callout-title">{tr("In development")}</p>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              {tr("Ball tracking and ball trails are being built and are not part of the product yet.")}
            </p>
          </div>
        </div>
      </section>

      <section className="section bg-light">
        <div className="container">
          <div className="kicker">{tr("The league")}</div>
          <h2 className="h2">{tr("The Riyadh Padel Federation runs on it")}</h2>
          <hr className="hr-tick" />
          <p className="lead">
            {tr(
              "PadelIQ began as a structured community league, built so players could form teams, record real results, and compete through transparent rankings and seasonal tournaments including the RPF Grand Slam.",
            )}
          </p>
          <div className="kpis" style={{ marginTop: 28 }}>
            {stats.map((s) => (
              <div className="kpi" key={s.l}>
                <strong>{s.v}</strong>
                <span>{tr(s.l)}</span>
              </div>
            ))}
          </div>
          <div className="grid g2" style={{ marginTop: 34 }}>
            {league.map((l) => (
              <div className="card" key={l.t}>
                <h3>{tr(l.t)}</h3>
                <p>{tr(l.d)}</p>
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
        titleText="See PadelIQ on your own match footage."
        title={
          <>
            See PadelIQ on your own <span className="hl">match footage</span>
          </>
        }
        text="Send us one recorded match and we will show you the numbers it produces."
        primaryLabel="Request a Demo"
        primaryHref="/contact-develmo?intent=demo&product=padeliq"
      />
    </>
  );
}
