import { addRecordingTranscript } from "@/lib/record/recording-store";

/*
 * Kịch bản transcript demo cho màn ghi âm B4 (GC-03, đặc tả v1.1 §3).
 * Mockup chưa có ASR sống (B0 đang đo, PR #74): khi đang ghi, kịch bản chèn
 * thầm các câu "nhận dạng được" theo đồng hồ ghi — KHÔNG hiện lên màn hình,
 * chỉ để nút "Kiểm tra thiếu" có dữ liệu thật để rà, mô phỏng đúng hành vi
 * sẽ có khi ASR sống nối vào (chỉ cần gọi addRecordingTranscript từ ASR).
 *
 * Nội dung là một buổi gặp khách bất động sản mô phỏng: nửa đầu chưa đủ thông
 * tin (rà sớm ra thiếu), nửa sau bổ sung dần các ô của mẫu Gặp khách
 * (real_estate_sales) nên rà muộn có thể đủ. Chỉ dùng cho mockup demo.
 */

export type DemoLine = { at_sec: number; text: string };

const SCRIPT: DemoLine[] = [
  { at_sec: 4, text: "Chào anh, hôm nay em dẫn anh đi xem căn A30 tầng 8 của dự án nhé." },
  { at_sec: 12, text: "Căn này 72 mét vuông, hai phòng ngủ, cửa hướng Nam, ngoài ra vẫn chưa chốt giá." },
  { at_sec: 20, text: "Anh xem thử vị trí ban công, tầm nhìn ra sông khá thoáng." },
  { at_sec: 28, text: "Anh nói xem gia đình mình thích sống ở khu này hay khu khác, để em chọn lại căn phù hợp." },
  { at_sec: 36, text: "Chung cư này gần trường tiểu học và chợ, đi làm về khu trung tâm khoảng 15 phút." },
  { at_sec: 44, text: "Tiện ích trong khu có phòng gym, hồ bơi và khu vui chơi trẻ em." },
  { at_sec: 52, text: "Phần mật độ xây dựng của dự án khoảng 38 phần trăm, còn lại là công viên nội khu." },
  { at_sec: 62, text: "Anh cho em biết mua căn này để gia đình ở thực hay để cho thuê tạo dòng tiền ạ." },
  { at_sec: 70, text: "Chị nhà em muốn ở gần trường học cho các cháu, còn em muốn thêm một căn cho thuê nữa." },
  { at_sec: 78, text: "Vậy ưu tiên ở thực trước, căn cho thuê tính sau, em ghi chú giúp anh nhé." },
  { at_sec: 88, text: "Về tài chính, em dùng khoảng 2 tỷ vốn tự có, phần còn lại xin gói vay ngân hàng 65 phần trăm giá trị căn hộ." },
  { at_sec: 96, text: "Tiến độ thanh toán em muốn chia 4 đợt theo tiến độ thi công, đợt đầu 20 phần trăm." },
  { at_sec: 104, text: "Gói vay em quan tâm lãi suất cố định 2 năm, trả gốc dần từ tháng thứ 25." },
  { at_sec: 114, text: "Tiêu chí vị trí: bán kính 2 km đến trường cấp một, hướng nhà Nam hoặc Đông Nam, tránh căn gần trạm biến áp." },
  { at_sec: 122, text: "Em cũng muốn tầng trung, từ tầng 5 đến tầng 12, không lấy tầng thấp sát mặt đường." },
  { at_sec: 132, text: "Vợ anh em có đi xem cùng, chốt cuối cùng là hai vợ chồng quyết, em cần bàn lại với chị vào cuối tuần." },
  { at_sec: 140, text: "Dự kiến chốt căn trong tháng này, trước ngày 28 để kịp đợt ưu đãi thanh toán sớm." },
  { at_sec: 150, text: "Còn phần nội thất giao thô hay hoàn thiện cơ bản, em cần anh tư vấn thêm lần nữa." },
  { at_sec: 158, text: "Chốt thế này: giữ chỗ căn A30 tầng 8, gửi đặt cọc 50 triệu, còn thiếu phần điều khoản hoàn trả cọc chờ sổ đỏ." },
  { at_sec: 168, text: "Cảm ơn anh, em hẹn anh xem lại căn vào sáng thứ bảy, em chuẩn bị sẵn giấy tờ vay ngân hàng." },
];

/** Mốc câu tiếp theo chưa chèn (trạng thái trong bộ nhớ module, ngoài React). */
let cursor = 0;

/** Chèn các câu demo đã đến mốc theo đồng hồ ghi hiện tại. Gọi định kỳ từ màn ghi. */
export function pushDemoTranscript(recordedSec: number) {
  if (cursor >= SCRIPT.length) return;
  const due: string[] = [];
  while (cursor < SCRIPT.length && SCRIPT[cursor].at_sec <= recordedSec) {
    due.push(SCRIPT[cursor].text);
    cursor += 1;
  }
  if (due.length) addRecordingTranscript(due);
}

/** Bắt đầu lại kịch bản cho buổi ghi mới (cursor về 0). */
export function resetDemoTranscript() {
  cursor = 0;
}
