import { useEffect, useState } from "react";
import { isExtension } from "../../lib/runtime";
import { fetchAuthState } from "./auth";

/**
 * The HN account the reader is signed in as, or null when logged out. Always
 * null on the web build, which can't read HN's cookie.
 */
export function useHnUsername(): string | null {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!isExtension()) return;
    let cancelled = false;
    fetchAuthState()
      .then((s) => {
        if (!cancelled && s.status === "logged-in") setUsername(s.username);
      })
      .catch(() => {
        // Logged out is the safe assumption; the caller just hides the filter.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return username;
}
