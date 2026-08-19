import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/context/SessionContext";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-serif",
});

const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "LuxeForLess — AI Virtual Try-On",
  description: "AI-powered virtual try-on smart mirror for retail clothing stores",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable} font-sans bg-stone-100 text-stone-900 antialiased`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
