import { apiError } from "@/lib/auth/api";
import type { PostError } from "./posts";

// Field-level post errors surface as zod-style issues so the editor
// highlights the right input.
export function postErrorResponse(err: PostError) {
  if (err.code === "not_found" || err.code === "revision_not_found") return apiError(404, err.code);
  const message =
    err.code === "slug_taken"
      ? "That slug is already used by another post of this type"
      : err.code === "media_alt"
        ? "Add alt text to this image in the media library before attaching it"
        : "That image no longer exists";
  return apiError(err.code === "slug_taken" ? 409 : 400, err.code, err.field ? { issues: [{ path: err.field, message }] } : {});
}
