"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { createEmployee, updateEmployee } from "@/lib/data";
import type { EmployeeRecord } from "@/lib/data";
import { messageFrom } from "@/lib/data/errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function PeopleManager({
  organizationId,
  people,
  canManage,
}: {
  organizationId: string;
  people: EmployeeRecord[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hireDate, setHireDate] = useState("");

  async function add(event: FormEvent) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    try {
      await createEmployee(supabase, organizationId, { name, email, phone, hireDate, notes: "" });
      setName("");
      setEmail("");
      setPhone("");
      setHireDate("");
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    }
  }

  return (
    <div className="grid gap-6">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <ul className="grid gap-3">
        {people.map((person) => (
          <li key={person.id} className="rounded-2xl bg-card p-4">
            <p className="font-medium">{person.name}</p>
            <p className="text-sm text-muted">
              {person.active ? "Active" : "Inactive"}
              {person.email ? ` · ${person.email}` : ""}
              {person.hire_date ? ` · hired ${person.hire_date}` : ""}
              {person.termination_date ? ` · ended ${person.termination_date}` : ""}
            </p>
            {canManage ? (
              <button
                type="button"
                className="mt-2 text-sm underline"
                onClick={() => {
                  const supabase = getBrowserSupabase();
                  if (!supabase) return;
                  void updateEmployee(supabase, person.id, {
                    name: person.name,
                    email: person.email ?? "",
                    phone: person.phone ?? "",
                    hireDate: person.hire_date ?? "",
                    terminationDate: person.active ? new Date().toISOString().slice(0, 10) : "",
                    active: !person.active,
                    notes: person.notes ?? "",
                  })
                    .then(() => router.refresh())
                    .catch((caught: unknown) => setError(messageFrom(caught)));
                }}
              >
                {person.active ? "Mark inactive" : "Mark active"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <form className="grid gap-3 rounded-3xl border border-line p-4" onSubmit={(event) => void add(event)}>
          <h2 className="font-serif text-2xl">Add a person</h2>
          <p className="text-sm text-muted">People can receive gear without having a login.</p>
          <Field label="Name"><TextInput required value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Email"><TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          <Field label="Phone"><TextInput value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
          <Field label="Hire date"><TextInput type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} /></Field>
          <Button type="submit">Save person</Button>
        </form>
      ) : null}
    </div>
  );
}
