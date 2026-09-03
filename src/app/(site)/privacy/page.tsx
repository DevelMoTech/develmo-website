import type { Metadata } from "next";
import { LegalPage } from "@/components/Legal";
import { pageMeta } from "@/lib/meta";

export const generateMetadata = (): Promise<Metadata> => pageMeta({
  title: "Privacy Policy",
  description: "How DevelMo collects, uses and protects your personal data.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="June 2026"
      intro="DevelMo respects your privacy. This policy explains what personal data we collect, how we use it, and the choices you have. It applies to this website and the enquiries you send us."
      sections={[
        {
          h: "Information we collect",
          p: [
            "When you submit the contact form we collect the details you provide, such as your name, email, phone, company, budget, service interest and message.",
            "We also collect basic, privacy-friendly analytics about how the site is used, such as pages viewed and general location, to improve the experience.",
          ],
        },
        {
          h: "How we use your information",
          p: [
            "We use your enquiry details only to respond to you and to discuss the project you contacted us about.",
            "We do not sell your personal data. We use analytics in aggregate to understand and improve the site.",
          ],
        },
        {
          h: "Sharing",
          p: [
            "We share data only with service providers that help us operate the site and respond to enquiries, under appropriate agreements, and where required by law.",
          ],
        },
        {
          h: "Your rights",
          p: [
            "You can ask us to access, correct or delete the personal data we hold about you. To make a request, email info@develmo.com.",
          ],
        },
        {
          h: "Contact",
          p: ["Questions about this policy can be sent to info@develmo.com."],
        },
      ]}
    />
  );
}
