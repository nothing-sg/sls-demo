import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { ApiError } from "@/api/client";
import { type PatientRead, useDeactivatePatient, usePatients, useRegisterPatient } from "@/api/queries";
import { useAuth } from "@/auth/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const registerPatientSchema = z.object({
  mrn: z.string().min(1, "MRN is required"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  date_of_birth: z.string().min(1, "Date of birth is required"),
});
type RegisterPatientValues = z.infer<typeof registerPatientSchema>;

function RegisterPatientDialog() {
  const [open, setOpen] = useState(false);
  const registerPatient = useRegisterPatient();
  const form = useForm<RegisterPatientValues>({ resolver: zodResolver(registerPatientSchema) });

  async function onSubmit(values: RegisterPatientValues) {
    try {
      await registerPatient.mutateAsync(values);
      toast.success(`Registered ${values.first_name} ${values.last_name}`);
      form.reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not register patient");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus />
        Register patient
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a patient</DialogTitle>
          <DialogDescription>Creates a new patient record.</DialogDescription>
        </DialogHeader>
        <form
          id="register-patient-form"
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <Field>
            <FieldLabel htmlFor="mrn">MRN</FieldLabel>
            <Input
              id="mrn"
              aria-invalid={!!form.formState.errors.mrn}
              {...form.register("mrn")}
            />
            <FieldError errors={form.formState.errors.mrn ? [form.formState.errors.mrn] : []} />
          </Field>
          <Field>
            <FieldLabel htmlFor="first_name">First name</FieldLabel>
            <Input
              id="first_name"
              aria-invalid={!!form.formState.errors.first_name}
              {...form.register("first_name")}
            />
            <FieldError
              errors={form.formState.errors.first_name ? [form.formState.errors.first_name] : []}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="last_name">Last name</FieldLabel>
            <Input
              id="last_name"
              aria-invalid={!!form.formState.errors.last_name}
              {...form.register("last_name")}
            />
            <FieldError
              errors={form.formState.errors.last_name ? [form.formState.errors.last_name] : []}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="date_of_birth">Date of birth</FieldLabel>
            <Input
              id="date_of_birth"
              type="date"
              aria-invalid={!!form.formState.errors.date_of_birth}
              {...form.register("date_of_birth")}
            />
            <FieldError
              errors={
                form.formState.errors.date_of_birth ? [form.formState.errors.date_of_birth] : []
              }
            />
          </Field>
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form="register-patient-form"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Register
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateButton({ patient }: { patient: PatientRead }) {
  const deactivatePatient = useDeactivatePatient();

  async function onConfirm() {
    try {
      await deactivatePatient.mutateAsync(patient.id);
      toast.success(`Deactivated ${patient.first_name} ${patient.last_name}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not deactivate patient");
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        Deactivate
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate patient record?</AlertDialogTitle>
          <AlertDialogDescription>
            {patient.first_name} {patient.last_name} ({patient.mrn}) will no longer appear in the
            active patient list. This can be seen later in the audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Deactivate</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function PatientsPage() {
  const { state } = useAuth();
  const isAdmin = state.status === "signedIn" && state.user.role === "admin";
  const navigate = useNavigate();
  const { data: patients, isLoading, isError } = usePatients();

  const columns: ColumnDef<PatientRead>[] = [
    {
      accessorKey: "last_name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.first_name} {row.original.last_name}
        </span>
      ),
    },
    { accessorKey: "mrn", header: "MRN" },
    { accessorKey: "date_of_birth", header: "Date of birth" },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? "default" : "secondary"}>
          {row.original.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    ...(isAdmin
      ? [
          {
            id: "actions",
            header: "",
            cell: ({ row }) =>
              row.original.is_active ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <DeactivateButton patient={row.original} />
                </div>
              ) : null,
          } satisfies ColumnDef<PatientRead>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Patients</h1>
          <p className="text-sm text-muted-foreground">Active patient roster.</p>
        </div>
        <RegisterPatientDialog />
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">Could not load patients. Try refreshing.</p>
      )}

      {patients && (
        <DataTable
          columns={columns}
          data={patients}
          emptyMessage="No patients registered yet."
          onRowClick={(patient) => navigate(`/patients/${patient.id}`)}
        />
      )}
    </div>
  );
}
