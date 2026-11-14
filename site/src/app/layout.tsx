import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { NearProvider } from "@/components/near-provider";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const sans = Outfit({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Held",
  description: "A one-minute captcha for a mint on NEAR. The coin asks before it pays.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <NearProvider>{children}</NearProvider>
      </body>
    </html>
  );
}
