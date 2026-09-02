import { apiError } from "@/lib/auth/api";
import type { JobError } from "./jobs";

export function jobErrorResponse(err: JobError) {
  if (err.code === "not_found") return apiError(404, "not_found");
  if (err.code === "has_applications") return apiError(409, "has_applications", { count: err.count });
  return apiError(409, "slug_taken", { issues: [{ path: "slug", message: "That slug is already used by another job" }] });
}
