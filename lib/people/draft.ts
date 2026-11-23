export type PersonDraft = {
  name: string;
  title: string;
  email: string;
  phone: string;
  hireDate: string;
  leavingDate: string;
  notes: string;
};

export function personDraftFrom(person: {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  hire_date: string | null;
  termination_date: string | null;
  notes: string | null;
}): PersonDraft {
  return {
    name: person.name,
    title: person.title ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    hireDate: person.hire_date ?? "",
    leavingDate: person.termination_date ?? "",
    notes: person.notes ?? "",
  };
}

/** The edit form must display this result, not the saved record, or keystrokes are thrown away. */
export function updatePersonDraft(draft: PersonDraft, patch: Partial<PersonDraft>): PersonDraft {
  return { ...draft, ...patch };
}
