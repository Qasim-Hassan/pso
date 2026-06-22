import { NextResponse } from "next/server";
import { adminSubjects } from "@/lib/admin/types";
import { canManageResourceSubject, getAdminContext, hasAdminAccess } from "@/lib/admin/auth";
import { uploadResourceFileToStorage } from "@/lib/admin/content";
import { slugify } from "@/lib/admin/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  const context = await getAdminContext();
  if (!hasAdminAccess(context)) return jsonError("Admin access is required.", 401);

  const formData = await request.formData();
  const subject = String(formData.get("subject") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const id = String(formData.get("id") ?? "").trim();

  if (!adminSubjects.includes(subject as (typeof adminSubjects)[number])) {
    return jsonError("Choose a valid resource subject.");
  }
  if (!canManageResourceSubject(context, subject)) {
    return jsonError("You are not allowed to upload resources for this subject.", 403);
  }
  if (!id && title.length < 3) {
    return jsonError("Enter a title before uploading the resource file.");
  }

  const resourceId = id || `${slugify(subject)}-${slugify(title)}`;
  if (!resourceId) return jsonError("Resource needs a valid title before it can be saved.");

  try {
    const upload = await uploadResourceFileToStorage(subject, resourceId, formData.get("resourceFile"));
    return NextResponse.json({
      ok: true,
      resourceId,
      localUrl: upload.localUrl,
      sizeBytes: upload.sizeBytes,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Upload failed. Please try again.", 500);
  }
}
