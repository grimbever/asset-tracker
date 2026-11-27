import { describe, expect, it } from "vitest";
import { messageFrom } from "@/lib/data/errors";
import { APP_UPDATED_MESSAGE, isStaleAppError } from "./app-update";

describe("stale app after a deploy", () => {
  it("recognizes the Next.js missing server action error", () => {
    const error = new Error(
      'Server Action "abc" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
    );
    expect(isStaleAppError(error)).toBe(true);
    expect(messageFrom(error)).toBe(APP_UPDATED_MESSAGE);
    expect(isStaleAppError(new Error("That status is not available."))).toBe(false);
  });
});
