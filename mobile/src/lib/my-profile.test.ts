import type { User } from "@supabase/supabase-js";
import { avatarPath, displayNameOf, photoOf } from "./my-profile";

jest.mock("./supabase", () => ({ supabase: {} }));

const user = (meta: Record<string, unknown>, email = "ana@example.test") =>
  ({ id: "u1", email, user_metadata: meta }) as unknown as User;

describe("my profile", () => {
  it("prefers the chosen name over the sign-in name, then the email", () => {
    expect(displayNameOf(user({ display_name: "Ana Reyes", name: "Google Ana" }))).toBe(
      "Ana Reyes"
    );
    expect(displayNameOf(user({ name: "Google Ana" }))).toBe("Google Ana");
    expect(displayNameOf(user({}))).toBe("ana");
  });

  it("prefers the uploaded photo over the Google one, and ignores non-https values", () => {
    expect(
      photoOf(user({ photo_url: "https://a/x.jpg", avatar_url: "https://g/y.jpg" }))
    ).toBe("https://a/x.jpg");
    expect(photoOf(user({ avatar_url: "https://g/y.jpg" }))).toBe("https://g/y.jpg");
    expect(photoOf(user({ photo_url: "javascript:alert(1)" }))).toBeNull();
  });

  it("puts the photo in the user's own folder with a fresh name", () => {
    expect(avatarPath("u1", "file:///p.png", 0, 0.5)).toMatch(
      /^u1\/0-[a-z0-9]{6}\.png$/
    );
    expect(() => avatarPath(" ", "file:///p.png")).toThrow();
  });
});
