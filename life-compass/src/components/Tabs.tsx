"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "今天" },
  { href: "/records", label: "记录" },
  { href: "/direction", label: "方向" },
];

export function Tabs() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="主导航">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path.startsWith(t.href) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
