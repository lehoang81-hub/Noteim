/**
 * Nhập buổi mẫu vào tài khoản mới (C1-03b, yêu cầu 4): người đăng nhập lần
 * đầu bấm "Mở buổi mẫu" thì fixture mẫu theo nghề được chép vào tài khoản
 * (is_sample=true, id riêng theo người dùng) — không lẫn với buổi thật và
 * KHÔNG nạp khi người dùng không yêu cầu. Mọi nơi liệt kê lọc is_sample ra
 * khỏi thư viện chính.
 */
import { z } from "zod";

import { routeHandler, requireContext } from "@/lib/data/server/context";
import { importSample } from "@/lib/data/server/sessions";
import { Profession } from "@/lib/data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({ profession: Profession }).strict();

export const POST = routeHandler(async (request: Request) => {
  const ctx = await requireContext();
  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "bad_request", message: "Cần profession" }, { status: 400 });
  }
  const result = await importSample(ctx, body.profession);
  return Response.json(result);
});
