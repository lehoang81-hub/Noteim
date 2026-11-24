/**
 * r2-setup — cài đặt một lần hạ tầng lưu trữ Cloudflare R2 cho Noteim
 * (C1-04, docs/12 §1.5). Chạy được lại nhiều lần (idempotent):
 *   node scripts/r2-setup.mjs
 *
 * Biến môi trường:
 * - CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID — chỉ dùng trong script này
 *   để gọi API Cloudflare, không ghi vào code/commit/log.
 * - R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET — biến
 *   app chạy; nếu thiếu thì script SUY RA từ token (Access Key ID là ID của
 *   token — GET /user/tokens/verify, Secret là SHA-256 của giá trị token)
 *   và GHI vào .env.local, KHÔNG in giá trị nào ra màn hình.
 *
 * Làm gì (in ra từng bước, không in khóa):
 * 1. Tạo bucket riêng tư (mặc định noteim-audio, location hint "apac" — cùng
 *    vùng Singapore với DB). Bucket có sẵn coi như xong.
 * 2. Đặt CORS cho https://noteim-seven.vercel.app và http://localhost:3000:
 *    cho phép PUT, GET, HEAD; header Content-Type, Range, ETag. Có sẵn thì
 *    ghi đè bằng cùng cấu hình (chạy lại an toàn).
 * 3. Đặt truy cập công khai KHÔNG bật (mặc định của R2 — script không ever
 *    gọi lệnh bật public).
 * 4. Thiếu biến R2_* → suy khóa S3 từ token và ghi .env.local (không in).
 * 5. In hướng dẫn set biến lên Vercel khi script không tự ghi được.
 *
 * Mã thoát: 0 xong; 2 thiếu biến cần thiết (in hướng dẫn); 1 lỗi API.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const API = "https://api.cloudflare.com/client/v4";

const token = process.env.CLOUDFLARE_API_TOKEN ?? "";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const bucketName = process.env.R2_BUCKET || "noteim-audio";
const locationHint = "apac";

const CORS_ORIGINS = ["https://noteim-seven.vercel.app", "http://localhost:3000"];

function log(step, message) {
  console.log(`[${step}] ${message}`);
}

function fail(code, message) {
  console.error(`[x] ${message}`);
  process.exit(code);
}

if (!token) {
  fail(
    2,
    [
      "Thiếu CLOUDFLARE_API_TOKEN — tạo một lần như sau:",
      "  1. Cloudflare Dashboard → My Profile → API Tokens → Create Token.",
      "  2. Dùng mẫu 'Edit Cloudflare Workers' hoặc Custom token với quyền",
      "     Account / Workers R2 Storage / Edit (cấp cho account chứa R2).",
      "  3. export CLOUDFLARE_API_TOKEN=<giá trị> rồi chạy lại script này.",
      "Script chỉ dùng token lúc cài đặt; app chạy chỉ cần biến R2_* bên dưới.",
    ].join("\n"),
  );
}
if (!accountId) {
  fail(
    2,
    [
      "Thiếu CLOUDFLARE_ACCOUNT_ID — xem ở Cloudflare Dashboard → R2 (mục Account ID)",
      "hoặc trang tổng quan tài khoản; export CLOUDFLARE_ACCOUNT_ID=<giá trị> rồi chạy lại.",
    ].join("\n"),
  );
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) ?? {};
  return { status: res.status, ok: res.ok, json };
}

/* ---------- 1. Tạo bucket riêng tư (location hint apac) ---------- */

log(1, `Tạo bucket "${bucketName}" (location hint ${locationHint}) nếu chưa có…`);
const created = await api("POST", `/accounts/${accountId}/r2/buckets`, {
  name: bucketName,
  locationHint,
});
if (created.ok) {
  log(1, `Đã tạo bucket mới: ${bucketName} (riêng tư mặc định — không có lệnh bật public nào được gọi).`);
} else {
  const code = created.json?.errors?.[0]?.code;
  const message = created.json?.errors?.[0]?.message ?? "";
  if (code === 10004 || /already/i.test(message)) {
    log(1, `Bucket đã có sẵn, bỏ qua bước tạo: ${bucketName}.`);
  } else {
    fail(1, `Không tạo được bucket (HTTP ${created.status}, mã ${code}): ${message}. Kiểm tra quyền token/Account ID rồi chạy lại.`);
  }
}

/* ---------- 2. CORS cho origin của app ---------- */

