export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO
  category: string;
  author: string;
  body: string[];
};

export const posts: Post[] = [
  {
    slug: "turn-cameras-into-measurable-insight",
    title: "Turn existing cameras into measurable business insight",
    excerpt:
      "Most CCTV records footage no one watches. Here is how computer vision turns the cameras you already have into footfall, dwell and behavior analytics.",
    date: "2026-05-28",
    category: "Computer Vision",
    author: "DevelMo Team",
    body: [
      "Almost every store, venue and public space is already covered by cameras. Yet most of that footage is only ever reviewed after something goes wrong. The information about how people actually move, queue and dwell is sitting in the stream, unused.",
      "Modern computer vision changes the economics. Instead of replacing hardware, a detection model connects to the existing RTSP, ONVIF or HTTP feed and converts each frame into structured data: how many people entered, where they spent time, and how that compares to last week.",
      "The result is not surveillance, it is operations data. Teams use it to staff for peak hours, test a new layout, and measure whether a change actually moved the numbers. That is exactly what CrowdIQ is built to do, with privacy-aware deployment in the cloud, on-premise or at the edge.",
      "The takeaway: you probably do not need more cameras. You need a layer that explains the ones you have.",
    ],
  },
  {
    slug: "what-ai-that-fits-means",
    title: "What \"AI that fits\" actually means in practice",
    excerpt:
      "Off-the-shelf AI rarely matches how a business really works. Fitting AI to your operations, data and goals is what makes it stick.",
    date: "2026-05-12",
    category: "AI Strategy",
    author: "DevelMo Team",
    body: [
      "It is easy to add an AI feature. It is much harder to add one that people keep using. The difference is usually fit: whether the model, the data and the workflow match how the business actually operates.",
      "Fitting AI starts with the outcome, not the technology. We look at the decision a team makes every day, the data they already have, and the smallest change that would make that decision faster or better. Only then do we choose between an LLM, a vision model, a forecast or simple automation.",
      "This is why custom usually beats generic for core operations. A template assumes an average business. Your business is not average, and the gap shows up the moment real users touch it.",
      "Fit is also what makes AI maintainable. When a solution maps cleanly onto a real workflow, it is easier to measure, easier to trust and easier to hand over.",
    ],
  },
  {
    slug: "shipping-ai-without-breaking-production",
    title: "Shipping AI features without breaking production",
    excerpt:
      "Models behave differently in the lab and in production. A few MLOps habits keep AI features reliable once real users arrive.",
    date: "2026-04-30",
    category: "MLOps",
    author: "DevelMo Team",
    body: [
      "A model that scores well in a notebook can still fail in production. Inputs drift, latency matters, and edge cases arrive that the training set never saw. Treating AI like any other production system is what keeps it dependable.",
      "That means versioning models and data, serving behind a clear interface, and monitoring quality the same way you monitor uptime. When accuracy drifts, you should find out from a dashboard, not from a customer.",
      "CI/CD and MLOps pipelines make this routine: automated tests on every change, staged rollouts, and a fast path to roll back. The goal is boring, predictable releases, even when the thing being released is a model.",
      "Done well, this is invisible. Users just see a feature that keeps working.",
    ],
  },
];

export function getPost(slug: string) {
  return posts.find((p) => p.slug === slug);
}

export function formatDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
