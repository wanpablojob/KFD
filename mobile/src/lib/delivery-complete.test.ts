import { completeDelivery } from "./delivery-complete";

declare const require: (id: string) => unknown;
declare const global: { fetch: jest.Mock };

jest.mock("./admin-api", () => ({ postApi: jest.fn() }));

jest.mock("./supabase", () => {
  const upload = jest.fn();
  return {
    supabase: { rpc: jest.fn(), storage: { from: () => ({ upload }) }, upload },
  };
});

const { supabase } = require("./supabase") as {
  supabase: { rpc: jest.Mock; upload: jest.Mock };
};

const INPUT = {
  orderId: "O-1",
  payment: "e_wallet" as const,
  orderTotal: 250,
  photoUri: "file:///proof.jpg",
  cashCollected: "",
  gcashReference: "",
};

/**
 * A React Native Blob: the bytes, a size, and slice() -- which is how the
 * content type is attached before the file goes to Storage. See image-upload.
 */
function fakeBlob() {
  return {
    size: 12,
    slice: jest.fn((_start: number, _end: number, type: string) => ({
      size: 12,
      type,
    })),
  };
}

describe("completeDelivery", () => {
  let blob: ReturnType<typeof fakeBlob>;

  beforeEach(() => {
    supabase.rpc.mockReset().mockResolvedValue({ error: null });
    supabase.upload.mockReset();
    blob = fakeBlob();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => blob });
  });

  it("uploads to the rider's folder, then closes the order with that path", async () => {
    supabase.upload.mockResolvedValue({ error: null });

    await completeDelivery("R-1", INPUT);

    expect(supabase.upload).toHaveBeenCalledWith(
      "R-1/O-1.jpg",
      { size: 12, type: "image/jpeg" },
      {
        contentType: "image/jpeg",
        upsert: false,
      }
    );
    expect(supabase.rpc).toHaveBeenCalledWith(
      "rider_mark_delivered",
      expect.objectContaining({ p_order_id: "O-1", p_proof_path: "R-1/O-1.jpg" })
    );
  });

  it("gives the uploaded bytes the content type the bucket allows", async () => {
    supabase.upload.mockResolvedValue({ error: null });

    await completeDelivery("R-1", INPUT);

    // Without this the part reaches Storage as text/plain and is refused
    // with 415 InvalidMimeType, which is what broke every photo upload.
    expect(blob.slice).toHaveBeenCalledWith(0, 12, "image/jpeg");
  });

  it("retries past a photo an earlier attempt already uploaded", async () => {
    supabase.upload.mockResolvedValue({
      error: { statusCode: "409", code: "ResourceAlreadyExists", message: "exists" },
    });

    await completeDelivery("R-1", INPUT);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("stops before the RPC when the upload genuinely fails", async () => {
    supabase.upload.mockResolvedValue({
      error: { statusCode: "500", message: "down" },
    });

    await expect(completeDelivery("R-1", INPUT)).rejects.toThrow(
      /upload the delivery photo/
    );
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("stops before the RPC when the photo cannot be read", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });

    await expect(completeDelivery("R-1", INPUT)).rejects.toThrow(/read that photo/);
    expect(supabase.upload).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
