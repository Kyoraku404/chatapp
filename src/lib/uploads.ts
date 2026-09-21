// Attachment uploads: validated client-side AND by storage.rules.
// Returns metadata for the message doc plus a renderable download URL.

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firebaseStorage } from "./firebaseClient";
import { attachmentPath, validateUpload } from "./validation";

export interface UploadedAttachment {
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  url: string;
}

export async function uploadAttachment(
  scope: "attachments/dm" | "attachments/group" | "attachments/space",
  scopeId: string,
  file: File,
): Promise<UploadedAttachment> {
  const err = validateUpload(file.type, file.size);
  if (err) throw new Error(err);
  const storage = firebaseStorage();
  if (!storage) throw new Error("Storage is not configured.");
  const ext = (file.name.split(".").pop() ?? "bin").slice(0, 5);
  // Random client message key keeps the path unguessable; the real message
  // doc references this exact storagePath.
  const key = `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const path = attachmentPath(scope, scopeId, key, ext);
  const snap = await uploadBytes(ref(storage, path), file, { contentType: file.type });
  const url = await getDownloadURL(snap.ref);
  return { storagePath: path, contentType: file.type, sizeBytes: file.size, url };
}
