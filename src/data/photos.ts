import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "../firebase";
import type { Photo } from "../types";

export const MAX_PHOTO_BYTES = 50 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif,image/avif";
const THUMB_SIZE = 480;

async function makeThumbnail(file: File) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: this image format can't be displayed in the browser (use JPEG, PNG or WebP).`);
  }
  const scale = Math.min(1, THUMB_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Thumbnail failed"))), "image/jpeg", 0.85),
  );
  const result = { blob, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return result;
}

function upload(path: string, data: Blob, contentType: string, onProgress: (bytes: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), data, {
      contentType,
      cacheControl: "private, max-age=31536000",
    });
    task.on(
      "state_changed",
      (s) => onProgress(s.bytesTransferred),
      reject,
      () => getDownloadURL(task.snapshot.ref).then(resolve, reject),
    );
  });
}

export function validatePhoto(file: File): string | null {
  if (!file.type.startsWith("image/")) return `${file.name} is not an image.`;
  if (file.size > MAX_PHOTO_BYTES) return `${file.name} is larger than ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`;
  return null;
}

/** Uploads the original image and a JPEG thumbnail. `onProgress` receives bytes sent so far. */
export async function uploadPhoto(
  uid: string,
  observationId: string,
  file: File,
  onProgress: (bytes: number) => void,
): Promise<Photo> {
  const error = validatePhoto(file);
  if (error) throw new Error(error);
  const id = crypto.randomUUID();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const base = `users/${uid}/observations/${observationId}/${id}`;
  const thumb = await makeThumbnail(file);

  // Progress is reported for the original only; the thumbnail is tiny in comparison.
  const [url, thumbUrl] = await Promise.all([
    upload(`${base}.${ext}`, file, file.type, onProgress),
    upload(`${base}_thumb.jpg`, thumb.blob, "image/jpeg", () => {}),
  ]);

  return {
    id,
    fileName: file.name,
    path: `${base}.${ext}`,
    url,
    thumbPath: `${base}_thumb.jpg`,
    thumbUrl,
    width: thumb.width,
    height: thumb.height,
    size: file.size,
  };
}

export async function deletePhotoFiles(photo: Photo) {
  await Promise.all(
    [photo.path, photo.thumbPath].map((p) =>
      deleteObject(ref(storage, p)).catch((err) => {
        // Already gone is fine.
        if (err?.code !== "storage/object-not-found") throw err;
      }),
    ),
  );
}
