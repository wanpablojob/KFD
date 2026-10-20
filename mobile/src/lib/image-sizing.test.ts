import { UPLOAD_MAX_WIDTH, targetWidthFor } from "./image-sizing";

/**
 * The width rule for an uploaded photo.
 *
 * The failure this prevents is slow and quiet: a 12-megapixel photo of a
 * plate of food is 1-2 MB, uploaded whole over a connection that is not fast,
 * from a merchant who is standing in their kitchen waiting for the upload.
 */
describe("targetWidthFor", () => {
  it("resizes a photo that is wider than the limit", () => {
    expect(targetWidthFor(4032)).toBe(UPLOAD_MAX_WIDTH);
    expect(targetWidthFor(1200)).toBe(800);
  });

  it("leaves a photo that already fits alone", () => {
    expect(targetWidthFor(800)).toBeNull();
    expect(targetWidthFor(640)).toBeNull();
  });

  it("does not enlarge a small photo to make up the width", () => {
    expect(targetWidthFor(200)).toBeNull();
  });

  it("leaves a photo of unknown size alone rather than guessing", () => {
    expect(targetWidthFor(0)).toBeNull();
    expect(targetWidthFor(-10)).toBeNull();
    expect(targetWidthFor(Number.NaN)).toBeNull();
    expect(targetWidthFor(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("honours a different limit", () => {
    expect(targetWidthFor(1000, 1200)).toBeNull();
    expect(targetWidthFor(2000, 1200)).toBe(1200);
  });
});
