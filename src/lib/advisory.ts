// The Company Advisory Board, from the owner's page draft of September 2026.
//
// The biographies and the advisory areas are the members' own approved copy
// about real people. Keep them as written: shorten or rephrase only with the
// owner's say so, and never add a credential the draft does not claim.
//
// `linkedin` is empty until the owner supplies each profile URL. The page
// renders the link only when it is set, so an unfilled one cannot ship as a
// dead link, and the same URL becomes the member's sameAs in the Person
// schema once it is there.
//
// This is a typed file, not console content. Unlike services, industries,
// products and the about pages, the board has no `content_entries` entity and
// no editor, so a change here needs a deploy.

export type Advisor = {
  slug: string;
  name: string;
  initials: string;
  role: string;
  bio: string;
  areas: string[];
  linkedin: string;
};

export type BoardPillar = { n: string; title: string; body: string };

export const boardPillars: BoardPillar[] = [
  {
    n: "01",
    title: "Technology Strategy",
    body: "Architecture choices, emerging technologies and long-term technical direction.",
  },
  {
    n: "02",
    title: "Enterprise & Telecom",
    body: "Industry insight for complex enterprise and telecommunications environments.",
  },
  {
    n: "03",
    title: "Cloud & AI Infrastructure",
    body: "Scalable cloud, edge and production-grade AI infrastructure.",
  },
  {
    n: "04",
    title: "Growth & Innovation",
    body: "Strategic input on products, markets and enterprise partnerships.",
  },
];

export const advisors: Advisor[] = [
  {
    slug: "ali-murtaza",
    name: "Ali Murtaza",
    initials: "AM",
    role: "Cloud, AI Infrastructure & Digital Transformation",
    bio: "Ali Murtaza is a senior cloud infrastructure and mobile network architect with more than 17 years of experience across cloud, telecommunications and large-scale digital transformation. His background spans cloud-native infrastructure, telco cloud, edge computing, 5G, NFV/SDN and enterprise architecture. He brings DevelMo strategic guidance on resilient cloud platforms, AI infrastructure, enterprise technology and the practical path from architecture to production at scale.",
    areas: ["Cloud Strategy", "AI Infrastructure", "5G & Edge", "Enterprise Architecture", "Digital Transformation"],
    linkedin: "",
  },
  {
    slug: "muhammad-rashid-anwar",
    name: "Muhammad Rashid Anwar",
    initials: "MRA",
    role: "Telecommunications, AI & Future Networks",
    bio: "Muhammad Rashid Anwar is a telecommunications technology professional with 20 years of industry experience. His expertise spans network architecture, mobile core, cloud-ready telecom platforms, network security and the evolution toward AI-native networks. His recent professional interests include 5G/6G architecture, distributed and edge computing, IoT cybersecurity and the role of telecom operators in emerging AI infrastructure. He advises DevelMo on future networks, telecom innovation, AI infrastructure and enterprise technology strategy.",
    areas: ["Telecommunications", "5G/6G", "AI-Native Networks", "Edge Computing", "Cybersecurity", "Emerging Technology"],
    linkedin: "",
  },
];
