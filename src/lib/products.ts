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
    summary: "PadelIQ pairs a competitive team-based league, the platform behind the Riyadh Padel Federation, with computer-vision analytics that turn ordinary match video into performance data for every player. It finds all four players, follows each one through the match, maps every step onto the real court, and reports distance, speed, court coverage and work rate in real units.",
    initial: "P",
    bg: "var(--teal)",
    fg: "#042521",
    badge: "live",
    features: ["Tracks all four players and keeps each identity locked for the whole match.","Maps the camera view onto the real court, so distance and speed are reported in metres and metres per second.","Live stat card over every player: distance, average speed, active time and court coverage.","Bird's eye mini map that draws every player's movement path as the match plays.","Movement stability score that shows who keeps a steady pace and who plays stop and start.","AI coach that turns the numbers into three short, practical tips every few seconds.","Filters out reflections in the glass walls, a common source of false detections on padel courts.","Exports every session as structured data for coaches and clubs.","Form official league teams, record results from the court, and climb a leaderboard that updates on every match."],
    stats: ["110+ active members","50+ teams","2+ competitive seasons","540 points top player season tally"],
    forWho: "Built for competitive padel players, partnered teams, clubs, and coaches who want a properly organised league with honest rankings, plus the data layer to back up performance. It suits anyone who is tired of casual scorekeeping and wants measurable progress, real standings, and an active community to compete in.",
    href: "/our-products/padeliq",
    intro: "PadelIQ began as the Riyadh Padel Federation, a structured community league built so players could form teams, record real results, and compete through transparent rankings and seasonal tournaments. The analytics layer adds the part the scoreboard cannot show, measuring how far each player runs, how fast, and how much of the court they cover, straight from match video.",
    howItWorks: [{"title":"Record","body":"A standard match video from one fixed camera behind the court."},{"title":"Calibrate once","body":"Mark the four court corners. PadelIQ maps the camera view onto the real 10 m by 20 m court, so every result is in metres, not pixels."},{"title":"Detect and track","body":"A deep learning detector finds the players in every frame and a tracker with appearance matching keeps each identity steady. The four players are locked in as P1 to P4 by court side, and reflections in the glass walls are filtered out."},{"title":"Measure","body":"Movement is turned into per player metrics frame by frame."},{"title":"Coach","body":"Every five seconds a summary of the metrics goes to a language model, which returns three short coaching tips shown on screen."}],
    faqs: [{"q":"How do I join the league?","a":"Get an invite code from an existing member or an admin, then create your account on the platform. Once registered, you can pair with a partner and form your team."},{"q":"What do I need to analyse a match?","a":"A recorded match video from one fixed camera behind the court, and a one-off calibration where you mark the four court corners. PadelIQ works on recorded video rather than a live club camera stream."},{"q":"How are rankings calculated?","a":"Rankings are based on real recorded match results. Every match you log updates your team and player points, so the leaderboard always reflects current competitive standing."}],
  },
  {
    slug: "develmo-gpt",
    title: "DevelMoGPT",
    tagline: "Your company's private AI assistant. Your documents never leave your servers.",
    summary: "DevelMoGPT is a private AI chat assistant that runs entirely on your own hardware. Upload your company documents and your team can ask questions in plain language and get answers drawn from those documents, with the source files listed on every reply. Nothing is sent to OpenAI or any other outside AI service.",
    initial: "G",
    bg: "var(--blue)",
    fg: "#04243a",
    badge: "soon",
    features: ["Runs fully on premises. The language model, the search index and the chat history all stay on your hardware.","Answers grounded in your own documents, with the source documents listed on every reply.","Semantic search that matches on meaning, so people can ask in their own words.","Reads PDF, Word, Excel, CSV, PowerPoint and text files.","Admin console to upload, browse and search the knowledge base.","Secure sign in, passwords stored as secure hashes, and separate user and admin roles.","Saved, searchable conversations for every user, so work picks up where it left off.","No per message API fees. Once installed, it runs on your own GPU."],
    forWho: "Built for teams whose documents cannot leave their own network: legal, finance, healthcare, public sector and any organisation with data residency rules. It suits anyone who wants the convenience of asking an assistant in plain language without handing their files to an outside AI provider.",
    href: "/our-products/develmo-gpt",
    howItWorks: [{"title":"Upload","body":"Admins add documents in the admin console or paste text directly. PDF, Word, Excel, CSV, PowerPoint and plain text are supported."},{"title":"Index","body":"Each document is converted to text, turned into an embedding by a local embedding model and stored in a vector index on your own server."},{"title":"Ask","body":"A user types a question in the chat window."},{"title":"Retrieve","body":"DevelMoGPT finds the three most relevant documents by meaning, not just keywords."},{"title":"Answer","body":"A language model running locally writes the answer from those documents and the recent conversation, then lists the sources it used with a confidence score."}],
    faqs: [{"q":"Does any of our data leave our servers?","a":"No. The language model, the document index and the chat history all run on your own hardware. Nothing is sent to an outside AI provider."},{"q":"What files can it read?","a":"PDF, Word, Excel, CSV, PowerPoint and plain text. Admins can also paste text straight in."},{"q":"What hardware do we need?","a":"A server or workstation with an NVIDIA GPU, 8 GB of video memory minimum and 16 GB recommended, and at least 16 GB of RAM. DevelMo can advise on sizing for your team."}],
  },
  {
    slug: "ai-voice-agent",
    title: "AI Voice Agent",
    tagline: "Listen. Understand. Act.",
    summary: "An AI voice agent that talks to your customers in their language and gets real work done in your CRM, calendar and systems. It answers and makes business calls in real time and turns each conversation into a CRM update, a booked meeting or a workflow action inside the systems you already run.",
    initial: "V",
    bg: "var(--teal)",
    fg: "#042521",
    badge: "soon",
    features: ["Holds conversations in multiple languages, so one system can serve a diverse customer base.","Responds in real time, with minimal delay between caller and agent.","Adapts to what the caller actually says instead of following a rigid script.","Identifies requirements, asks qualifying questions and decides the right next step.","Moves qualified conversations into booked meetings through connected calendars.","Hands off to a person the moment a conversation needs human judgment."],
    forWho: "Built for sales leaders, customer support heads and operations managers in businesses that live on the phone: clinics, real estate agencies, recruiters, consultancies and service providers across Saudi Arabia, the wider Gulf, the UK and the USA.",
    href: "/our-products/ai-voice-agent",
    intro: "Phone conversations do not scale. Businesses depend on calls for sales, support, appointments, recruitment and follow ups, and every extra call needs another person. The agent is a voice layer on top of the stack you already run, not another platform to migrate into: connect the AI to your systems, not the other way around.",
    howItWorks: [{"title":"Connect","body":"The agent is joined to your phone line and to the business systems behind it."},{"title":"Converse","body":"It understands what the caller wants and asks the questions that decide what happens next."},{"title":"Access","body":"It reads from your CRM, your own business data, your APIs and your calendar during the live call."},{"title":"Act","body":"It books the meeting, updates the record or triggers the workflow."},{"title":"Escalate","body":"It hands the call to the right person when a conversation needs human judgment."}],
    faqs: [{"q":"Do we have to move our systems onto a new platform?","a":"No. The agent is a voice layer on top of the stack you already run. It connects to your CRM, databases, APIs, calendars and automation tools rather than replacing them."},{"q":"What can the agent actually do with our systems?","a":"Whatever you allow. You decide which systems it can reach, what information it may retrieve, which actions it may perform, what data passes between systems, and when a person has to approve something."},{"q":"What happens when a call needs a person?","a":"The agent hands off. Escalation is one of the defined outcomes of a call, alongside an appointment, a CRM update, an API action and a notification."}],
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
// DevelMoGPT and the AI Voice Agent have no artwork yet, and the product
// briefs are explicit that a plain card is right until real screenshots
// exist. They fall back to their initial on their brand colour.
export const productArt: Record<string, { src: string; width: number; height: number }> = {
  crowdiq: { src: "/crowdiq/showcase.jpg", width: 1200, height: 676 },
  padeliq: { src: "/hero-1.jpg", width: 1280, height: 720 },
};
