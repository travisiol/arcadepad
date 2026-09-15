import type { Metadata, Viewport } from "next";
import { Inter, Press_Start_2P } from "next/font/google";
import Script from "next/script";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { Providers } from "@/components/Providers";
import { site } from "@/lib/site";

const pressStart = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press-start", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} — ${site.hook}`, template: `%s · ${site.name}` },
  description: site.description,
  openGraph: { title: `${site.name} — ${site.hook}`, description: site.description, siteName: site.name, type: "website" },
  twitter: { card: "summary_large_image", title: `${site.name} — ${site.hook}`, description: site.description },
};

export const viewport: Viewport = { themeColor: "#07050f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${pressStart.variable} ${inter.variable}`}>
      <body>
        {/* rehearsal only: a stub wallet that lets a seeded fork sign (public/dev-wallet.js) */}
        {process.env.NEXT_PUBLIC_DEV_WALLET === "1" && process.env.NODE_ENV !== "production" ? <Script src="/dev-wallet.js" strategy="beforeInteractive" /> : null}
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
