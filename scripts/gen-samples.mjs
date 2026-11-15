/*
 * Sinh 6 buổi ghi mẫu theo nghề cho M4-04: fixtures/samples/<nghề>.json.
 * Chạy: node scripts/gen-samples.mjs
 * - realestate_sales và business_owner sao từ fixture hiện có (đổi id, is_sample).
 * - Bốn nghề còn lại dựng mới: nội dung tiếng Việt như thật, không tên người thật,
 *   30 đoạn lời trở lên, dải giọng sinh từ speaker_spans có khoảng lặng.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "fixtures", "samples");
mkdirSync(OUT, { recursive: true });

/* ---------- Dựng dải giọng ---------- */

function buildSpans(durationSec, speakers) {
  // Lượt nói xen kẽ theo tỷ lệ, mỗi lượt 20-60 giây, chừa khoảng lặng nhỏ
  const spans = [];
  let t = 4;
  let turn = 0;
  const order = [];
  while (order.reduce((n, s) => n + s, 0) < 1) order.push(1);
  while (t < durationSec - 5) {
    const sp = speakers[turn % speakers.length];
    const len = Math.min(durationSec - t - 2, 20 + ((turn * 37) % 40));
    const gap = 1 + (turn % 3);
    spans.push({ speaker_id: sp.id, start_sec: Math.round(t), end_sec: Math.round(t + len) });
    t += len + gap;
    turn++;
  }
  if (spans.length) spans[spans.length - 1].end_sec = durationSec - 3;
  return spans;
}

function buildPeaks(spans, durationSec, seed = 7) {
  const peaks = [];
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < 600; i++) {
    const t = (i / 600) * durationSec;
    const inSpan = spans.find((sp) => t >= sp.start_sec && t < sp.end_sec);
    if (inSpan) {
      const wave = 0.55 + 0.25 * Math.sin(i / 7 + rand()) + 0.15 * Math.sin(i / 2.3);
      peaks.push(Math.round(Math.max(0.15, Math.min(1, wave * (0.65 + rand() * 0.45))) * 100) / 100);
    } else {
      peaks.push(Math.round((0.05 + rand() * 0.08) * 100) / 100);
    }
  }
  return peaks;
}

function thumbFrom(peaks) {
  const out = [];
  for (let i = 0; i < 40; i++) {
    const from = Math.floor((i * peaks.length) / 40);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / 40));
    let max = 0;
    for (let j = from; j < to; j++) max = Math.max(max, peaks[j] ?? 0);
    out.push(max);
  }
  return out;
}

function colorsThumb(spans, durationSec, speakers) {
  const out = [];
  for (let i = 0; i < 40; i++) {
    const t = ((i + 0.5) / 40) * durationSec;
    const span = spans.find((sp) => t >= sp.start_sec && t < sp.end_sec);
    const sp = speakers.find((s) => s.id === span?.speaker_id);
    out.push(sp?.color_index ?? 0);
  }
  return out;
}

/* ---------- Dựng transcript từ các lượt nói ---------- */

function buildTranscript(spans, durationSec, lines) {
  // lines: Map speaker_id -> mảng câu; lấy lần lượt, chen khoảng nghỉ
  const segs = [];
  const idx = Object.fromEntries(Object.keys(lines).map((k) => [k, 0]));
  let n = 0;
  for (const span of spans) {
    const perSpan = span.end_sec - span.start_sec > 120 ? 3 : 2;
    const slice = (span.end_sec - span.start_sec) / perSpan;
    for (let i = 0; i < perSpan; i++) {
      const pool = lines[span.speaker_id];
      const text = pool[idx[span.speaker_id] % pool.length];
      idx[span.speaker_id]++;
      const start = Math.round(span.start_sec + i * slice);
      const end = Math.min(span.end_sec, Math.round(start + slice * 0.86));
      segs.push({ id: `seg-${String(n).padStart(2, "0")}`, speaker_id: span.speaker_id, start_sec: start, end_sec: end, text });
      n++;
    }
    if (segs.length >= 34) break;
  }
  return segs;
}

/* ---------- Định nghĩa nội dung 4 nghề mới ---------- */

