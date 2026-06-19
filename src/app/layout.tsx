import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nuca Plataforma - Gestão de Alunos",
  description: "Sistema de gestão de alunos, escolas e frequência escolar",
  keywords: ["Nuca", "gestão escolar", "alunos", "frequência", "educação"],
  authors: [{ name: "Nuca" }],
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Aggressive cache-busting: prevents browsers/CDNs/iframes from
            serving a stale HTML payload after deploys. The HTTP response
            headers in next.config.ts reinforce this at the network layer. */}
        <meta httpEquiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        {/* Auto-reload if the browser served a cached (stale) HTML payload.
            transferSize === 0 means the response came from cache, not network. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var nav = performance.getEntriesByType('navigation')[0];
              if (nav && nav.transferSize === 0 && !sessionStorage.getItem('__reloaded')) {
                sessionStorage.setItem('__reloaded', '1');
                window.location.reload(true);
              } else {
                sessionStorage.removeItem('__reloaded');
              }
            } catch (e) {}
          })();
        ` }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
