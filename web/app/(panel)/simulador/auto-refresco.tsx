"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recarga los mensajes cada pocos segundos para ver los avisos que llegan tras el OCR. */
export function AutoRefresco({ segundos = 4 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearInterval(id);
  }, [router, segundos]);
  return null;
}
