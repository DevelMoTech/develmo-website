import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { addSubmissionNote } from "@/lib/admin/submissions";
import { submissionNoteSchema } from "@/lib/schemas/submission";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "submissions:write", schema: submissionNoteSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const note = await addSubmissionNote(body, { user: auth.user, ipHash });
  if (!note) return apiError(404, "not_found");
  return apiOk({ id: note.id });
});
