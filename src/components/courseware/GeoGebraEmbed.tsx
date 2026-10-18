import { useEffect, useId, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";

import { loadGeoGebra, type GeoGebraApi } from "@/lib/geogebra";

interface GeoGebraEmbedProps {
  fileUrl: string;
  title: string;
  className?: string;
  backgroundColor?: string;
  compact?: boolean;
}

export function GeoGebraEmbed({ fileUrl, title, className = "h-[70vh]", backgroundColor, compact = false }: GeoGebraEmbedProps) {
  const reactId = useId();
  const containerId = `ggb-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GeoGebraApi | null>(null);
  const backgroundRef = useRef(backgroundColor);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    backgroundRef.current = backgroundColor;
    if (backgroundColor) apiRef.current?.setGraphicsOptions?.(1, { bgColor: backgroundColor });
  }, [backgroundColor]);

  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container) return;
    apiRef.current = null;
    container.innerHTML = "";
    setLoading(true);
    setError("");

    loadGeoGebra()
      .then((GGBApplet) => {
        if (disposed || !containerRef.current) return;
        const width = Math.max(containerRef.current.clientWidth, 1);
        const height = Math.max(containerRef.current.clientHeight, 1);
        const applet = new GGBApplet({
          id: `${containerId}-applet`,
          appName: "classic",
          filename: fileUrl,
          width,
          height,
          ...(compact ? { perspective: "G" } : {}),
          showToolBar: !compact,
          showMenuBar: !compact,
          showAlgebraInput: !compact,
          showResetIcon: !compact,
          enableRightClick: true,
          enableShiftDragZoom: true,
          allowUpscale: true,
          scaleContainerClass: `${containerId}-scale`,
          appletOnLoad: (api: GeoGebraApi) => {
            if (disposed) return;
            apiRef.current = api;
            if (backgroundRef.current) api.setGraphicsOptions?.(1, { bgColor: backgroundRef.current });
            setLoading(false);
          },
        }, true);
        applet.inject(containerId);
      })
      .catch((cause) => {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : "GeoGebra 在线组件加载失败");
        setLoading(false);
      });

    return () => {
      disposed = true;
      apiRef.current = null;
      container.innerHTML = "";
    };
  }, [containerId, fileUrl, compact]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    let lastWidth = 0;
    let lastHeight = 0;
    const observer = new ResizeObserver(() => {
      const width = Math.round(container.clientWidth);
      const height = Math.round(container.clientHeight);
      if (width > 0 && height > 0 && (width !== lastWidth || height !== lastHeight)) {
        lastWidth = width;
        lastHeight = height;
        apiRef.current?.setSize?.(width, height);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fileUrl]);

  return (
    <div className={`relative overflow-hidden ${className} ${containerId}-scale`} style={{ backgroundColor }} aria-label={title}>
      <div id={containerId} ref={containerRef} className="w-full h-full" />
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90">
          <div className="flex items-center gap-2 text-sm text-ink-600">
            <Spinner size={20} />加载 GeoGebra 课件...
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-mist/60 p-6 text-center text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
