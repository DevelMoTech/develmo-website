import type { Metadata } from "next";
import { withSeoOverride } from "@/lib/meta";
import { LegalPage } from "@/components/Legal";

export const generateMetadata = (): Promise<Metadata> => withSeoOverride("/cookies", {
  title: "Cookie Policy",
  description: "How DevelMo uses cookies and similar technologies on this website.",
});

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="June 2026"
      intro="This policy explains how DevelMo uses cookies and similar technologies on this website."
      sections={[
        {
          h: "What cookies we use",
          p: [
            "We use essential cookies needed for the site to function, and privacy-friendly analytics cookies that help us understand how the site is used.",
          ],
        },
        {
          h: "Managing cookies",
          p: [
            "You can control or delete cookies through your browser settings. Disabling some cookies may affect how parts of the site work.",
          ],
        },
        {
          h: "Contact",
          p: ["Questions about cookies can be sent to info@develmo.com."],
        },
      ]}
    />
  );
}
