/**
 * Kho giả cho chế độ R2_FAKE=1 (chỉ máy kiểm thử/e2e — C1-04 yêu cầu 6).
 *
 * Nhận PUT/GET/HEAD ngay trong app thay vì R2 thật: URL presign trỏ tới đây,
 * GET hỗ trợ Range để trình phát tua được. Không có chữ ký thật — chế độ này
 * KHÔNG BAO GIỜ bật trên production (xem r2Mode() chỉ bật khi R2_FAKE=1);
 * build production thiếu biến này thì các route /api/audio/fake luôn 404.
 */
import { fakeGetObjectResponse, fakeHeadObject, fakePutObject, r2Mode } from "@/lib/data/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ key: string[] }> };

function notFake(): Response {
  return Response.json({ error: "not_found", message: "Kho giả chỉ chạy khi R2_FAKE=1" }, { status: 404 });
}

export async function PUT(request: Request, { params }: Params): Promise<Response> {
  if (r2Mode() !== "fake") return notFake();
  const { key } = await params;
  const objectKey = key.map((part) => decodeURIComponent(part)).join("/");
  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const data = new Uint8Array(await request.arrayBuffer());
  const etag = fakePutObject(objectKey, data, contentType);
  return new Response(null, { status: 200, headers: { ETag: etag } });
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  if (r2Mode() !== "fake") return notFake();
  const { key } = await params;
  const objectKey = key.map((part) => decodeURIComponent(part)).join("/");
  const res = fakeGetObjectResponse(objectKey, request.headers.get("range"));
  if (!res) return Response.json({ error: "not_found", message: "Không thấy đối tượng" }, { status: 404 });
  return res;
}

export async function HEAD(_request: Request, { params }: Params): Promise<Response> {
  if (r2Mode() !== "fake") return notFake();
  const { key } = await params;
  const objectKey = key.map((part) => decodeURIComponent(part)).join("/");
  const obj = fakeHeadObject(objectKey);
  if (!obj) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": obj.contentType,
      "Content-Length": String(obj.size),
      "Accept-Ranges": "bytes",
    },
  });
}
