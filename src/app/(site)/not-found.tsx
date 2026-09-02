import { NotFoundContent } from "@/components/NotFoundContent";

// notFound() thrown inside the (site) group renders within the site layout,
// which already provides the chrome.
export default function NotFound() {
  return <NotFoundContent />;
}
