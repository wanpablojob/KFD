import { uploadLocalImage, withContentType } from "./image-upload";

declare const require: (id: string) => unknown;
declare const global: { fetch: jest.Mock };

jest.mock("./supabase", () => {
  const upload = jest.fn();
  return { supabase: { storage: { from: () => ({ upload }) }, upload } };
});

const { supabase } = require("./supabase") as {
  supabase: { upload: jest.Mock };
};

/** A React Native Blob: bytes, a size, and slice() to attach a type. */
function fakeBlob(size = 2048) {
  return {
    size,
    slice: jest.fn((_start: number, _end: number, type: string) => ({
      size,
      type,
    })),
  };
}

describe("withContentType", () => {
  it("returns a view of the same bytes carrying the content type", () => {
    const blob = fakeBlob(99);
    const typed = withContentType(blob as unknown as Blob, "image/png");

    expect(blob.slice).toHaveBeenCalledWith(0, 99, "image/png");
    expect(typed).toEqual({ size: 99, type: "image/png" });
  });
});

describe("uploadLocalImage", () => {
  let blob: ReturnType<typeof fakeBlob>;

  beforeEach(() => {
    supabase.upload.mockReset().mockResolvedValue({ error: null });
    blob = fakeBlob();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => blob });
  });

  it("uploads the bytes with the content type the bucket allows", async () => {
    const outcome = await uploadLocalImage({
      bucket: "gcash-qr",
      path: "rdr_01/abc.png",
      uri: "file:///tmp/qr.png",
      contentType: "image/png",
    });

    expect(outcome.ok).toBe(true);
    // A bare Blob reaches Storage as a multipart part with no content type,
    // and the part arrives as text/plain, which every bucket here refuses
    // with 415 InvalidMimeType. The type has to be on the blob itself.
    expect(blob.slice).toHaveBeenCalledWith(0, 2048, "image/png");
    expect(supabase.upload).toHaveBeenCalledWith(
      "rdr_01/abc.png",
      { size: 2048, type: "image/png" },
      { contentType: "image/png", upsert: false }
    );
  });

  it("refuses a file over the limit without uploading it", async () => {
    blob = fakeBlob(6 * 1024 * 1024);

    const outcome = await uploadLocalImage({
      bucket: "gcash-qr",
      path: "rdr_01/big.png",
      uri: "file:///tmp/big.png",
      contentType: "image/png",
      maxBytes: 5 * 1024 * 1024,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.failure.kind).toBe("too-large");
    expect(supabase.upload).not.toHaveBeenCalled();
  });

  it("reports a file it cannot read", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });

    const outcome = await uploadLocalImage({
      bucket: "gcash-qr",
      path: "rdr_01/gone.png",
      uri: "file:///tmp/gone.png",
      contentType: "image/png",
    });

    expect(outcome.ok === false && outcome.failure.kind).toBe("unreadable");
    expect(supabase.upload).not.toHaveBeenCalled();
  });

  it("reports an empty file as unreadable", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, blob: async () => fakeBlob(0) });

    const outcome = await uploadLocalImage({
      bucket: "gcash-qr",
      path: "rdr_01/empty.png",
      uri: "file:///tmp/empty.png",
      contentType: "image/png",
    });

    expect(outcome.ok === false && outcome.failure.kind).toBe("unreadable");
    expect(supabase.upload).not.toHaveBeenCalled();
  });

  it("passes the server's own words back when it refuses the file", async () => {
    supabase.upload.mockResolvedValue({
      error: { message: "mime type text/plain is not supported", statusCode: "415" },
    });

    const outcome = await uploadLocalImage({
      bucket: "gcash-qr",
      path: "rdr_01/refused.png",
      uri: "file:///tmp/qr.png",
      contentType: "image/png",
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("rejected");
    expect(outcome.failure.detail).toBe("mime type text/plain is not supported");
    expect(outcome.failure.error?.statusCode).toBe("415");
  });
});
