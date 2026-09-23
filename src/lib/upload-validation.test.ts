import { describe, expect, it } from "vitest";
import { MAX_VIDEO_BYTES, validateUpload } from "./validation";

describe("R2 media limits", () => {
  it("accepts common phone video types up to the configured limit", () => {
    expect(validateUpload("video/mp4", MAX_VIDEO_BYTES)).toBeNull();
    expect(validateUpload("video/quicktime", 1024)).toBeNull();
    expect(validateUpload("video/webm", 1024)).toBeNull();
  });

  it("rejects oversized, empty, and executable uploads", () => {
    expect(validateUpload("video/mp4", MAX_VIDEO_BYTES + 1)).toBeTruthy();
    expect(validateUpload("image/png", 0)).toBeTruthy();
    expect(validateUpload("text/html", 1024)).toBeTruthy();
  });
});
