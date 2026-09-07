import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rise & Shine | Secure Parent Portal",
  description: "Secure HIPAA-compliant parent & client portal for Rise & Shine ABA",
};

export default function MagicLinkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-portal="parent-magic-link" className="magic-link-isolated w-full min-h-screen bg-[#FFFDF8] text-slate-900">
      {children}
    </div>
  );
}
