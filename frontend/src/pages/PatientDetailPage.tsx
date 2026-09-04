import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { ApiError } from "@/api/client";
import {
  type AppointmentWithPatient,
  usePatient,
  usePatientAppointments,
  useScheduleAppointment,
} from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const scheduleAppointmentSchema = z.object({
  provider_id: z.string().uuid("Must be a provider UUID"),
  scheduled_at: z.string().min(1, "Date and time are required"),
});
type ScheduleAppointmentValues = z.infer<typeof scheduleAppointmentSchema>;

function ScheduleAppointmentDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const scheduleAppointment = useScheduleAppointment(patientId);
  const form = useForm<ScheduleAppointmentValues>({
    resolver: zodResolver(scheduleAppointmentSchema),
  });

  async function onSubmit(values: ScheduleAppointmentValues) {
    try {
      await scheduleAppointment.mutateAsync({
        patient_id: patientId,
        provider_id: values.provider_id,
        scheduled_at: new Date(values.scheduled_at).toISOString(),
      });
      toast.success("Appointment scheduled");
      form.reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not schedule appointment");
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
        Schedule appointment
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule an appointment</DialogTitle>
          <DialogDescription>
            There's no provider directory yet — paste a provider UUID directly.
          </DialogDescription>
        </DialogHeader>
        <form
          id="schedule-appointment-form"
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <Field>
            <FieldLabel htmlFor="provider_id">Provider ID</FieldLabel>
            <Input
              id="provider_id"
              placeholder="11111111-1111-1111-1111-111111111111"
              aria-invalid={!!form.formState.errors.provider_id}
              {...form.register("provider_id")}
            />
            <FieldError
              errors={form.formState.errors.provider_id ? [form.formState.errors.provider_id] : []}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="scheduled_at">Date and time</FieldLabel>
            <Input
              id="scheduled_at"
              type="datetime-local"
              aria-invalid={!!form.formState.errors.scheduled_at}
              {...form.register("scheduled_at")}
            />
            <FieldError
              errors={
                form.formState.errors.scheduled_at ? [form.formState.errors.scheduled_at] : []
              }
            />
          </Field>
        </form>
        <DialogFooter>
          <Button
            type="submit"
            form="schedule-appointment-form"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const appointmentColumns: ColumnDef<AppointmentWithPatient>[] = [
  {
    accessorKey: "scheduled_at",
    header: "Scheduled at",
    cell: ({ row }) => format(new Date(row.original.scheduled_at), "PPpp"),
  },
  { accessorKey: "provider_id", header: "Provider" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <Badge variant="secondary">{row.original.status}</Badge>,
  },
];

export function PatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { data: patient, isLoading: patientLoading } = usePatient(patientId);
  const { data: appointments, isLoading: appointmentsLoading } = usePatientAppointments(patientId);

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All patients
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>
            {patientLoading || !patient ? (
              <Skeleton className="h-6 w-48" />
            ) : (
              <span className="flex items-center gap-2">
                {patient.first_name} {patient.last_name}
                <Badge variant={patient.is_active ? "default" : "secondary"}>
                  {patient.is_active ? "Active" : "Inactive"}
                </Badge>
              </span>
            )}
          </CardTitle>
        </CardHeader>
        {patient && (
          <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-muted-foreground">MRN</div>
              <div>{patient.mrn}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Date of birth</div>
              <div>{patient.date_of_birth}</div>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Appointments</h2>
        {patientId && <ScheduleAppointmentDialog patientId={patientId} />}
      </div>

      {appointmentsLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {appointments && (
        <DataTable
          columns={appointmentColumns}
          data={appointments}
          emptyMessage="No appointments scheduled."
        />
      )}
    </div>
  );
}
