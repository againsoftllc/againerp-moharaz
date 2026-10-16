import type { ElimUploadImageResponse, ElimPlatform, ImageSearchParams, ElimProductListResponse } from "../../types";
import type { ElimClient } from "./client";
import { searchProductsByImage } from "./products";

/** Upload a local image file; returns Elim image_id for search-img. */
export async function uploadImage(
  client: ElimClient,
  file: File | Blob,
  platform?: ElimPlatform,
): Promise<ElimUploadImageResponse> {
  const settings = client.getSettings();
  const form = new FormData();
  const filename = file instanceof File ? file.name : "upload.jpg";
  form.append("file", file, filename);
  form.append("platform", platform ?? settings.defaultPlatform);

  const { data } = await client.request<ElimUploadImageResponse>({
    method: "POST",
    path: "/v1/products/upload-image",
    formData: form,
  });
  return data;
}

/** Convenience: upload then search by returned image id. */
export async function uploadAndSearchByImage(
  client: ElimClient,
  file: File | Blob,
  params?: Omit<ImageSearchParams, "imgUrl" | "imgId">,
): Promise<{ upload: ElimUploadImageResponse; results: ElimProductListResponse }> {
  const upload = await uploadImage(client, file, params?.platform);
  const imageId = upload.data?.image_id;
  if (!imageId) {
    throw new Error("No image_id returned from Elim upload.");
  }
  const results = await searchProductsByImage(client, {
    ...params,
    imgId: imageId,
  });
  return { upload, results };
}
