import React from "react";
import "@/app/globals.css";
import { UserProvider } from "@/context/UserContext";
import { headers } from "next/headers";

import { ThemeProvider } from "@/context/ThemeContext";

export const metadata = {
  title: "Anirium • Plataforma Canônica de Animes e Genealogia",
  description: "Descubra. Conecte. Acompanhe. O universo conectado e a genealogia canônica de animes.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const isExport = process.env.NEXT_EXPORT === "true";
  let nonce: string | undefined = undefined;
  if (!isExport) {
    try {
      nonce = (await headers()).get("x-nonce") || undefined;
    } catch {
      // In static export or missing request context, nonce is undefined
    }
  }
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Inter:wght@300;400;500;600;700;800&family=Source+Code+Pro:wght@400;600&display=swap" rel="stylesheet" />
        <script nonce={nonce} src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body className="min-h-screen bg-[var(--color-bg-base,#0B0B0D)] text-[var(--color-text-primary,#FFF9F0)] antialiased selection:bg-[#FFC766]/30 selection:text-[#FFC766]">
        <ThemeProvider>
          <UserProvider>
            {children}
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
