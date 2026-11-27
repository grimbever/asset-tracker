import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Outfit } from "next/font/google";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { AppUpdateNotice } from "@/components/shell/AppUpdateNotice";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, BRAND } from "@/lib/config";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex" });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: BRAND.ink,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const brandVars = {
    "--paper": BRAND.paper,
    "--paper-deep": BRAND.paperDeep,
    "--card": BRAND.card,
    "--ink": BRAND.ink,
    "--muted": BRAND.muted,
    "--line": BRAND.line,
    "--green": BRAND.green,
    "--green-soft": BRAND.greenSoft,
    "--ember": BRAND.ember,
    "--ember-soft": BRAND.emberSoft,
    "--gold": BRAND.gold,
    "--danger": BRAND.danger,
    "--danger-soft": BRAND.dangerSoft,
  } as CSSProperties;

  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable} ${plex.variable} h-full antialiased`} style={brandVars}>
      <body className="min-h-full bg-paper font-sans text-ink">
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        <div id="content">{children}</div>
        <AppUpdateNotice />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
