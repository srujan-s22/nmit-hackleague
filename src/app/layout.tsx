import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NMIT HackLeague — Institutional Portal",
  description: "Official hackathon management and team collaboration portal for NMIT.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
