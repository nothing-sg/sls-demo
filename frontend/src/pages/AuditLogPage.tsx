import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";

import { type AuditLogEntryRead, useAuditLog } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/data-table";
import { Skeleton } from "@/components/ui/skeleton";

const actionVariant: Record<string, "default" | "secondary" | "destructive"> = {
  access: "secondary",
  create: "default",
  update: "default",
  delete: "destructive",
};

const columns: ColumnDef<AuditLogEntryRead>[] = [
  {
    accessorKey: "occurred_at",
    header: "Occurred at",
    cell: ({ row }) => format(new Date(row.original.occurred_at), "PPpp"),
  },
  { accessorKey: "actor_subject", header: "Actor" },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => (
      <Badge variant={actionVariant[row.original.action] ?? "secondary"}>
        {row.original.action}
      </Badge>
    ),
  },
  { accessorKey: "resource_type", header: "Resource type" },
  { accessorKey: "resource_id", header: "Resource ID" },
  {
    accessorKey: "reason",
    header: "Reason",
    cell: ({ row }) => row.original.reason ?? <span className="text-muted-foreground">—</span>,
  },
];

export function AuditLogPage() {
  const { data, isLoading, isError } = useAuditLog(true);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every access to and change of PHI-bearing records — see ADR-0003.
        </p>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">Could not load the audit log. Try refreshing.</p>
      )}

      {data && <DataTable columns={columns} data={data} emptyMessage="No audit entries yet." />}
    </div>
  );
}
