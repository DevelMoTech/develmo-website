export const site = {
  name: "DevelMo",
  url: "https://develmo.com",
  email: "info@develmo.com",
  tagline: "AI That Fits Your Business",
  description:
    "DevelMo helps startups, enterprises and growing teams build intelligent products, automate operations and turn live data into decisions, through AI, computer vision, cloud and custom software.",
  phones: ["+966 55 1028874", "+61 480 008104", "+92 331 647636"],
  address: {
    line: "20 Wenlock Road",
    city: "London",
    region: "England",
    postcode: "N1 7GU",
    country: "United Kingdom",
  },
  social: [
    { name: "LinkedIn", href: "https://www.linkedin.com/company/develmo", icon: "linkedin" },
    { name: "Instagram", href: "https://www.instagram.com/official_develmo/", icon: "instagram" },
    { name: "Facebook", href: "https://www.facebook.com/Develmo/", icon: "facebook" },
    { name: "X", href: "https://x.com/develmo_com", icon: "x" },
    { name: "YouTube", href: "https://www.youtube.com/@DevelMo-tech", icon: "youtube" },
  ],
  offices: [
    { code: "UK", name: "United Kingdom", desc: "20 Wenlock Road, London N1 7GU. Registered HQ." },
    { code: "AU", name: "Australia", desc: "Regional delivery and client partnership across APAC." },
    { code: "SA", name: "Saudi Arabia", desc: "Middle East presence for enterprise and public sector." },
    { code: "PK", name: "Pakistan", desc: "Core engineering and AI delivery center." },
  ],
  nav: [
    { label: "What We Do", href: "/what-we-do" },
    { label: "Who We Help", href: "/who-we-help" },
    { label: "Our Products", href: "/our-products" },
    { label: "Who We Are", href: "/who-we-are" },
    { label: "Insights", href: "/our-blogs" },
  ],
} as const;

export const stats = [
  { value: "23+", label: "Countries served" },
  { value: "90-95%", label: "CrowdIQ detection accuracy" },
  { value: "4", label: "Products shipped" },
  { value: "Live", label: "Real-time on-camera inference" },
];

export const tech = [
  "PyTorch", "TensorFlow", "LLMs & RAG", "OpenCV", "YOLO / RF-DETR", "Next.js",
  "Node & Python", "AWS", "GCP", "Azure", "Docker & K8s", "MLOps", "Kafka", "PostgreSQL",
];
