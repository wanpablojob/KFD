import { gcashQrFile, gcashQrPath } from "./gcash-qr";

describe("gcashQrFile", () => {
  it("maps the formats the bucket accepts", () => {
    expect(gcashQrFile("file:///tmp/qr.png")).toEqual({
      ext: "png",
      contentType: "image/png",
    });
    expect(gcashQrFile("file:///tmp/qr.WEBP")).toEqual({
      ext: "webp",
      contentType: "image/webp",
    });
    expect(gcashQrFile("file:///tmp/qr.JPEG")).toEqual({
      ext: "jpg",
      contentType: "image/jpeg",
    });
  });

  it("defaults to jpg and ignores a query string", () => {
    expect(gcashQrFile("content://media/123?name=qr.png")).toEqual({
      ext: "jpg",
      contentType: "image/jpeg",
    });
    expect(gcashQrFile("file:///tmp/qr.png?size=large")).toEqual({
      ext: "png",
      contentType: "image/png",
    });
  });
});

describe("gcashQrPath", () => {
  it("puts the rider id first and keeps the image extension", () => {
    expect(gcashQrPath("RDR-1", "file:///tmp/qr.PNG", 123, 0.5)).toBe(
      "RDR-1/3f-i00000.png"
    );
  });

  it("uses a fresh suffix for each upload", () => {
    const first = gcashQrPath("RDR-1", "file:///tmp/qr.jpg", 123, 0.5);
    const second = gcashQrPath("RDR-1", "file:///tmp/qr.jpg", 123, 0.6);
    expect(first).not.toBe(second);
  });

  it("refuses to build a path without a rider", () => {
    expect(() => gcashQrPath("   ", "file:///tmp/qr.jpg")).toThrow(
      "No rider profile is linked to this account."
    );
  });
});
