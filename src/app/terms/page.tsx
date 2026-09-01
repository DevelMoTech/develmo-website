import type { Metadata } from "next";
import { LegalPage } from "@/components/Legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of the DevelMo website.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="June 2026"
      intro="These terms govern your use of the DevelMo website. By using the site you agree to them."
      sections={[
        {
          h: "Use of the site",
          p: [
            "You may use this site for lawful purposes only. You agree not to misuse the site, attempt to disrupt it, or access it in ways that are not permitted.",
          ],
        },
        {
          h: "Intellectual property",
          p: [
            "The content, branding and design on this site are owned by DevelMo or its licensors and may not be copied or reused without permission.",
          ],
        },
        {
          h: "No warranties",
          p: [
            "The site is provided on an as-is basis. While we work to keep it accurate and available, we do not guarantee it will always be error-free or uninterrupted.",
          ],
        },
        {
          h: "Limitation of liability",
          p: [
            "To the extent permitted by law, DevelMo is not liable for indirect or consequential loss arising from use of this site.",
          ],
        },
        {
          h: "Changes",
          p: ["We may update these terms from time to time. The latest version will always be posted here."],
        },
      ]}
    />
  );
}
