"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";

type QuestionImageProps = {
  title: string;
  url: string | null;
  unavailableMessage?: string;
};

type RenderStatus = "loading" | "ready" | "error";

export function QuestionImage({ title, url, unavailableMessage = "Question image is not available yet." }: QuestionImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderState, setRenderState] = useState<{ source: string | null; status: RenderStatus }>({ source: null, status: "loading" });
  const status: RenderStatus = !url ? "error" : renderState.source === url ? renderState.status : "loading";

  useEffect(() => {
    if (!url) {
      return;
    }

    const pdfUrl = url;
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let renderTask: RenderTask | null = null;
    let observer: ResizeObserver | null = null;

    async function loadAndRender() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

        loadingTask = pdfjs.getDocument({ url: pdfUrl });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const renderPage = async () => {
          const container = containerRef.current;
          const canvas = canvasRef.current;
          if (!container || !canvas || cancelled) return;

          renderTask?.cancel();

          const naturalViewport = page.getViewport({ scale: 1 });
          const availableWidth = Math.max(container.clientWidth, 1);
          const cssScale = availableWidth / naturalViewport.width;
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale: cssScale * pixelRatio });

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = `${Math.round(viewport.width / pixelRatio)}px`;
          canvas.style.height = `${Math.round(viewport.height / pixelRatio)}px`;

          const nextRenderTask = page.render({ canvas, viewport, background: "rgb(255,255,255)" });
          renderTask = nextRenderTask;
          await nextRenderTask.promise;

          if (!cancelled) setRenderState({ source: pdfUrl, status: "ready" });
        };

        await renderPage();
        observer = new ResizeObserver(() => void renderPage());
        if (containerRef.current) observer.observe(containerRef.current);
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          setRenderState({ source: pdfUrl, status: "error" });
        }
      }
    }

    void loadAndRender();

    return () => {
      cancelled = true;
      observer?.disconnect();
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [url]);

  return (
    <div ref={containerRef} className="relative min-h-36 overflow-hidden rounded-md border border-navy/10 bg-white">
      {status === "loading" ? <div className="absolute inset-0 animate-pulse bg-navy/5" aria-hidden="true" /> : null}
      {status === "error" ? <div className="p-5 text-sm font-semibold leading-6 text-charcoal/70">{unavailableMessage}</div> : null}
      <canvas ref={canvasRef} role="img" aria-label={title} className={status === "error" ? "hidden" : "block max-w-full"} />
    </div>
  );
}
