export type ServiceDetail = {
  outcomes: string[];
  capabilities: { title: string; desc: string }[];
  tech: string[];
  useCases: string[];
};

export const serviceDetails: Record<string, ServiceDetail> = {
  "ai-data-solutions": {
    outcomes: [
      "Ship generative AI features your users actually trust",
      "Forecast demand, churn and risk with models built on your data",
      "Turn scattered data into one reliable source of truth",
    ],
    capabilities: [
      { title: "Generative AI & LLMs", desc: "RAG assistants, copilots and LLM integration wired to your data and tools." },
      { title: "Predictive analytics", desc: "Forecasting, scoring and recommendation models built on your history." },
      { title: "NLP & chatbots", desc: "Document understanding, search and conversational interfaces." },
      { title: "Data engineering & BI", desc: "Pipelines, warehouses and dashboards that keep decisions current." },
    ],
    tech: ["Python", "PyTorch", "LLMs & RAG", "LangChain", "Snowflake", "dbt", "Power BI"],
    useCases: ["Customer support copilots", "Demand and churn forecasting", "Document automation", "Executive BI dashboards"],
  },
  "computer-vision-automation": {
    outcomes: [
      "Turn existing camera feeds into measurable insight",
      "Automate manual inspection and monitoring",
      "Cut review time with detection and real-time alerts",
    ],
    capabilities: [
      { title: "Object & video analytics", desc: "Detection, tracking and counting on live or recorded video." },
      { title: "Facial recognition & biometrics", desc: "Identity and access use cases with privacy-aware design." },
      { title: "Visual search", desc: "Find products and assets by image, not keywords." },
      { title: "Workflow automation", desc: "Trigger actions and alerts from what the model sees." },
    ],
    tech: ["OpenCV", "YOLO / RF-DETR", "PyTorch", "ONNX", "NVIDIA Triton", "Edge AI"],
    useCases: ["Retail footfall analytics", "Quality inspection", "Safety and compliance monitoring", "Smart building occupancy"],
  },
  "web-mobile-development": {
    outcomes: [
      "Launch scalable platforms without growing headcount",
      "Ship SaaS products customers can rely on",
      "Replace brittle internal tools with real software",
    ],
    capabilities: [
      { title: "SaaS & platforms", desc: "Multi-tenant products, portals and marketplaces." },
      { title: "Web & mobile apps", desc: "Fast, accessible apps on modern frameworks." },
      { title: "UI/UX design", desc: "Clear, conversion-focused interfaces." },
      { title: "APIs & backends", desc: "Documented, secure services that scale." },
    ],
    tech: ["Next.js", "React Native", "Node", "Python", "PostgreSQL", "GraphQL"],
    useCases: ["Customer portals", "Internal operations tools", "Marketplaces", "Mobile apps"],
  },
  "cloud-devops": {
    outcomes: [
      "Deploy faster with fewer failures",
      "Run AI workloads reliably in production",
      "Cut cloud cost and manual operations",
    ],
    capabilities: [
      { title: "Cloud strategy & infra", desc: "Architecture, IaC and well-architected reviews." },
      { title: "CI/CD", desc: "Automated build, test and release pipelines." },
      { title: "MLOps", desc: "Training, serving and monitoring for models in production." },
      { title: "Observability", desc: "Logging, metrics and alerting you can act on." },
    ],
    tech: ["AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "GitHub Actions"],
    useCases: ["Cloud migration", "ML model serving", "Release automation", "Cost optimization"],
  },
  "cybersecurity-emerging-tech": {
    outcomes: [
      "Detect threats earlier with AI",
      "Adopt emerging tech with a clear, costed plan",
      "Protect data across your whole stack",
    ],
    capabilities: [
      { title: "AI-powered cybersecurity", desc: "Anomaly detection and automated response." },
      { title: "Blockchain & digital twins", desc: "Traceability and simulation where they pay off." },
      { title: "IoT & edge intelligence", desc: "Insight at the edge, close to the data." },
      { title: "Security reviews", desc: "Hardening, audits and secure delivery practices." },
    ],
    tech: ["Python", "SIEM", "Smart contracts", "MQTT", "Edge AI"],
    useCases: ["Threat detection", "Supply-chain traceability", "Connected devices", "Security hardening"],
  },
  "staff-augmentation": {
    outcomes: [
      "Add specialist talent in days, not months",
      "Scale teams up or down with demand",
      "Keep delivery moving without hiring overhead",
    ],
    capabilities: [
      { title: "On-demand engineers", desc: "AI, ML, DevOps and cloud specialists ready to ship." },
      { title: "Data experts", desc: "Data engineers and analysts who deliver." },
      { title: "Dedicated teams", desc: "A full squad aligned to your roadmap." },
      { title: "Tech consultants", desc: "Architecture and delivery guidance." },
    ],
    tech: ["AI/ML", "DevOps", "Cloud", "Data", "Full-stack"],
    useCases: ["Project surge capacity", "Hard-to-hire AI roles", "Dedicated product teams", "Architecture support"],
  },
};
