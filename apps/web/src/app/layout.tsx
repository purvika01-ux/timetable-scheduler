import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/toast";
import { DemoStoreProvider } from "@/lib/store";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "College Timetable Optimizer", template: "%s · College Timetable Optimizer" },
  description: "Clash-free college timetables for teachers and coordinators. Hackathon prototype with sample data.",
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <DemoStoreProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </DemoStoreProvider>
      </body>
    </html>
  );
}
