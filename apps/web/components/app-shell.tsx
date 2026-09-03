"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import NavBar from "./nav";
import { getToken } from "@/lib/auth";

/**
 * Wraps every route. On non-login pages, waits until the admin token is
 * present in localStorage; otherwise redirects to /login. The login page is
 * rendered without the NavBar.
 */
export default function AppShell({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    if (getToken()) {
      setReady(true);
    } else {
      router.replace("/login");
    }
  }, [isLogin, router]);

  if (!isLogin && !ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
        加载中…
      </div>
    );
  }

  return (
    <>
      {!isLogin && <NavBar />}
      {children}
    </>
  );
}
