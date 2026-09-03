// Mirror of the redirects in next.config.ts. Those run before the proxy, so
// a database rule with the same source would never be reached; the manager
// checks new rules against this list. tests/unit/seo.test.ts asserts the two
// lists are identical so they cannot drift apart.
export const STATIC_REDIRECTS: { source: string; destination: string; permanent: boolean }[] = [
  { source: "/home", destination: "/", permanent: true },
  { source: "/about", destination: "/who-we-are", permanent: true },
  { source: "/about-us", destination: "/who-we-are", permanent: true },
  { source: "/services", destination: "/what-we-do", permanent: true },
  { source: "/industries", destination: "/who-we-help", permanent: true },
  { source: "/products", destination: "/our-products", permanent: true },
  { source: "/crowdiq", destination: "/our-products/crowdiq", permanent: true },
  { source: "/blog", destination: "/our-blogs", permanent: true },
  { source: "/careers", destination: "/jobs", permanent: true },
  { source: "/contact", destination: "/contact-develmo", permanent: true },
  { source: "/contact-us", destination: "/contact-develmo", permanent: true },
  { source: "/our-products/rpf-padel-league", destination: "/our-products/padeliq", permanent: true },
];
