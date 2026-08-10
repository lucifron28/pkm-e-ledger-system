import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PKM e-Ledger System",
  description:
    "A web-based Student Organization Financial Ledger System for Pambayang Kolehiyo ng Mauban.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
