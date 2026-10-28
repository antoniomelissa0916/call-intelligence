import { Suspense } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Sidebar, SidebarView } from "@/components/shell/sidebar";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Call Intelligence · PestLaunch", template: "%s · PestLaunch" },
  description: "Every customer call, transcribed, scored against your call standards and turned into next steps.",
};

/** Workspace name in the PestLaunch OS sidebar ("<name> OS"). */
const WORKSPACE = process.env.WORKSPACE_NAME?.trim() || "Demo Pest Co";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="h-full">
        <div className="flex h-full">
          <Suspense fallback={<SidebarView company={WORKSPACE} pathname="" />}>
            <Sidebar company={WORKSPACE} />
          </Suspense>
          <main className="min-w-0 flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
