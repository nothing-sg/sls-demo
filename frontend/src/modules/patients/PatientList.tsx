import { useEffect, useState } from "react";

import { apiFetch } from "../../api/client";

// Mirrors backend PatientRead (backend/src/patients/schemas.py). Once
// `npm run gen:api` is wired up this hand-written type goes away in favor
// of the generated schema.
interface PatientRead {
  id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  is_active: boolean;
}

export function PatientList() {
  const [patients, setPatients] = useState<PatientRead[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PatientRead[]>("/patients")
      .then(setPatients)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Unknown error"));
  }, []);

  if (error) {
    return <p role="alert">Failed to load patients: {error}</p>;
  }

  return (
    <ul>
      {patients.map((patient) => (
        <li key={patient.id}>
          {patient.first_name} {patient.last_name}
        </li>
      ))}
    </ul>
  );
}
