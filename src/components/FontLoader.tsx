"use client";
import { useEffect } from "react";

export default function FontLoader() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://use.typekit.net/gac6jnd.css";
    document.head.appendChild(link);
  }, []);

  return null;
}
