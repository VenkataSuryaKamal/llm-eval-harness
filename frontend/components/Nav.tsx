"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/try", label: "Quick test" },
  { href: "/runs/new", label: "Evaluate many inputs" },
  { href: "/help", label: "Help" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={path === l.href ? "on" : ""} aria-current={path === l.href ? "page" : undefined}>{l.label}</Link>
      ))}
    </nav>
  );
}
