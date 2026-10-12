import { useEffect, useId, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";

import { loadGeoGebra } from "@/lib/geogebra";

interface GeoGebraEmbedProps {
  fileUrl: string;
  title: string;
  className?: string;
}

export function GeoGebraEmbed({ fileUrl, title, className = "h-[70vh]" }: GeoGebraEmbedProps) {
  const reactId = useId();
  const containerId = `ggb-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    setLoading(true);
    setError("");

    loadGeoGebra()
      .then((GGBApplet) => {
        if (disposed || !containerRef.current) return;
        const width = Math.max(containerRef.current.clientWidth, 640);
        const height = Math.max(containerRef.current.clientHeight, 480);
        const applet = new GGBApplet({
          id: `${containerId}-applet`,
          appName: "classic",
          filename: fileUrl,
          width,
          height,
          showToolBar: true,
          showMenuBar: true,
          showAlgebraInput: true,
          showResetIcon: true,
          enableRightClick: true,
          enableShiftDragZoom: true,
          allowUpscale: true,
          scaleContainerClass: `${containerId}-scale`,
          appletOnLoad: () => {
            if (!disposed) setLoading(false);
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
      container.innerHTML = "";
    };
  }, [containerId, fileUrl]);

  return (
    <div className={`relative overflow-hidden bg-white ${className} ${containerId}-scale`} aria-label={title}>
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
