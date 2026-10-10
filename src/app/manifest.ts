import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bookmap",
    short_name: "Bookmap",
    description: "Turn a book you've read into a map of its ideas, then test yourself on it.",
    start_url: "/shelf",
    display: "standalone",
    background_color: "#1B1026",
    theme_color: "#1B1026",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
