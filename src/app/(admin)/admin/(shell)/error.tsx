"use client";

import { useEffect } from "react";
import { Button } from "@/app/(admin)/_components/ui/Button";
import { ErrorState } from "@/app/(admin)/_components/ui/Basics";

// Route error boundary for console pages: says what failed and offers a retry
// (brief §6.4). The digest identifies the server log entry.
export default function ShellError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin] page error", error);
  }, [error]);
  return (
    <div className="adm-card">
      <ErrorState
        title="This page could not be loaded"
        body={`${error.message || "An unexpected error occurred."}${error.digest ? ` Reference ${error.digest}.` : ""}`}
        action={<Button onClick={() => reset()}>Try again</Button>}
      />
    </div>
  );
}
