/**
 * r2-smoke — kiểm nhanh kho R2 thật bằng đúng thư viện app dùng
 * (C1-04 yêu cầu 6: presign → PUT 1 file nhỏ → HEAD → GET Range → xóa).
 *
 * Chạy khi đã có biến môi trường R2_* (không cần app đang chạy, không đụng
 * DATABASE_URL, không đụng người dùng/buổi nào):
 *   node scripts/r2-smoke.mjs
 *
 * Thứ tự kiểm:
 *  1. Presign PUT cho khóa smoke/r2-smoke-<thời điểm>.bin (sống 10 phút)
 *  2. PUT thẳng thân nhỏ (~1 KiB) lên URL vừa nhận
 *  3. HEAD đối tượng — kích thước phải khớp
 *  4. Presign GET rồi GET với Range: bytes=0-9 — phải trả 206 + đúng byte
 *  5. DELETE đối tượng — HEAD sau xóa phải 404
 *
 * Mã thoát: 0 mọi bước đạt; 1 có bước hỏng (in rõ bước nào).
 */
import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error(
    "Thiếu biến R2_* — chạy `node scripts/r2-setup.mjs` trước (ghi .env.local), rồi:\n" +
      "  export $(grep -v '^#' .env.local | xargs) && node scripts/r2-smoke.mjs",
  );
  process.exit(2);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

let failures = 0;
function step(name, cond, detail = "") {
  if (cond) console.log(`  [đạt] ${name}`);
  else {
    failures++;
    console.error(`  [THẤT BẠI] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const key = `smoke/r2-smoke-${Date.now()}.bin`;
const payload = new Uint8Array(1024).map((_, i) => (i * 31) % 251);
const payloadHash = createHash("md5").update(payload).digest("hex");

console.log(`Kiểm bucket "${R2_BUCKET}" với đối tượng ${key}`);

// 1. Presign PUT
let putUrl;
try {
  putUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: "application/octet-stream" }),
    { expiresIn: 600 },
  );
  step("1. Presign PUT nhận được URL", typeof putUrl === "string" && putUrl.length > 0);
} catch (error) {
  step("1. Presign PUT nhận được URL", false, error instanceof Error ? error.message : String(error));
  process.exit(1);
}

// 2. PUT thẳng
try {
  const res = await fetch(putUrl, { method: "PUT", body: payload, headers: { "Content-Type": "application/octet-stream" } });
  step("2. PUT thẳng lên R2 thành công (HTTP 200)", res.status === 200, `HTTP ${res.status}`);
} catch (error) {
  step("2. PUT thẳng lên R2 thành công (HTTP 200)", false, error instanceof Error ? error.message : String(error));
}

// 3. HEAD
try {
  const res = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  step("3. HEAD thấy đúng kích thước 1024 byte", res.ContentLength === 1024, `ContentLength=${String(res.ContentLength)}`);
  step("3b. ETag của R2 khớp MD5 thân đã gửi", (res.ETag ?? "").replaceAll('"', "") === payloadHash, `ETag=${String(res.ETag)}`);
} catch (error) {
  step("3. HEAD thấy đúng kích thước 1024 byte", false, error instanceof Error ? error.message : String(error));
}

// 4. Presign GET + Range
try {
  const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: 600 });
  const res = await fetch(getUrl, { headers: { Range: "bytes=0-9" } });
  const bytes = new Uint8Array(await res.arrayBuffer());
  step("4. GET có Range trả 206", res.status === 206, `HTTP ${res.status}`);
  step(
    "4b. 10 byte đầu khớp nguồn",
    bytes.length === 10 && bytes.every((b, i) => b === payload[i]),
  );
  step("4c. Có Content-Range", (res.headers.get("content-range") ?? "").includes("1024"));
} catch (error) {
  step("4. GET có Range trả 206", false, error instanceof Error ? error.message : String(error));
}

// 5. DELETE
try {
  await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  let gone = false;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch {
    gone = true; // HEAD sau xóa nổ = đối tượng đã mất (đúng ý)
  }
  step("5. DELETE xong HEAD phải không còn đối tượng", gone);
} catch (error) {
  step("5. DELETE xong HEAD phải không còn đối tượng", false, error instanceof Error ? error.message : String(error));
}

if (failures > 0) {
  console.error(`\nCó ${failures} bước hỏng — xem từng dòng [THẤT BẠI] ở trên.`);
  process.exit(1);
}
console.log("\nMọi bước đạt: presign → PUT → HEAD → GET Range → xóa hoạt động trên R2 thật.");
