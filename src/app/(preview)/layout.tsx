import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";

// Authenticated draft previews render inside the real public chrome, not the
// admin shell, so what an editor sees is exactly what a visitor would see.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <SiteChrome>{children}</SiteChrome>;
}
