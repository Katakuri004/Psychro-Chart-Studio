import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Analytics } from "@vercel/analytics/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = new URL("https://psychro-chart.vercel.app");
const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl.href}#website`,
      url: siteUrl.href,
      name: "Psychro Chart Studio",
      inLanguage: "en-US",
      description:
        "Interactive psychrometric chart and HVAC engineering assistant.",
      publisher: {
        "@type": "Organization",
        name: "Psychro Chart Studio",
      },
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl.href}?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "Psychro Chart Studio",
      applicationCategory: "EngineeringApplication",
      operatingSystem: "Web",
      url: siteUrl.href,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "5",
        bestRating: "5",
        ratingCount: "12",
      },
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Psychro Chart Studio | Interactive Psychrometric Calculator",
    template: "%s | Psychro Chart Studio",
  },
  description:
    "Design HVAC processes faster with an interactive, unit-aware psychrometric chart. Capture air states, compare processes, and export insights for your project docs.",
  keywords: [
    "psychrometric chart",
    "HVAC calculator",
    "moist air properties",
    "enthalpy",
    "engineering tools",
    "HVAC design software",
  ],
  authors: [{ name: "Katakuri" }],
  creator: "Katakuri",
  publisher: "Psychro Chart Studio",
  alternates: {
    canonical: siteUrl.href,
  },
  openGraph: {
    type: "website",
    url: siteUrl.href,
    title: "Psychro Chart Studio — Visualize Moist Air States in Seconds",
    description:
      "Interactive psychrometric chart built for HVAC engineers, researchers, and data-driven designers.",
    siteName: "Psychro Chart Studio",
    images: [
      {
        url: "/og-preview.png",
        width: 1200,
        height: 630,
        alt: "Psychro Chart Studio preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Psychro Chart Studio",
    description:
      "Interactive psychrometric app with unit conversions, process tracking, and export-ready data.",
    creator: "@Katakuri004",
    images: ["/og-preview.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "technology",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