const DEFS = {
  doctor: {
    file: "doctor",
    id: "s-sample-doctor",
    title: "Buổi khám định kỳ của chị Hằng",
    templateId: "tpl-doctor",
    duration: 1830,
    created: "2026-11-12T10:30:00+07:00",
    summary:
      "Chị Hằng khám định kỳ tiểu đường type 2. Đường huyết ổn hơn tháng trước, vẫn còn mỏi chân buổi chiều. Chị được dặn tiếp tục chế độ ăn, uống thuốc đều và làm xét nghiệm HbA1c trước buổi hẹn sau.",
    speakers: [
      { id: "SPK_01", name: "Bạn", me: true, ratio: 44, sample: 20 },
      { id: "SPK_02", name: "Chị Hằng", me: false, ratio: 47, sample: 120 },
      { id: "SPK_03", name: null, me: false, ratio: 9, sample: 300 },
    ],
    lines: {
      SPK_01: [
        "Chị ngồi xuống đây cho em. Tuần trước chị nói vẫn mỏi chân, dạo này thế nào ạ?",
        "Chị đo đường huyết lúc đói bao nhiêu sáng nay?",
        "Vậy tốt hơn tuần trước rồi. Chị có bỏ liều buổi trưa hôm nào không?",
        "Chân chị sưng không, hay chỉ mỏi thôi?",
        "Em cho chị làm thêm xét nghiệm HbA1c để đánh giá ba tháng qua.",
        "Chị uống Metformin buổi tối sau ăn nhé, đừng uống lúc bụng đói.",
      ],
      SPK_02: [
        "Vẫn mỏi ấy bác sĩ, nhất là từ bốn giờ chiều trở đi.",
        "Sáng nay em đo được 6,8 bác sĩ ạ.",
        "Dạ có một hôm em quên vì đi chợ về muộn.",
        "Chỉ mỏi thôi, không sưng ạ.",
        "Em sợ làm máu nên hồi hộp lắm bác sĩ.",
      ],
      SPK_03: [
        "Con cháu chở chị đi khám mỗi sáng, bác sĩ cứ dặn rồi con nhớ cho.",
      ],
    },
    topics: [
      { section: "tpl-doctor-s1", title: "Lý do đến khám", tag: "pending", bullets: [["Khám định kỳ 3 tháng, vẫn mỏi chân buổi chiều", 40], ["Không sưng chân, không đau ngực", 95]] },
      { section: "tpl-doctor-s2", title: "Lời bệnh nhân kể", tag: "idea", bullets: [["Đường huyết lúc đói sáng nay 6,8 mmol/L, tốt hơn tháng trước", 180], ["Đã quên một liều thuốc buổi trưa trong tuần", 340]] },
      { section: "tpl-doctor-s3", title: "Chỉ định và đơn thuốc đã dặn", tag: "figure", bullets: [["Xét nghiệm HbA1c làm trước buổi hẹn sau hai tuần", 620], ["Tiếp tục Metformin, uống sau ăn tối", 760]] },
      { section: "tpl-doctor-s4", title: "Dặn dò", tag: "decided", bullets: [["Giữ chế độ ăn giảm tinh bột, đi bộ 30 phút mỗi ngày", 980], ["Gọi phòng khám nếu mỏi chân chuyển sang sưng", 1120]] },
      { section: "tpl-doctor-s5", title: "Hẹn tái khám", tag: "decided", bullets: [["Hẹn tái khám lúc 9 giờ thứ Năm tuần sau", 1320]] },
    ],
    tasks: [
      { task: "Nhắc chị Hằng làm xét nghiệm HbA1c trước buổi hẹn sau", assignee: "c-me", due: "2026-11-19", priority: "high", ts: 620 },
      { task: "Gọi hỏi kết quả xét nghiệm của chị Hằng", assignee: null, due: "2026-11-24", priority: "medium", ts: 700 },
    ],
    chat: [
      { q: "Bệnh nhân kể triệu chứng từ khi nào?", a: "Chị Hằng nói mỏi chân từ trước buổi khám trước, nặng hơn từ bốn giờ chiều trở đi, không sưng chân.", c: [40, 180] },
      { q: "Tôi đã dặn kiêng gì?", a: "Bạn dặn chị Hằng giữ chế độ ăn giảm tinh bột và đi bộ 30 phút mỗi ngày.", c: [980] },
    ],
  },

  lawyer: {
    file: "lawyer",
    id: "s-sample-lawyer",
    title: "Tư vấn tranh chấp hợp đồng thuê cho ông Phước",
    templateId: "tpl-lawyer",
    duration: 2100,
    created: "2026-11-12T15:00:00+07:00",
    summary:
      "Ông Phước thuê mặt bằng kinh doanh từ 2024, chủ nhà đơn phương tăng giá 30% giữa hợp đồng. Luật sư phân tích điều khoản chốt giá, tư vấn gửi thư thương lượng và chuẩn bị hồ sơ nếu phải khởi kiện.",
    speakers: [
      { id: "SPK_01", name: "Bạn", me: true, ratio: 49, sample: 30 },
      { id: "SPK_02", name: "Ông Phước", me: false, ratio: 45, sample: 200 },
      { id: "SPK_03", name: null, me: false, ratio: 6, sample: 500 },
    ],
    lines: {
      SPK_01: [
        "Ông kể em nghe từ đầu nhé, hợp đồng ký tháng nào và thời hạn bao lâu?",
        "Điều khoản chốt giá trong hợp đồng viết thế nào, ông đọc giúp em?",
        "Như vậy thì điều 5 ghi rõ giá cố định 24 tháng. Việc tăng giữa chừng là trái hợp đồng.",
        "Bước đầu em đề nghị gửi thư thương lượng, nêu căn cứ và đề xuất phương án.",
        "Nếu chủ nhà không phản hồi trong 10 ngày, mình chuẩn bị hồ sơ khởi kiện.",
        "Ông chuẩn bị giúp: hợp đồng bản gốc, biên lai trả tiền 12 tháng gần nhất và tin nhắn trao đổi.",
      ],
      SPK_02: [
        "Hợp đồng em ký tháng 3 năm 2024, thuê 24 tháng, trả mỗi quý.",
        "Điều 5 ghi giá cố định suốt thời hạn, không phụ thuộc thị trường.",
        "Tháng trước chủ nhà nhắn tin bảo tăng 30% vì hàng xóm tăng theo.",
        "Em lo lắm, cửa hàng đang kinh doanh ổn, chuyển chỗ là mất khách.",
        "Vậy em gom giấy tờ, mấy ngày nữa gửi lại bác luật sư xem.",
      ],
      SPK_03: ["Em là người viết hợp đồng giúp hai bên, cần em bổ sung gì bác bảo em."],
    },
    topics: [
      { section: "tpl-lawyer-s1", title: "Sự việc theo trình tự thời gian", tag: "pending", bullets: [["Ký hợp đồng tháng 3/2024, thời hạn 24 tháng, giá cố định", 60], ["Chủ nhà nhắn tin đơn phương tăng giá 30% giữa hợp đồng", 420]] },
      { section: "tpl-lawyer-s2", title: "Yêu cầu của khách hàng", tag: "idea", bullets: [["Muốn giữ mặt bằng, không muốn chuyển chỗ vì mất khách", 560]] },
      { section: "tpl-lawyer-s3", title: "Vấn đề pháp lý cần xem", tag: "risk", bullets: [["Điều 5 chốt giá 24 tháng: tăng giá giữa chừng trái hợp đồng", 700], ["Bằng chứng nhắn tin của chủ nhà cần giữ nguyên văn", 860]] },
      { section: "tpl-lawyer-s4", title: "Tài liệu cần bổ sung", tag: "pending", bullets: [["Hợp đồng bản gốc, biên lai 12 tháng, tin nhắn trao đổi", 1040]] },
      { section: "tpl-lawyer-s5", title: "Mốc thời hạn", tag: "figure", bullets: [["Gửi thư thương lượng trước thứ Sáu tuần này", 1200], ["Chủ nhà phản hồi trong 10 ngày, quá hạn mới tính phương án kiện", 1380]] },
    ],
    tasks: [
      { task: "Soạn thư thương lượng gửi chủ nhà mặt bằng", assignee: "c-me", due: "2026-11-18", priority: "high", ts: 1200 },
      { task: "Nhắc ông Phước gửi hồ sơ giấy tờ", assignee: null, due: "2026-11-17", priority: "medium", ts: 1040 },
    ],
    chat: [
      { q: "Liệt kê các mốc ngày tháng khách nhắc.", a: "Ông Phước nhắc: ký hợp đồng tháng 3/2024, thời hạn 24 tháng, và tin tăng giá tháng trước (10/2026).", c: [60, 420] },
      { q: "Khách còn thiếu giấy tờ gì?", a: "Cần bổ sung: hợp đồng bản gốc, biên lai trả tiền 12 tháng gần nhất và tin nhắn trao đổi với chủ nhà.", c: [1040] },
    ],
  },

  architect: {
    file: "architect",
    id: "s-sample-architect",
    title: "Họp hiện trường nhà phố Lạch Tray",
    templateId: "tpl-architect",
    duration: 1680,
    created: "2026-11-11T09:00:00+07:00",
    summary:
      "Họp hiện trường nhà phố 4 tầng Lạch Tray: chủ nhà muốn mở rộng sân sau, đổi gạch phòng khách và dời vị trí tủ bếp. Thi công xác nhận tồn kho trần, cần chốt lại tiến độ thạch cao trong tuần.",
    speakers: [
      { id: "SPK_01", name: "Bạn", me: true, ratio: 46, sample: 40 },
      { id: "SPK_02", name: "Anh Quân", me: false, ratio: 34, sample: 180 },
      { id: "SPK_03", name: "Anh Hùng", me: false, ratio: 20, sample: 400 },
    ],
    lines: {
      SPK_01: [
        "Mình đi quanh nhà một vòng rồi chốt từng hạng mục nhé.",
        "Sân sau mở rộng 1,2 mét thì mình phải làm lại mái che, anh Quân đồng ý chứ?",
        "Gạch phòng khách đổi sang gạch 60x60 vân đá, mình gửi ba mẫu cho chị chủ chọn.",
        "Tủ bếp dời sang tường đông thì đường nước phải đi lại, anh Hùng xem giá thêm bao nhiêu.",
        "Trần thạch bao tồn kho còn bao nhiêu mét vuông?",
        "Vậy tuần này mình chốt xong ba hạng mục, thứ Sáu mình gửi biên bản hiện trường.",
      ],
      SPK_02: [
        "Mình muốn sân sau rộng ra để dựng giàn hoa, chi phí bao nhiêu anh báo sớm.",
        "Gạch 60x60 sáng hơn, chị nhà em thích mẫu vân đá xám.",
        "Tủ bếp dời thì chỗ cũ mình làm kệ trang trí nhé.",
      ],
      SPK_03: [
        "Trần thạch cao còn 42 mét, đủ cho tầng hai, tầng ba phải đặt thêm.",
        "Đường nước dời tủ bếp phát sinh khoảng ba triệu, tuần sau mình làm được.",
      ],
    },
    topics: [
      { section: "tpl-architect-s1", title: "Yêu cầu thay đổi", tag: "pending", bullets: [["Mở rộng sân sau 1,2 mét, làm lại mái che", 60], ["Dời tủ bếp sang tường đông, làm kệ ở chỗ cũ", 620]] },
      { section: "tpl-architect-s2", title: "Số đo và vật liệu được nhắc", tag: "figure", bullets: [["Gạch phòng khách đổi gạch 60x60 vân đá xám, ba mẫu chờ chọn", 380], ["Trần thạch cao tồn kho 42 mét vuông, tầng ba đặt thêm", 900]] },
      { section: "tpl-architect-s3", title: "Hạng mục tồn tại", tag: "risk", bullets: [["Tiến độ thạch cao tầng ba cần chốt lại trong tuần", 980]] },
      { section: "tpl-architect-s4", title: "Việc theo từng bên", tag: "decided", bullets: [["Thiết kế: gửi ba mẫu gạch và biên bản hiện trường thứ Sáu", 1180], ["Thi công: báo giá dời đường nước, đặt thêm trần tầng ba", 1260]] },
    ],
    tasks: [
      { task: "Gửi ba mẫu gạch 60x60 cho anh Quân chọn", assignee: "c-me", due: "2026-11-14", priority: "medium", ts: 380 },
      { task: "Báo giá dời đường nước cho tủ bếp", assignee: null, due: "2026-11-18", priority: "medium", ts: 1260 },
      { task: "Đặt thêm trần thạch cao tầng ba", assignee: null, due: "2026-11-20", priority: "high", ts: 900 },
    ],
    chat: [
      { q: "Chủ nhà đổi ý những gì so với lần trước?", a: "So với lần trước: thêm mở rộng sân sau 1,2 mét, đổi gạch phòng khách sang 60x60 vân đá và dời tủ bếp sang tường đông.", c: [60, 380, 620] },
      { q: "Liệt kê số đo.", a: "Sân sau mở rộng 1,2 mét; gạch phòng khách 60x60; trần thạch cao tồn kho 42 mét vuông.", c: [60, 380, 900] },
    ],
  },

  notary: {
    file: "notary",
    id: "s-sample-notary",
    title: "Phiên công chứng chuyển nhượng căn hộ Hoàng Quốc Việt",
    templateId: "tpl-notary",
    duration: 1560,
    created: "2026-11-11T14:00:00+07:00",
    summary:
      "Phiên công chứng hợp đồng chuyển nhượng căn hộ 62 mét vuông Hoàng Quốc Việt giữa anh Dũng và chị Mai. Đã xuất trình đủ giấy tờ chủ quyền; còn thiếu giấy xác nhận tình trạng hôn nhân của bên mua, hẹn bổ sung trước ngày ký.",
    speakers: [
      { id: "SPK_01", name: "Bạn", me: true, ratio: 52, sample: 30 },
      { id: "SPK_02", name: "Anh Dũng", me: false, ratio: 32, sample: 200 },
      { id: "SPK_03", name: "Chị Mai", me: false, ratio: 16, sample: 380 },
    ],
    lines: {
      SPK_01: [
        "Hai bên ngồi đây, mình kiểm tra giấy tờ rồi so hợp đồng nhé.",
        "Sổ đỏ nguyên bản, quy hoạch không vướng. Bên mua xuất trình giấy tờ tùy thân nào?",
        "Chuyển nhượng 62 mét vuông, giá 3,2 tỷ. Hai bên xác nhận đúng giá thỏa thuận chứ?",
        "Bên mua còn thiếu giấy xác nhận tình trạng hôn nhân, bổ sung trước ngày ký nhé.",
        "Nội dung mình đã giải thích quyền và nghĩa vụ của hai bên như điều 3 và điều 5.",
        "Mình hẹn 9 giờ thứ Ba tuần sau làm thủ tục ký và chứng thực.",
      ],
      SPK_02: [
        "Tôi là bên bán, sổ đỏ tôi mang bản gốc đầy đủ đây.",
        "Đúng giá 3,2 tỷ, hai bên tự thỏa thuận, không ai ép buộc gì.",
        "Tôi cam kết căn hộ không tranh chấp, không thế chấp ngân hàng.",
      ],
      SPK_03: [
        "Em là bên mua, giấy tờ tùy thân em mang rồi.",
        "Giấy xác nhận hôn nhân em xin buổi mai gửi lại văn phòng.",
        "Em muốn thanh toán qua escrow cho chắc, bên mình hỗ trợ chứ ạ?",
      ],
    },
    topics: [
      { section: "tpl-notary-s1", title: "Các bên tham gia", tag: "decided", bullets: [["Bên bán: anh Dũng. Bên mua: chị Mai. Người làm chứng có mặt", 50]] },
      { section: "tpl-notary-s2", title: "Loại giao dịch", tag: "decided", bullets: [["Chuyển nhượng căn hộ 62 mét vuông, giá 3,2 tỷ đồng", 340]] },
      { section: "tpl-notary-s3", title: "Giấy tờ đã xuất trình", tag: "figure", bullets: [["Sổ đỏ bản gốc, hai căn cước công dân, sổ hộ khẩu", 180]] },
      { section: "tpl-notary-s4", title: "Giấy tờ còn thiếu", tag: "risk", bullets: [["Bên mua thiếu giấy xác nhận tình trạng hôn nhân", 620]] },
      { section: "tpl-notary-s5", title: "Nội dung đã giải thích cho các bên", tag: "idea", bullets: [["Quyền và nghĩa vụ hai bên theo điều 3 và điều 5 của hợp đồng", 860], ["Phương án thanh toán qua escrow được hai bên đồng ý xem xét", 980]] },
      { section: "tpl-notary-s6", title: "Lịch hẹn", tag: "decided", bullets: [["Hẹn ký và chứng thực 9 giờ thứ Ba tuần sau", 1200]] },
    ],
    tasks: [
      { task: "Nhắc chị Mai bổ sung giấy xác nhận tình trạng hôn nhân", assignee: null, due: "2026-11-16", priority: "high", ts: 620 },
      { task: "Soạn lại hợp đồng theo giá 3,2 tỷ và điều khoản escrow", assignee: "c-me", due: "2026-11-15", priority: "medium", ts: 980 },
    ],
    chat: [
      { q: "Còn thiếu giấy tờ gì?", a: "Bên mua còn thiếu giấy xác nhận tình trạng hôn nhân, hẹn bổ sung trước ngày ký.", c: [620] },
      { q: "Tôi đã giải thích những quyền và nghĩa vụ nào?", a: "Bạn đã giải thích quyền và nghĩa vụ của hai bên theo điều 3 và điều 5 của hợp đồng chuyển nhượng.", c: [860] },
    ],
  },
};

