"use client";

import Link from "next/link";
import { SwitchTheme } from "~~/components/SwitchTheme";

export const Footer = () => {
  return (
    <footer className="border-t border-[#d8d1c2] bg-[#fffdf7] px-5 py-5 text-sm text-[#4d5954]">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p>
          <span className="font-black text-[#101716]">OutcomePay AI</span> verifies delivery before AI-agent payments
          settle.
        </p>
        <div className="flex items-center gap-4 text-xs">
          <Link href="/debug" className="font-semibold text-[#68736f]">
            Contracts
          </Link>
          <Link href="/blockexplorer" className="font-semibold text-[#68736f]">
            Explorer
          </Link>
          <SwitchTheme />
        </div>
      </div>
    </footer>
  );
};
