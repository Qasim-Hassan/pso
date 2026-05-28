import { NextRequest } from "next/server";
import { questionPdfMetadata } from "@/lib/question-pdf-paths";
import { getSupabaseConfig } from "@/lib/supabase/server";

const allowedPdfPaths = new Set<string>(Object.values(questionPdfMetadata).map((item) => item.cropPath));

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const cropPath = path.join("/");

  if (!allowedPdfPaths.has(cropPath)) {
    return new Response("Question PDF not found", { status: 404 });
  }

  const { url } = getSupabaseConfig();
  if (!url) {
    return new Response("Supabase is not configured", { status: 500 });
  }

  const sourceUrl = `${url}/storage/v1/object/public/question-pdfs/${cropPath}`;
  const upstream = await fetch(sourceUrl, { cache: "force-cache" });

  if (!upstream.ok || !upstream.body) {
    return new Response("Question PDF is not uploaded", { status: upstream.status === 404 ? 404 : 502 });
  }

  const filename = cropPath.split("/").at(-1) ?? "question.pdf";
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Type": "application/pdf",
    },
  });
}
