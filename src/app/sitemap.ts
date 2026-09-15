import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/arcade", "/launch"].map((p) => ({ url: `${site.url}${p}`, changeFrequency: "hourly", priority: p === "/" ? 1 : 0.8 }));
}