const corsRules = [
  {
    allowed: { origins: CORS_ORIGINS, methods: ["PUT", "GET", "HEAD"], headers: ["content-type", "range", "etag"] },
    expose: ["etag"],
    maxAgeSeconds: 3600,
  },
];

log(2, "Đặt CORS cho các origin của app (PUT/GET/HEAD; Content-Type, Range, ETag)…");
const cors = await api("PUT", `/accounts/${accountId}/r2/buckets/${bucketName}/cors`, { rules: corsRules });
if (cors.ok) {
  log(2, `Đã đặt CORS qua API: ${CORS_ORIGINS.join(", ")}.`);
} else {
  log(2, `API CORS trả HTTP ${cors.status} — thử lối S3 PutBucketCors bằng khóa suy từ token…`);
  // Lối dự phòng: khóa S3 suy từ token (xem bước 4) + PutBucketCors của S3 API.
  try {
    const { PutBucketCorsCommand, S3Client } = await import("@aws-sdk/client-s3");
    const keyId = await tokenAccessKeyId();
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: keyId, secretAccessKey: sha256Hex(token) },
    });
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucketName,
        CORSRules: [
          {
            AllowedOrigins: CORS_ORIGINS,
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["content-type", "range", "etag"],
            ExposeHeaders: ["etag"],
            MaxAgeSeconds: 3600,
          },
        ],
      }),
    );
    log(2, `Đã đặt CORS qua S3 API: ${CORS_ORIGINS.join(", ")}.`);
  } catch (error) {
    log(2, "Không đặt CORS tự động được. Đặt tay trong Dashboard → R2 → bucket → Settings → CORS policy, dán JSON sau:");
    console.log(JSON.stringify(corsRules, null, 2));
    log(2, `(Lỗi gốc: ${error instanceof Error ? error.message : String(error)} — chạy lại script sau khi đặt tay sẽ vẫn sạch.)`);
  }
}

/* ---------- 3/4. Suy khóa S3 từ token → .env.local (không in giá trị) ---------- */

async function tokenAccessKeyId() {
  const verify = await api("GET", "/user/tokens/verify");
  const id = verify.json?.result?.id;
  if (!id) {
    fail(1, `Không xác thực được token (HTTP ${verify.status}) — kiểm tra CLOUDFLARE_API_TOKEN.`);
  }
  return /** @type {string} */ (id);
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function upsertEnvLine(text, key, value) {
  const line = new RegExp(`^${key}=.*$`, "m");
  if (line.test(text)) return text.replace(line, `${key}=${value}`);
  return `${text}${text.endsWith("\n") || text === "" ? "" : "\n"}${key}=${value}\n`;
}

const hasR2Keys =
  Boolean(process.env.R2_ACCESS_KEY_ID) &&
  Boolean(process.env.R2_SECRET_ACCESS_KEY) &&
  Boolean(process.env.R2_ACCOUNT_ID) &&
  Boolean(process.env.R2_BUCKET);

if (hasR2Keys) {
  log(3, "Đã có đủ R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET trong môi trường — không ghi .env.local.");
  log(4, "Xong. Đừng quên đặt cùng các biến này trên Vercel (Production + Preview).");
} else {
  const keyId = await tokenAccessKeyId();
  const secret = sha256Hex(token);
  const envPath = new URL("../.env.local", import.meta.url).pathname;
  let text = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  text = upsertEnvLine(text, "R2_ACCOUNT_ID", accountId);
  text = upsertEnvLine(text, "R2_BUCKET", bucketName);
  text = upsertEnvLine(text, "R2_ACCESS_KEY_ID", keyId);
  text = upsertEnvLine(text, "R2_SECRET_ACCESS_KEY", secret);
  try {
    writeFileSync(envPath, text, { mode: 0o600 });
    log(3, "Đã suy khóa S3 từ token và GHI VÀO .env.local (không in giá trị ra màn hình, file không commit).");
    log(4, `Xong. Trên Vercel hãy đặt 4 biến: R2_ACCOUNT_ID, R2_BUCKET=${bucketName}, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (lấy giá trị trong .env.local vừa ghi).`);
  } catch {
    log(3, "Không ghi được .env.local — tự đặt 4 biến sau (giá trị KHÔNG in ở đây):");
    log(3, "  R2_ACCOUNT_ID = Account ID của bạn");
    log(3, `  R2_BUCKET = ${bucketName}`);
    log(3, "  R2_ACCESS_KEY_ID = ID của token (GET /user/tokens/verify)");
    log(3, "  R2_SECRET_ACCESS_KEY = SHA-256 hex của giá trị token");
  }
}
