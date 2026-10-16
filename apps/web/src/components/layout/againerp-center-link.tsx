import Link from "next/link";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CENTER_URL =
  process.env.NEXT_PUBLIC_AGAINERP_CENTER_URL ?? "http://localhost:3100";

type Props = {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
};

/** External link to standalone AgainERP Center (not hosted in AgainERP). */
export function AgainErpCenterLink({ className, size = "sm" }: Props) {
  return (
    <Button
      variant="outline"
      size={size}
      className={cn("gap-1.5 border-violet-200 text-violet-700 dark:border-violet-800 dark:text-violet-300", className)}
      asChild
    >
      <Link href={CENTER_URL} target="_blank" rel="noopener noreferrer">
        <Shield className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">AgainERP Center</span>
      </Link>
    </Button>
  );
}