/* ---------- Dựng fixture hoàn chỉnh ---------- */

function buildFixture(def) {
  const speakers = def.speakers.map((sp, i) => ({
    id: sp.id,
    contact_id: null,
    display_name: sp.name ?? `Người nói ${i + 1}`,
    is_me: sp.me,
    color_index: i,
    talk_ratio_percent: sp.ratio,
    sample_start_sec: sp.sample,
  }));
  const spans = buildSpans(def.duration, speakers);
  const peaks = buildPeaks(spans, def.duration, def.file.length);
  const transcript = buildTranscript(spans, def.duration, def.lines);

  const topics = def.topics.map((tp, i) => ({
    id: `t-${i}`,
    section_id: tp.section,
    title: tp.title,
    start_sec: tp.bullets[0][1],
    end_sec: Math.min(def.duration - 5, tp.bullets[tp.bullets.length - 1][1] + 90),
    tag: tp.tag,
    bullets: tp.bullets.map(([text, ts], j) => ({
      id: `b-${i}-${j}`,
      text,
      timestamp_sec: ts,
      speaker_id: j % 2 === 0 ? speakers[i % speakers.length].id : speakers[(i + 1) % speakers.length].id,
      is_quote: j === 1 && tp.tag === "risk",
      edited: false,
      note_ids: [],
    })),
  }));

  const openTasks = def.tasks.filter((t) => !t.done).length;
  const detail = {
    id: def.id,
    user_id: "u-hoang",
    workspace_id: null,
    title: def.title,
    template_id: def.templateId,
    language: "vi",
    output_language: "vi",
    status: "ready",
    storage_status: "full",
    duration_sec: def.duration,
    size_bytes: def.duration * 16_000,
    created_at: def.created,
    audio_expires_at: null,
    consent: { confirmed: true, announced: false },
    participant_contact_ids: [],
    peaks_thumb: thumbFrom(peaks),
    speaker_colors_thumb: colorsThumb(spans, def.duration, speakers),
    open_task_count: openTasks,
    headline_tag: { tag: "pending", count: openTasks },
    executive_summary: def.summary,
    speakers,
    topics,
    action_items: def.tasks.map((t, i) => ({
      id: `a-${i}`,
      session_id: def.id,
      task: t.task,
      assignee_contact_id: t.assignee,
      due_date: t.due,
      priority: t.priority,
      done: false,
      done_at: null,
      source_quote: null,
      timestamp_sec: t.ts,
    })),
    notes: [],
    bookmarks: [
      { id: "m-0", timestamp_sec: def.topics[1].bullets[0][1], tag: "idea" },
      { id: "m-1", timestamp_sec: def.topics[Math.min(3, def.topics.length - 1)].bullets[0][1], tag: "figure" },
    ],
    photos: [],
    peaks,
    speaker_spans: spans,
    send_history: [],
    is_sample: true,
  };

  return { detail, transcript, chat: def.chat.map((c) => ({ question: c.q, answer: c.a, citations: c.c })) };
}

/* Hai nghề sao từ fixture có sẵn */
function copySample(srcFile, id) {
  const src = JSON.parse(readFileSync(join(ROOT, "fixtures", "sessions", srcFile), "utf8"));
  const out = { ...src, detail: { ...src.detail, id, is_sample: true } };
  return out;
}

const samples = {
  "realestate_sales.json": copySample("bds-gap-chi-lan.json", "s-sample-realestate_sales"),
  "business_owner.json": copySample("hop-dieu-hanh-t11.json", "s-sample-business_owner"),
  "doctor.json": buildFixture(DEFS.doctor),
  "lawyer.json": buildFixture(DEFS.lawyer),
  "architect.json": buildFixture(DEFS.architect),
  "notary.json": buildFixture(DEFS.notary),
};

for (const [name, fixture] of Object.entries(samples)) {
  const path = join(OUT, name);
  writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n");
  console.log(name, "transcript:", fixture.transcript.length, "topics:", fixture.detail.topics.length, "peaks:", fixture.detail.peaks.length);
}
console.log("Xong:", Object.keys(samples).length, "buổi ghi mẫu ở", OUT);
