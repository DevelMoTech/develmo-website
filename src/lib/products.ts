// Mirrors develmo.com /our-products. Content ported + rewritten from the original site.

export type Product = {
  slug: string;
  title: string;
  tagline: string;
  summary: string;
  initial: string;
  bg: string;
  fg: string;
  badge: "live" | "soon";
  features: string[];
  stats?: string[];
  forWho?: string;
  href: string;
  intro?: string;
  howItWorks?: { title: string; body: string }[];
  faqs?: { q: string; a: string }[];
};

export const products: Product[] = [
  {
    slug: "crowdiq",
    title: "CrowdIQ",
    tagline: "Turn the cameras you already own into a real-time picture of who walks through your doors.",
    summary: "CrowdIQ is a plug-and-play AI analytics platform that turns standard surveillance cameras into a live source of visitor insight, detecting people, estimating demographics, and mapping how they move through your space. It connects to the hardware you already run and starts producing footfall, dwell-time, and behaviour data without new installs.",
    initial: "C",
    bg: "var(--teal)",
    fg: "#042521",
    badge: "live",
    features: ["Connects to RTSP, ONVIF, HTTP, and local webcam sources with automatic camera detection and validation, so onboarding takes minutes rather than a rewiring project.", "Detects every visitor and assigns a unique ID, achieving 90 to 95 percent person-detection accuracy in real-world conditions.", "Custom-trained recognition that holds up on culturally specific clothing, including traditional attire, where generic detection APIs tend to fail.", "Estimates gender and age with real-time overlays, giving you a live demographic read of who is in the space right now.", "Measures dwell time and renders heatmaps and visitor-flow graphs that show exactly where attention collects and where it drains away.", "Analytics dashboard with hourly traffic, demographic breakdowns, and historical comparison across any timeframe you choose.", "Exportable CSV tracking logs covering gender, age, entry and exit times, and total duration in store, each fully timestamped for downstream analysis.", "Runs on-premise with offline capability, keeping footage and visitor data inside your own walls by design.", "Built on bespoke models rather than off-the-shelf cloud APIs, tuned to your environment instead of an averaged-out benchmark."],
    stats: ["90 to 95% person-detection accuracy", "4 supported feed types: RTSP, ONVIF, HTTP, webcam", "7-day free Starter trial"],
    forWho: "Retailers and multi-site chains that want to measure footfall, read visitor demographics, and act on real movement data, plus any operator of a physical space who already runs surveillance cameras and wants insight from that footage without ripping out their hardware or shipping video to a third party.",
    href: "/our-products/crowdiq",
    intro: "Most businesses already have cameras watching their floor, yet almost none of that footage becomes a decision. CrowdIQ closes that gap, attaching custom-trained computer vision to your existing RTSP, ONVIF, HTTP, or webcam feeds and converting raw video into accurate, privacy-conscious visitor analytics. The result is a live, measurable understanding of your foot traffic that runs on-premise and works with the infrastructure you have today.",
    howItWorks: [{"title": "Connect your cameras", "body": "Point CrowdIQ at your existing RTSP, ONVIF, HTTP, or webcam feeds. Auto-detection and validation confirm each source and bring it online without manual configuration."}, {"title": "Start live inference", "body": "Custom AI models begin detecting people in real time, assigning each visitor a unique ID and tagging demographics directly on the live overlay."}, {"title": "Capture the insight", "body": "The system continuously records footfall, dwell time, entry and exit events, and movement, building a timestamped history of how your space is used."}, {"title": "Visualise the trends", "body": "The dashboard turns that history into hourly traffic charts, demographic breakdowns, dwell-time heatmaps, and visitor-flow graphs you can compare across any period."}, {"title": "Act with confidence", "body": "Use downloadable reports and exportable CSV logs to optimise layout, staff for peak hours, and sharpen product placement on evidence rather than guesswork."}],
    faqs: [{"q": "Do I need to buy new cameras or special hardware?", "a": "No. CrowdIQ is plug-and-play and works with the surveillance cameras you already run, connecting over RTSP, ONVIF, HTTP, or local webcam sources. Auto-detection validates each feed during setup."}, {"q": "What happens to my video footage and visitor data?", "a": "CrowdIQ is built privacy-first and runs on-premise with offline capability, so footage and analytics stay inside your own environment rather than being sent to an external cloud service."}, {"q": "How accurate is the detection, and does it handle local clothing?", "a": "Person detection runs at 90 to 95 percent accuracy in real conditions. Because the models are custom-trained rather than generic, they perform on culturally specific clothing, including traditional attire, where off-the-shelf APIs often struggle."}],
  },
  {
    slug: "padeliq",
    title: "PadelIQ",
    tagline: "Structured matches, real rankings, and AI that reads the game.",
    summary: "PadelIQ is the platform behind the Riyadh Padel Federation, pairing a competitive team-based league with computer-vision analytics that turn match footage into measurable on-court insight.",
    initial: "P",
    bg: "var(--teal)",
    fg: "#042521",
    badge: "live",
    features: ["Form official league teams by pairing up with a partner and competing under one name", "Record match results in seconds from the court, with no spreadsheets or manual tallying", "Live leaderboards that update on every logged match, so standings always reflect real competitive form", "Invite-based onboarding that keeps the league trusted and the rankings clean", "Seasonal league play and tournaments running all year, including the RPF Grand Slam", "PadelIQ computer-vision analytics that track movement, reaction time, positioning, and rally patterns from match footage", "Automated performance metrics that translate raw video into clear, comparable numbers per player and per team", "AI insights surfaced for clubs, coaches, and serious players who want smarter decisions on court", "Transparent points engine where every recorded result feeds team and player rankings consistently"],
    stats: ["110+ active members", "50+ teams", "2+ competitive seasons", "540 points top player season tally"],
    forWho: "Built for competitive padel players, partnered teams, clubs, and coaches who want a properly organised league with honest rankings, plus the data layer to back up performance. It suits anyone who is tired of casual scorekeeping and wants measurable progress, real standings, and an active community to compete in.",
    href: "/our-products/padeliq",
    intro: "PadelIQ began as the Riyadh Padel Federation, a structured community league built so players could form teams, record real results, and compete through transparent rankings and seasonal tournaments. What started with a small group of regulars chasing more competitive games is now an organised platform built on consistency, ranking integrity, and a strong community spirit. The PadelIQ analytics layer adds the part the scoreboard cannot show, reading movement, positioning, and rally patterns straight from footage so progress becomes something you can actually measure.",
    howItWorks: [{"title": "Join the league", "body": "Get an invite code from an existing member or an admin, then create your account on the platform. The invite model keeps the community trusted and the rankings credible from day one."}, {"title": "Register your team", "body": "Pair up with a partner to form your official league team and start competing together. Every team plays under one identity that carries its record and ranking across the season."}, {"title": "Record and rank", "body": "Submit match results straight from the court after every game. The points engine updates instantly, so your team and player rankings always reflect current competitive standing."}, {"title": "Analyse with PadelIQ", "body": "Feed match footage into PadelIQ to automatically track movement, positioning, and rally patterns. Clubs, coaches, and serious players turn that footage into measurable insight and sharper decisions on court."}],
    faqs: [{"q": "How do I join the league?", "a": "Get an invite code from an existing member or an admin, then create your account on the platform. Once registered, you can pair with a partner and form your team."}, {"q": "Do I need a partner to compete?", "a": "Yes. This is a team-based league, so you pair up with a partner to form your official team, then compete together and climb the leaderboard."}, {"q": "How are rankings calculated?", "a": "Rankings are based on real recorded match results. Every match you log updates your team and player points, so the leaderboard always reflects current competitive standing."}],
  },
];

export function getProduct(slug: string) {
  return products.find((p) => p.slug === slug);
}

// Artwork for the products mega menu, one still per product. It lives here
// rather than on the product record because the record is editable content:
// the database copy is what the site renders and it carries no image field,
// so a product edited in the console would lose its picture. A product with
// no entry here falls back to its initial on its brand colour, which is what
// the menu showed before it had pictures at all.
export const productArt: Record<string, { src: string; width: number; height: number }> = {
  crowdiq: { src: "/crowdiq/showcase.jpg", width: 1200, height: 676 },
  padeliq: { src: "/hero-1.jpg", width: 1280, height: 720 },
};
