import { describe, expect, it } from "vitest";
import { LABEL_TEMPLATES, customTemplate, labelSlot, labelsPerPage, templateFits } from "./templates";

describe("label templates", () => {
  it("fits every built-in sheet and roll on its page", () => {
    expect(LABEL_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    for (const template of LABEL_TEMPLATES) {
      expect(templateFits(template)).toBe(true);
    }
  });

  it("lays Avery 5160 out as 30 labels and Avery 5163 as 10", () => {
    const address = LABEL_TEMPLATES.find((template) => template.id === "avery-5160");
    const shipping = LABEL_TEMPLATES.find((template) => template.id === "avery-5163");
    expect(labelsPerPage(address!)).toBe(30);
    expect(labelsPerPage(shipping!)).toBe(10);
    expect(labelSlot(address!, 3)).toMatchObject({ page: 0, column: 0, row: 1 });
    expect(labelSlot(address!, 30).page).toBe(1);
  });

  it("covers Avery, Brother, Dymo, Zebra, and custom stock", () => {
    const families = new Set(LABEL_TEMPLATES.map((template) => template.family));
    expect(families).toEqual(new Set(["avery", "brother", "dymo", "zebra"]));
    const custom = customTemplate(2, 1);
    expect(custom.paper).toBe("roll");
    expect(custom.labelWidthMm).toBeCloseTo(50.8, 1);
    expect(templateFits(custom)).toBe(true);
    expect(() => customTemplate(0.1, 1)).toThrow(/0\.5/);
  });
});
