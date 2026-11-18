import type { Metadata } from "next";
import { MerchantGate } from "@/components/merchant/merchant-gate";

export const metadata: Metadata = {
  title: "Merchant — Meriendash",
  description: "Manage your restaurant's orders and menu on Meriendash.",
};

export default function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MerchantGate>{children}</MerchantGate>;
}
