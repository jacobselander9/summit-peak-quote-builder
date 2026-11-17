import { describe, expect, it } from "vitest";
import { addPart, countLineEdits, describeSpecChanges, removeLine, restoreLine, setHours, setQty } from "./edits";

describe("edit helpers", () => {
  it("records edits per option without mutating the old state", () => {
    const before = {};
    const after = setQty(before, "good", "part:CL-36", 2);
    expect(before).toEqual({});
    expect(after.good!.qty).toEqual({ "part:CL-36": 2 });
    expect(after.better).toBeUndefined();
  });

  it("removes, restores and counts", () => {
    let e = removeLine({}, "best", "fee:F-DISP");
    e = removeLine(e, "best", "fee:F-DISP"); // no duplicate
    e = setHours(e, "best", "labor:I-AC:lead_installer", 6);
    expect(e.best!.removed).toEqual(["fee:F-DISP"]);
    expect(countLineEdits(e)).toBe(2);
    e = restoreLine(e, "best", "fee:F-DISP");
    expect(countLineEdits(e)).toBe(1);
  });

  it("adding a removed part restores it instead of adding a second line", () => {
    let e = removeLine({}, "repair", "part:CAP-45-5");
    e = addPart(e, "repair", "CAP-45-5");
    expect(e.repair!.removed).toEqual([]);
    expect(e.repair!.addedParts).toEqual([]);
    e = addPart(e, "repair", "CONT-2P30");
    expect(e.repair!.addedParts).toEqual([{ sku: "CONT-2P30", qty: 1 }]);
  });

  it("describes job-level changes after the draft", () => {
    const draft = { jobCode: "S-CAP", timing: "standard" as const, peakClub: false, customer: { name: "Ann" } };
    const now = { ...draft, timing: "weekend" as const, peakClub: true, customer: { name: "Ann Lee", phone: "555" } };
    expect(describeSpecChanges(draft, now)).toEqual([
      "Changed timing from standard to weekend",
      "Turned Peak Club on",
      'Changed customer name to "Ann Lee"',
      'Changed customer phone to "555"',
    ]);
    expect(describeSpecChanges(draft, draft)).toEqual([]);
  });
});
