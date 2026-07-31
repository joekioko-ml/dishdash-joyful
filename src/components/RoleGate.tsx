import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useRoles } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function RoleGate({
  allow,
  children,
}: {
  allow: ("admin" | "chef" | "waiter")[];
  children: ReactNode;
}) {
  const { roles, loading } = useRoles();

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!allow.some((r) => roles.includes(r))) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-24 text-center sm:px-6">
        <p className="eyebrow">Staff only</p>
        <h1 className="mt-2 text-4xl text-foreground">You don't have access to this station</h1>
        <p className="mt-3 text-muted-foreground">
          Ask an administrator to grant you the {allow.join(" or ")} role.
        </p>
        <Button asChild className="mt-8">
          <Link to="/menu">Back to the menu</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
