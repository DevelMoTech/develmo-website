import { adminRoute, apiError, apiOk } from "@/lib/auth/api";
import { addNote } from "@/lib/admin/applications";
import { applicationNoteSchema } from "@/lib/schemas/job";

export const runtime = "nodejs";

export const POST = adminRoute({ auth: "required", permission: "submissions:write", schema: applicationNoteSchema }, async ({ auth, body, ipHash }) => {
  if (!auth) return apiError(401, "unauthenticated");
  const note = await addNote(body.id, body.body, { user: auth.user, ipHash });
  if (!note) return apiError(404, "not_found");
  return apiOk({ id: note.id });
});
