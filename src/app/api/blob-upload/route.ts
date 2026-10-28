import { issueSignedToken } from "@vercel/blob";
import {
  handleUpload,
  handleUploadPresigned,
  type HandleUploadBody,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";

const ALLOWED_TYPES = ["audio/*", "video/mp4", "application/octet-stream"];
const MAX_BYTES = 60 * 1024 * 1024;

/**
 * Lets the browser (and `npm run seed`) upload recordings straight to private Blob storage,
 * bypassing the 4.5 MB function body limit. Uses presigned URLs, which work with the
 * BLOB_STORE_ID + OIDC setup Vercel creates today; falls back to client tokens for stores
 * that still use BLOB_READ_WRITE_TOKEN.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadPresignedBody | HandleUploadBody;
  try {
    if (body.type === "blob.generate-presigned-url" || (body.type === "blob.upload-completed" && !process.env.BLOB_READ_WRITE_TOKEN)) {
      const result = await handleUploadPresigned({
        body: body as HandleUploadPresignedBody,
        request,
        getSignedToken: async (pathname) => {
          if (!pathname.startsWith("calls/")) throw new Error("Invalid upload path");
          const token = await issueSignedToken({
            pathname,
            operations: ["put"],
            allowedContentTypes: ALLOWED_TYPES,
            maximumSizeInBytes: MAX_BYTES,
            validUntil: Date.now() + 15 * 60 * 1000,
          });
          return {
            token,
            urlOptions: { allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true },
          };
        },
      });
      return Response.json(result);
    }

    const result = await handleUpload({
      body: body as HandleUploadBody,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("calls/")) throw new Error("Invalid upload path");
        return { allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true };
      },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
