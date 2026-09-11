"use client";

import { MAX_UPLOAD_BYTES } from "@/lib/images";
import type { MediaView } from "@/lib/admin/media";
import { describeError } from "../api-client";

// Shared by the media library and the image picker, so a file chosen in the
// post editor goes through exactly the same request, limits and messages as
// one dropped on the library page.

export const UPLOAD_ERRORS: Record<string, string> = {
  svg_rejected: "SVG files are not accepted: they can carry scripts. Export a PNG or JPEG instead.",
  unsupported_type: "Only JPEG, PNG, GIF and WebP images are accepted. The file's bytes decide, not its name.",
  too_large: `Larger than the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit.`,
  empty: "The file is empty.",
  type_mismatch: "A replacement must be the same format as the original so the URL keeps working.",
};

export function uploadMessage(status: number, code?: string): string {
  return (code && UPLOAD_ERRORS[code]) || describeError(status, code);
}

export type UploadResult = { status: number; data: { ok: boolean; error?: string; media?: MediaView; issues?: { path: string; message: string }[] } };

// XMLHttpRequest for upload progress; fetch has none.
export function upload(url: string, form: FormData, csrf: string, onProgress: (pct: number) => void): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("x-csrf-token", csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: UploadResult["data"] = { ok: false, error: "bad_response" };
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => resolve({ status: 0, data: { ok: false, error: "network" } });
    xhr.send(form);
  });
}

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/gif,image/webp";
export const UPLOAD_LIMIT_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
