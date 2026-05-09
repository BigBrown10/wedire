import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wedire Studio — AI Video Engine",
  description: "Generate near-production-quality storytelling videos from conversational briefs. Powered by Gemini, ElevenLabs, and open-source AI.",
  keywords: ["video generation", "AI video", "storytelling", "brand videos", "content creation"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          {children}
        </div>
      </body>
    </html>
  );
}
