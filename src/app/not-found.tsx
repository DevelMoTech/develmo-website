import { NotFoundContent } from "@/components/NotFoundContent";
import { SiteChrome } from "@/components/SiteChrome";

// Handles globally unmatched URLs, which render outside the (site) route group,
// so the public chrome is applied here explicitly.
export default function NotFound() {
  return (
    <SiteChrome>
      <NotFoundContent />
    </SiteChrome>
  );
}
