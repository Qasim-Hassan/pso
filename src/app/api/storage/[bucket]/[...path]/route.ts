import { NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/server";

const allowedBuckets = new Set(["resource-files", "paper-assets", "content-assets"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path } = await params;

  if (!allowedBuckets.has(bucket)) {
    return new Response("Storage bucket not allowed", { status: 404 });
  }

  const objectPath = path.join("/");
  if (!objectPath || objectPath.includes("..")) {
    return new Response("Storage object not found", { status: 404 });
  }

  const { url } = getSupabaseConfig();
  if (!url) {
    return new Response("Supabase is not configured", { status: 500 });
  }

  const sourceUrl = `${url}/storage/v1/object/public/${bucket}/${objectPath}`;
  const upstream = await fetch(sourceUrl, { cache: "force-cache" });

  if (!upstream.ok || !upstream.body) {
    return new Response("Storage object is not uploaded", { status: upstream.status === 404 ? 404 : 502 });
  }

  const filename = objectPath.split("/").at(-1) ?? "file";
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Type": contentType,
    },
  });
}
