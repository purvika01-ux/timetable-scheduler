import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/toast";
import { AuthProvider } from "@/lib/auth-context";
import { WorkspaceProvider } from "@/lib/store";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "College Timetable Optimizer", template: "%s · College Timetable Optimizer" },
  description: "Clash-free college timetables for any college: set up your data, generate, adjust and share. Prototype; data stays in this browser.",
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <WorkspaceProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
