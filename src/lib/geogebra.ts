export interface GeoGebraApi {
  getBase64(callback: (value: string) => void): void;
  remove(): void;
  setGraphicsOptions?(viewId: number, options: { bgColor: string }): void;
  setSize?(width: number, height: number): void;
}

export interface GeoGebraApplet {
  inject(elementId: string): void;
}

export interface GeoGebraAppletConstructor {
  new(parameters: Record<string, unknown>, useBrowserForJavaScript?: boolean): GeoGebraApplet;
}

declare global {
  interface Window {
    GGBApplet?: GeoGebraAppletConstructor;
  }
}

let loader: Promise<GeoGebraAppletConstructor> | null = null;

export function loadGeoGebra(): Promise<GeoGebraAppletConstructor> {
  if (window.GGBApplet) return Promise.resolve(window.GGBApplet);
  if (loader) return loader;
  loader = new Promise<GeoGebraAppletConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-inteschool-geogebra="true"]');
    const script = existing || document.createElement("script");
    const loaded = () => window.GGBApplet
      ? resolve(window.GGBApplet)
      : reject(new Error("GeoGebra 加载器不可用"));
    const failed = () => reject(new Error("GeoGebra 在线组件加载失败"));
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.src = "https://www.geogebra.org/apps/deployggb.js";
      script.async = true;
      script.dataset.inteschoolGeogebra = "true";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    loader = null;
    document.querySelector('script[data-inteschool-geogebra="true"]')?.remove();
    throw error;
  });
  return loader;
}

export function geogebraFileFromBase64(value: string, title: string): File {
  if (!value) throw new Error("GeoGebra 未返回有效的课件内容");
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const filename = [...title.trim()].map((char) => char.charCodeAt(0) < 32 || /[\\\\/:*?"<>|]/.test(char) ? "_" : char).join("").slice(0, 100) || "GeoGebra";
  return new File([bytes], filename + ".ggb", { type: "application/vnd.geogebra.file" });
}

export function exportGeoGebraFile(api: GeoGebraApi, title: string): Promise<File> {
  return new Promise((resolve, reject) => {
    try {
      api.getBase64((base64) => {
        try {
          resolve(geogebraFileFromBase64(base64, title));
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
