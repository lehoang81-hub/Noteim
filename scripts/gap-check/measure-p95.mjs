#!/usr/bin/env node
/**
 * Đo độ trễ endpoint Gap Check (đặc tả v1.1 §3 — KPI p95 ≤ 2 giây).
 * Cách chạy: khởi động app trước (`pnpm build && pnpm start -p 3100`), rồi:
 *   node scripts/gap-check/measure-p95.mjs [baseURL] [số lần rà thật] [templateId]
 * Mặc định: baseURL http://localhost:3100, 20 lần rà thật, template general_meeting.
 * Gồm 1 lần với transcript rỗng và 1 lần với transcript rác (ghi xa micro) để kiểm
 * luật "không bịa dữ liệu" (đặc tả §8). Script không chứa khóa API nào.
 */

const base = process.argv[2] || process.env.E2E_BASE_URL || "http://localhost:3100";
const realRuns = Number.parseInt(process.argv[3] ?? "20", 10) || 20;
const templateId = process.argv[4] || "general_meeting";

const TRANSCRIPT = `Bác: Em chào chị, mình bắt đầu buổi trao đổi kế hoạch quý này nhé. Chị xem lại báo cáo Q3, doanh thu mảng B2B đạt 78% target, phần còn lại chậm chủ yếu ở hợp đồng Vinaphone chưa ký xong.
Khách: Dạ em chào anh. Em cũng vừa xem, bên em lo là tháng 12 nghỉ Tết dương lịch nên tiến độ ký sẽ chậm thêm hai tuần.
Bác: Đúng, em cũng tính đến. Vậy mục tiêu hôm nay mình chốt ba việc: một là kế hoạch thu hồi công nợ của nhà cung cấp phía Hải Phòng, hai là ngân sách marketing Q4, ba là ai sẽ phụ trách demo sản phẩm cho khách hàng mới là công ty logistics.
Khách: Dạ, phần demo em đề nghị anh Tuấn phía giải pháp đảm nhận vì anh ấy đang nắm nền tảng API, check lại KPI phase 2 của bên đó rồi.
Bác: Ok, em ghi anh Tuấn. Về ngân sách marketing Q4, chị nói với em con số tối đa là 450 triệu, trong đó 180 triệu chạy quảng cáo tìm kiếm, còn lại cho content và sự kiện cuối năm.
Khách: Dạ đúng, và em muốn chốt luôn deadline nộp kế hoạch ngân sách là ngày 25 tháng 11 để kịp duyệt.
Bác: Được, mình chốt ngày 25/11. Còn công nợ Hải Phòng, chị sẽ gửi chứng từ vào đầu tuần sau, em nhận và xử lý trong 5 ngày làm việc.
Khách: Dạ vâng. À mà phần hợp đồng Vinaphone, lần sau họ mới trả lời về điều khoản bảo mật.
Bác: Vậy mình để phần đó vào việc còn treo, hẹn tuần sau họp lại xem tiến độ cả ba việc này tiếp.`;

const GARBAGE = "ksjf ăsđ ơưe ~~~ 0123 /*- err kwe nąą ưwa sđfjkw";

const sessionId = `measure-${Date.now()}`;
const clientId = `measure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function checkOnce(transcript) {
  const startedAt = Date.now();
  try {
    const res = await fetch(`${base}/api/sessions/${sessionId}/gap-check`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-noteim-client": clientId,
        // Đo tải là việc hạ tầng, không mô phỏng người dùng Free — tránh vướng
        // rate limit 10 lượt/ngày giữa chừng (đã thấy hoạt động ở lần đo trước).
        "x-noteim-plan": "pro",
      },
      body: JSON.stringify({ templateId, transcript, transcriptUntilMs: 0 }),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ms: Date.now() - startedAt, json };
  } catch (error) {
    return { status: 0, ms: Date.now() - startedAt, json: { message: String(error) } };
  }
}

function percentile(sortedList, ratio) {
  if (sortedList.length === 0) return 0;
  const index = Math.min(sortedList.length - 1, Math.ceil(ratio * sortedList.length) - 1);
  return sortedList[index];
}

const results = [];

console.log(`Đo tại ${base}, template ${templateId}, ${realRuns} lần rà thật (session ${sessionId})`);

const emptyRun = await checkOnce("");
console.log(
  `transcript rỗng     → HTTP ${emptyRun.status}, ${emptyRun.ms} ms, ` +
    `filled=${emptyRun.json?.result?.slots_status?.filter((slot) => slot.filled).length ?? "?"} ô, ` +
    `ready_to_close=${emptyRun.json?.result?.ready_to_close ?? "?"}`,
);
results.push(emptyRun);

const garbageRun = await checkOnce(GARBAGE);
console.log(
  `transcript rác      → HTTP ${garbageRun.status}, ${garbageRun.ms} ms, ` +
    `filled=${garbageRun.json?.result?.slots_status?.filter((slot) => slot.filled).length ?? "?"} ô`,
);
results.push(garbageRun);

for (let index = 1; index <= realRuns; index += 1) {
  const run = await checkOnce(TRANSCRIPT);
  const provider = run.json?.meta?.provider ?? "?";
  console.log(`rà thật #${String(index).padStart(2, "0")} → HTTP ${run.status}, ${run.ms} ms (provider ${provider}, ${run.json?.error ?? "ok"})`);
  results.push(run);
}

const okLatencies = results
  .filter((run) => run.status === 200)
  .map((run) => run.ms)
  .sort((a, b) => a - b);
const failed = results.filter((run) => run.status !== 200).length;

if (okLatencies.length === 0) {
  console.error("Không có lần rà nào thành công, không tính được p95.");
  process.exit(1);
}

const p50 = percentile(okLatencies, 0.5);
const p95 = percentile(okLatencies, 0.95);
console.log("--- Kết quả ---");
console.log(`Thành công: ${okLatencies.length}/${results.length} (thất bại: ${failed})`);
console.log(`p50 = ${p50} ms, p95 = ${p95} ms, max = ${okLatencies.at(-1)} ms, min = ${okLatencies[0]} ms`);
console.log(p95 <= 2000 ? "KPI p95 ≤ 2 giây: ĐẠT" : `KPI p95 ≤ 2 giây: KHÔNG ĐẠT (p95 = ${p95} ms)`);
process.exit(failed > 0 ? 2 : 0);
