import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { personDraftFrom, updatePersonDraft } from "./draft";

describe("person edit draft", () => {
  it("keeps typed title, hire date, and leaving date instead of the saved blanks", () => {
    const saved = personDraftFrom({
      name: "Pat",
      title: null,
      email: null,
      phone: null,
      hire_date: null,
      termination_date: null,
      notes: null,
    });
    const typed = updatePersonDraft(updatePersonDraft(updatePersonDraft(saved, { title: "Lead" }), { hireDate: "2020-01-02" }), {
      leavingDate: "2026-12-01",
    });
    expect(typed).toMatchObject({ title: "Lead", hireDate: "2020-01-02", leavingDate: "2026-12-01", name: "Pat" });
    expect(saved.title).toBe("");
  });

  it("binds the edit form to the draft", () => {
    const source = readFileSync("components/people/PeopleManager.tsx", "utf8");
    const editStart = source.indexOf("editing === person.id");
    const editBlock = source.slice(editStart, source.indexOf(") : (", editStart));
    expect(editBlock).toContain("value={draft}");
    expect(editBlock).not.toContain("person.title");
    expect(editBlock).not.toContain("person.hire_date");
    expect(editBlock).not.toContain("person.termination_date");
  });
});
