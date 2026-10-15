import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Lernpfad – Dein Wissen. Dein Weg.",
  description:
    "Dein persönlicher KI-Lernraum: Unterlagen hochladen, Zusammenhänge verstehen und mit jedem Schritt wachsen.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
