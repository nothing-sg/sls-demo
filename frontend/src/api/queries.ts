import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient, unwrap } from "@/api/client";

import type { components } from "./schema";

export type PatientRead = components["schemas"]["PatientRead"];
export type PatientCreate = components["schemas"]["PatientCreate"];
export type AppointmentRead = components["schemas"]["AppointmentRead"];
export type AppointmentCreate = components["schemas"]["AppointmentCreate"];
export type AppointmentWithPatient = components["schemas"]["AppointmentWithPatient"];
export type AuditLogEntryRead = components["schemas"]["AuditLogEntryRead"];

const patientsKey = ["patients"] as const;
const patientKey = (id: string) => ["patients", id] as const;
const appointmentsKey = (patientId: string) => ["appointments", "patient", patientId] as const;
const auditLogKey = ["audit-log"] as const;

export function usePatients() {
  return useQuery({
    queryKey: patientsKey,
    queryFn: () => unwrap(apiClient.GET("/patients")),
  });
}

export function usePatient(patientId: string | undefined) {
  return useQuery({
    queryKey: patientKey(patientId ?? ""),
    queryFn: () =>
      unwrap(
        apiClient.GET("/patients/{patient_id}", {
          params: { path: { patient_id: patientId! } },
        }),
      ),
    enabled: Boolean(patientId),
  });
}

export function useRegisterPatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PatientCreate) =>
      unwrap(apiClient.POST("/patients", { body: data })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: patientsKey });
    },
  });
}

export function useDeactivatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patientId: string) =>
      unwrap(
        apiClient.POST("/patients/{patient_id}/deactivate", {
          params: { path: { patient_id: patientId } },
        }),
      ),
    onSuccess: (patient) => {
      void queryClient.invalidateQueries({ queryKey: patientsKey });
      void queryClient.invalidateQueries({ queryKey: patientKey(patient.id) });
    },
  });
}

export function usePatientAppointments(patientId: string | undefined) {
  return useQuery({
    queryKey: appointmentsKey(patientId ?? ""),
    queryFn: () =>
      unwrap(
        apiClient.GET("/appointments/patient/{patient_id}", {
          params: { path: { patient_id: patientId! } },
        }),
      ),
    enabled: Boolean(patientId),
  });
}

export function useScheduleAppointment(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AppointmentCreate) =>
      unwrap(apiClient.POST("/appointments", { body: data })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appointmentsKey(patientId) });
    },
  });
}

export function useAuditLog(enabled: boolean) {
  return useQuery({
    queryKey: auditLogKey,
    queryFn: () => unwrap(apiClient.GET("/audit-log")),
    enabled,
  });
}
