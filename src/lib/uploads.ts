"use client";

import { validateUpload } from "./validation";

export interface UploadedAttachment {
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  url: string;
}

export async function uploadAttachment(
  scope: "dm" | "group" | "space",
  scopeId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadedAttachment> {
  const err = validateUpload(file.type, file.size);
  if (err) throw new Error(err);
  const form = new FormData();
  form.set("scope", scope);
  form.set("scopeId", scopeId);
  form.set("file", file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/attachments/upload");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(95, Math.round(event.loaded / event.total * 95)));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and retry."));
    xhr.onload = () => {
      let body: { error?: string; attachment?: UploadedAttachment } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* handled below */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.attachment) {
        onProgress?.(100);
        resolve(body.attachment);
      } else reject(new Error(body.error || "Upload failed. Please retry."));
    };
    xhr.send(form);
  });
}
