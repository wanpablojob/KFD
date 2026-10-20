import { uploadGcashQr } from "./gcash-qr-upload";

declare const require: (id: string) => unknown;
declare const global: { fetch: jest.Mock };

jest.mock("./supabase", () => {
  const upload = jest.fn();
  const getPublicUrl = jest.fn(() => ({
    data: { publicUrl: "https://cdn.example/gcash-qr/rdr_01/qr.png" },
  }));
  return {
    supabase: {
      storage: { from: () => ({ upload, getPublicUrl }) },
      upload,
      getPublicUrl,
    },
  };
});

const { supabase } = require("./supabase") as {
  supabase: { upload: jest.Mock; getPublicUrl: jest.Mock };
};

function fakeBlob(size = 4096) {
  return {
    size,
    slice: jest.fn((_start: number, _end: number, type: string) => ({
      size,
      type,
    })),
  };
}

describe("uploadGcashQr", () => {
  let blob: ReturnType<typeof fakeBlob>;

  beforeEach(() => {
    supabase.upload.mockReset().mockResolvedValue({ error: null });
    supabase.getPublicUrl.mockClear();
    blob = fakeBlob();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => blob });
  });

  it("uploads into the rider's folder with a content type the bucket accepts", async () => {
    const url = await uploadGcashQr("rdr_01", "file:///tmp/qr.png");

    const [path, body, options] = supabase.upload.mock.calls[0];
    expect(path).toMatch(/^rdr_01\/[a-z0-9]+-[a-z0-9]{6}\.png$/);
    // The part must declare its type, or Storage refuses it as text/plain.
    expect(body).toEqual({ size: 4096, type: "image/png" });
    expect(options).toEqual({ contentType: "image/png", upsert: false });
    expect(url).toBe("https://cdn.example/gcash-qr/rdr_01/qr.png");
  });

  it("says the feature is not available yet when the bucket is missing", async () => {
    supabase.upload.mockResolvedValue({
      error: { message: "Bucket not found", statusCode: "404" },
    });

    await expect(uploadGcashQr("rdr_01", "file:///tmp/qr.png")).rejects.toThrow(
      /not available yet/
    );
  });

  it("refuses a screenshot that is too large", async () => {
    blob = fakeBlob(9 * 1024 * 1024);

    await expect(uploadGcashQr("rdr_01", "file:///tmp/qr.png")).rejects.toThrow(
      /too large/
    );
    expect(supabase.upload).not.toHaveBeenCalled();
  });
});
