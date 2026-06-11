import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "MPP — Violation Match Verifier",
  description:
    "Upload a Google Shopping violations CSV and auto-verify each seller listing against the product to surface false positives.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body>
        {user && (
          <header className="border-b border-gray-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
              <Link href="/" className="text-sm font-semibold">
                MPP · Match Verifier
              </Link>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="hidden sm:inline">{user.email}</span>
                <SignOutButton />
              </div>
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
