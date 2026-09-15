"use client";

import dynamic from "next/dynamic";

/** The form reads its draft from localStorage, so it only renders on the client. */
export const LaunchFormClient = dynamic(() => import("./LaunchForm").then((m) => m.LaunchForm), {
  ssr: false,
  loading: () => <div className="py-16 text-center text-ink-3">loading the console…</div>,
});
