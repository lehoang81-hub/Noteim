# Đặc tả chốt v1.1 — Gap Check "Rà soát điểm thiếu" + Slot-Filling thầm lặng (B4–B5)

Trạng thái: ĐÃ DUYỆT v1.1 (anh chốt toàn bộ 11 mục + 3 điểm mở ngày 19/11/2026).
Chờ kết nối GitHub (repo URL + token) để clone repo Noteim và mở PR 01 — không commit lên repo local trống của sandbox.
Ngày soạn: 19/11/2026 (Hà Nội).
Phạm vi: 11 mục đã chốt (mục 1–11), cập nhật theo 3 yêu cầu bổ sung của anh.

## 0. Truy vết 3 yêu cầu bổ sung

| Yêu cầu | Mục | Bắt đầu hoạt động ở PR |
|---|---|---|
| 1. `requires_consent: true` cho 3 mẫu nhạy cảm | §1 (JSON), §4.6 (luồng) | PR 01 + PR 05 |
| 2. Model tốc độ cao, output ngắn, phản hồi < 2 giây | §3 (API & hiệu năng) | PR 02 + PR 03 |
| 3. Gói "Lớp học tương tác 1–30" vào Backlog B5 | §6.2 | Backlog, kế hoạch riêng |

## 1. File cấu hình JSON 11 mẫu (`src/config/intake-templates.json`, version 1.1)

Quy tắc schema mới so với bản thảo luận gốc:
- `requires_consent: true` → buổi dùng mẫu này bắt buộc hoàn tất biên nhận đồng ý ghi âm (ai đồng ý, lúc nào, bằng cách nào — góp ý #4) trước khi bắt đầu ghi.
- `summary_structure` + `gap_slots` = cấu trúc 2 lớp: lớp trên cho AI tóm tắt cuối buổi, lớp dưới cho Gap Check rà thiếu trong buổi. Mỗi nghề 1 template duy nhất.
- `sensitive: true` (cấp slot): chỉ `filled: true` khi evidence rõ ràng; không tự đổi xanh khi confidence < high.
- `question_mode`: `refocus` (mặc định — câu lái hội thoại cho chuyên gia) hoặc `takeaway` (câu hỏi mang về cho người nghe — dùng cho mẫu học sinh).
- Placeholder `[...]` trong fallback_question được AI thay bằng nội dung thật từ transcript.

```json
{
  "version": "1.1",
  "templates": [
    {
      "id": "doctor_clinical",
      "role_name": "Bác sĩ khám lâm sàng",
      "requires_consent": true,
      "tone_guideline": "Điềm tĩnh, ân cần, chuyên môn y khoa rõ ràng, tránh gây hoang mang. Xưng hô 'anh/chị' với bệnh nhân.",
      "summary_structure": ["Subjective — triệu chứng", "Objective — thăm khám", "Assessment — đánh giá", "Plan — hướng xử lý"],
      "gap_slots": [
        { "key": "chief_complaint", "label": "Triệu chứng chính", "extraction_hint": "Lý do khám, vị trí khó chịu, mức độ ảnh hưởng.", "fallback_question": "Hiện tại triệu chứng nào làm anh/chị khó chịu nhất và mức độ ảnh hưởng ra sao ạ?" },
        { "key": "onset_duration", "label": "Thời gian & diễn tiến", "extraction_hint": "Bắt đầu từ bao giờ, đột ngột hay từ từ, tăng hay giảm.", "fallback_question": "Tình trạng này bắt đầu từ khi nào và có nặng lên theo thời gian không ạ?" },
        { "key": "allergies_history", "label": "Tiền sử & Dị ứng", "sensitive": true, "extraction_hint": "Dị ứng thuốc/thức ăn, bệnh nền mãn tính (tim mạch, tiểu đường, huyết áp).", "fallback_question": "Trước giờ anh/chị có dị ứng với thuốc nào hay đang điều trị bệnh nền gì không ạ?" },
        { "key": "current_medications", "label": "Thuốc đang dùng", "extraction_hint": "Thuốc tây, thực phẩm chức năng, thuốc nam đã tự dùng trước khi tới khám.", "fallback_question": "Từ lúc có triệu chứng, anh/chị đã tự mua thuốc hay dùng thực phẩm hỗ trợ nào chưa ạ?" }
      ]
    },
    {
      "id": "lawyer_consultation",
      "role_name": "Luật sư tư vấn pháp lý",
      "requires_consent": true,
      "tone_guideline": "Chặt chẽ, khách quan, trung lập, tập trung sự kiện pháp lý và chứng cứ. Xưng hô 'anh/chị'.",
      "summary_structure": ["Tóm tắt vụ việc", "Cơ sở pháp lý", "Đánh giá quyền lợi & rủi ro", "Các bước tiếp theo"],
      "gap_slots": [
        { "key": "dispute_parties", "label": "Chủ thể liên quan", "extraction_hint": "Danh tính, tư cách pháp lý các bên (cá nhân, doanh nghiệp, người đại diện).", "fallback_question": "Cho tôi xác nhận lại tư cách ký kết hoặc tham gia của các bên liên quan trực tiếp trong vụ việc này?" },
        { "key": "timeline_statute", "label": "Mốc thời gian & Thời hiệu", "extraction_hint": "Ngày ký hợp đồng, ngày phát sinh vi phạm, ngày nhận thông báo (tính thời hiệu khởi kiện).", "fallback_question": "Sự việc phát sinh chính xác vào ngày tháng năm nào để tôi kiểm tra thời hiệu?" },
        { "key": "existing_evidence", "label": "Chứng cứ hiện có", "extraction_hint": "Hợp đồng bản gốc, vi bằng, tin nhắn, email, sao kê chuyển khoản, nhân chứng.", "fallback_question": "Hiện anh/chị đang giữ những tài liệu gốc, tin nhắn hay chứng từ chuyển khoản nào chứng minh việc này?" },
        { "key": "desired_outcome", "label": "Mục tiêu giải quyết", "extraction_hint": "Đòi bồi thường, hủy hợp đồng, hòa giải hay khởi kiện.", "fallback_question": "Mục tiêu anh/chị kỳ vọng nhất là thu hồi tiền, chấm dứt hợp đồng hay phương án nào khác?" }
      ]
    },
    {
      "id": "architect_survey",
      "role_name": "Kiến trúc sư khảo sát thiết kế",
      "requires_consent": false,
      "tone_guideline": "Cởi mở, tinh tế, định hướng không gian và ngân sách thực tế, khéo kéo khách khỏi lan man. Xưng hô 'anh/chị' hoặc 'gia đình mình'.",
      "summary_structure": ["Hiện trạng công trình", "Nhu cầu công năng", "Ngân sách & tiến độ", "Phương án đề xuất"],
      "gap_slots": [
        { "key": "site_specs", "label": "Diện tích & Hiện trạng", "extraction_hint": "Kích thước đất/căn hộ, số tầng, hướng nắng gió, xây mới hay cải tạo.", "fallback_question": "Diện tích khu đất/căn hộ chính xác bao nhiêu mét vuông và hiện trạng là đất trống hay nhà cải tạo ạ?" },
        { "key": "budget_cap", "label": "Ngân sách dự trù", "extraction_hint": "Tổng mức đầu tư phần thô, hoàn thiện, nội thất.", "fallback_question": "Để em cân đối phương án vật liệu sát nhất, gia đình mình dự trù tổng ngân sách khoảng bao nhiêu ạ?" },
        { "key": "functional_needs", "label": "Công năng & Thành viên", "extraction_hint": "Số phòng ngủ, không gian sinh hoạt chung, người già/trẻ nhỏ, nhu cầu đặc thù.", "fallback_question": "Nhà mình có bao nhiêu thành viên sinh sống thường xuyên và cần không gian đặc biệt nào không ạ?" },
        { "key": "project_timeline", "label": "Tiến độ mong muốn", "extraction_hint": "Thời điểm dự kiến khởi công, hạn cần ở/khai thác.", "fallback_question": "Anh/chị dự kiến tháng mấy bắt đầu khởi công và cần hoàn thiện xong trước mốc nào ạ?" }
      ]
    },
    {
      "id": "real_estate_sales",
      "role_name": "Chuyên viên tư vấn Bất động sản",
      "requires_consent": false,
      "tone_guideline": "Nhạy bén, lịch sự, tạo niềm tin, tập trung dòng tiền, pháp lý và khả năng ra quyết định. Xưng hô 'anh/chị'.",
      "summary_structure": ["Nhu cầu & mục đích", "Tài chính", "Sản phẩm phù hợp", "Bước tiếp theo"],
      "gap_slots": [
        { "key": "buying_purpose", "label": "Mục đích mua", "extraction_hint": "Ở thực, cho thuê tạo dòng tiền, đầu tư lãi vốn, tích sản.", "fallback_question": "Căn này anh/chị ưu tiên để gia đình ở thực hay hướng tới cho thuê và đầu tư giữ tiền ạ?" },
        { "key": "financial_capacity", "label": "Tài chính & Đòn bẩy", "extraction_hint": "Vốn tự có, nhu cầu vay ngân hàng, tiến độ thanh toán mong muốn.", "fallback_question": "Với tầm tài chính dự kiến, anh/chị dùng vốn tự có toàn bộ hay muốn tận dụng gói vay ngân hàng ạ?" },
        { "key": "location_criteria", "label": "Tiêu chí vị trí & Tiện ích", "extraction_hint": "Khu vực ưu tiên, bán kính đi làm/trường học, hướng nhà, loại hình sản phẩm.", "fallback_question": "Ngoài yếu tố giá, đâu là 2 tiêu chí bắt buộc về vị trí hoặc tiện ích đối với anh/chị?" },
        { "key": "decision_maker_timeline", "label": "Người chốt & Thời điểm", "extraction_hint": "Ai cùng đi xem và quyết định cuối cùng, dự định chốt khi nào.", "fallback_question": "Khi đi xem thực tế, anh/chị có cần sắp xếp để vợ/chồng hoặc người thân cùng đi quyết định luôn không ạ?" }
      ]
    },
    {
      "id": "insurance_advisor",
      "role_name": "Tư vấn viên Bảo hiểm",
      "requires_consent": false,
      "tone_guideline": "Chân thành, thấu cảm, minh bạch quyền lợi và điều khoản loại trừ, không ép buộc. Xưng hô 'anh/chị'.",
      "summary_structure": ["Tình hình gia đình", "Nhu cầu bảo vệ", "Phương án đề xuất", "Bước tiếp theo"],
      "gap_slots": [
        { "key": "dependents_breadwinner", "label": "Người phụ thuộc & Trụ cột", "extraction_hint": "Người tạo thu nhập chính, số con nhỏ, cha mẹ đang phụ thuộc tài chính.", "fallback_question": "Trong gia đình mình, ai đang là người tạo thu nhập chính và có bao nhiêu người phụ thuộc ạ?" },
        { "key": "protection_priority", "label": "Ưu tiên bảo vệ", "extraction_hint": "Thẻ y tế/nằm viện, quỹ bệnh hiểm nghèo, quỹ học vấn/hưu trí.", "fallback_question": "Giữa quỹ dự phòng y tế nằm viện và quỹ bảo vệ thu nhập trước rủi ro lớn, anh/chị quan tâm mảng nào hơn?" },
        { "key": "health_disclosure", "label": "Tình trạng sức khỏe", "sensitive": true, "extraction_hint": "Tiền sử nằm viện, phẫu thuật, bệnh có sẵn, thói quen hút thuốc/rượu bia (thẩm định).", "fallback_question": "Trong 5 năm gần đây, anh/chị có từng nằm viện hay chỉ số sức khỏe nào cần lưu ý khi kê khai không ạ?" },
        { "key": "comfortable_premium", "label": "Ngân sách phí đóng", "extraction_hint": "Phí đóng hàng năm (10–15% thu nhập), duy trì đều đặn không áp lực.", "fallback_question": "Để hợp đồng bền vững 10–15 năm, mức trích lập mỗi năm khoảng bao nhiêu là thoải mái với anh/chị?" }
      ]
    },
    {
      "id": "psychologist_counselor",
      "role_name": "Chuyên gia Tham vấn Tâm lý",
      "requires_consent": true,
      "tone_guideline": "Ấm áp, không phán xét, tôn trọng nhịp độ thân chủ, ngôn từ nhẹ nhàng nâng đỡ. Xưng hô theo cách thân chủ dùng ('anh/chị' hoặc 'mình-bạn').",
      "summary_structure": ["Diễn biến chính của buổi", "Đánh giá", "Hướng can thiệp", "Hẹn lần sau"],
      "gap_slots": [
        { "key": "presenting_issue", "label": "Vấn đề cốt lõi", "extraction_hint": "Nỗi niềm/khó khăn tâm lý chính khiến thân chủ tìm đến buổi tham vấn.", "fallback_question": "Nếu chọn một điều đang đè nặng lên tâm trí anh/chị nhất lúc này để cùng gỡ trước, đó sẽ là điều gì?" },
        { "key": "triggers_context", "label": "Tác nhân kích hoạt", "extraction_hint": "Tình huống, con người hoặc thời điểm cụ thể khiến cảm xúc tiêu cực bùng phát.", "fallback_question": "Anh/chị có nhận thấy cảm giác này thường trỗi dậy mạnh nhất vào những tình huống hay thời điểm nào không?" },
        { "key": "daily_impact", "label": "Ảnh hưởng sinh hoạt", "extraction_hint": "Tác động đến giấc ngủ, ăn uống, hiệu suất công việc, các mối quan hệ.", "fallback_question": "Những cảm xúc này gần đây có làm xáo trộn giấc ngủ, bữa ăn hay công việc hàng ngày nhiều không?" },
        { "key": "support_safety", "label": "Điểm tựa & An toàn", "sensitive": true, "extraction_hint": "Người thân/bạn bè để chia sẻ, cách tự xoa dịu, sàng lọc nguy cơ tự hại.", "fallback_question": "Những lúc căng thẳng lên cao điểm, xung quanh có ai để chia sẻ hoặc anh/chị thường làm gì để giữ an toàn cho bản thân?" }
      ]
    },
    {
      "id": "student_lecture",
      "role_name": "Học sinh / Sinh viên nghe giảng",
      "requires_consent": false,
      "question_mode": "takeaway",
      "tone_guideline": "Ngắn gọn, dễ hiểu, đúng lứa tuổi. Gọi người dùng là 'bạn'. Ô còn thiếu xuất 'câu hỏi mang về' viết theo ngôi 'em' hỏi 'thầy/cô' để cuối giờ hỏi lại thầy/cô hoặc mang về hỏi AI; không dùng để ngắt lời thầy.",
      "summary_structure": ["Khái niệm chính", "Ví dụ minh họa", "Trọng tâm thi", "Bài tập & hạn nộp"],
      "gap_slots": [
        { "key": "core_concepts", "label": "Khái niệm/từ khóa mới", "extraction_hint": "Định nghĩa, công thức, thuật ngữ mới (kể cả tiếng Anh) giảng viên phân tích nhiều.", "fallback_question": "Hỏi thầy/cô: 'Thưa thầy/cô, phần khái niệm cốt lõi vừa rồi có thể tóm gọn trong 1 nguyên tắc chính nào ạ?'" },
        { "key": "worked_examples", "label": "Ví dụ thực tế đã nêu", "extraction_hint": "Ví dụ, bài mẫu, tình huống giảng viên dùng minh họa.", "fallback_question": "Ghi thêm ví dụ: 'Thầy/cô cho em xin thêm 1 ví dụ khác về phần [chủ đề] để em tự luyện được không ạ?'" },
        { "key": "exam_signals", "label": "Trọng tâm thi được nhắc", "extraction_hint": "Chỗ giảng viên nhắc 'cần lưu ý', 'hay ra thi', 'dễ nhầm lẫn'.", "fallback_question": "Hỏi thầy/cô: 'Phần này khi vào bài thi thường hỏi dạng nhận biết hay vận dụng ạ?'" },
        { "key": "assignments_deadlines", "label": "Bài tập & hạn nộp", "extraction_hint": "Bài về nhà, tài liệu cần đọc trước buổi sau, hạn nộp chính xác.", "fallback_question": "Xác nhận cuối giờ: 'Bài tập và tài liệu chuẩn bị có hạn nộp chính xác vào ngày nào ạ?'" }
      ]
    },
    {
      "id": "teacher_educator",
      "role_name": "Giáo viên / Giảng viên",
      "requires_consent": false,
      "tone_guideline": "Sư phạm, khích lệ, định hướng mục tiêu học tập, phối hợp hiệu quả với học sinh/phụ huynh. Xưng hô 'các em' với học sinh, 'anh/chị' với phụ huynh.",
      "summary_structure": ["Mục tiêu đã chốt", "Lỗ hổng & lỗi ghi nhận", "Đánh giá tiếp thu", "Bài tập & phối hợp"],
      "gap_slots": [
        { "key": "learning_objectives", "label": "Mục tiêu bài học", "extraction_hint": "Kiến thức, kỹ năng cốt lõi học sinh cần nắm sau buổi học.", "fallback_question": "Chốt với lớp: 'Sau buổi hôm nay, các em nhắc lại 2 mục tiêu quan trọng nhất vừa giải quyết?'" },
        { "key": "student_bottlenecks", "label": "Lỗ hổng / Lỗi hay gặp", "extraction_hint": "Điểm hổng kiến thức, hiểu sai bản chất, lỗi lặp lại nhiều lần.", "fallback_question": "Hỏi học sinh: 'Ở phần này, đoạn nào đang làm các em thấy vướng hoặc dễ nhầm nhất?'" },
        { "key": "comprehension_check", "label": "Mức độ tiếp thu", "extraction_hint": "Phản hồi qua câu hỏi kiểm tra nhanh, bài thực hành tại lớp.", "fallback_question": "Kiểm tra nhanh: 'Bạn nào diễn đạt lại ý vừa rồi bằng cách hiểu của riêng mình cho cả lớp nghe?'" },
        { "key": "next_action_homework", "label": "Bài tập & Phối hợp", "extraction_hint": "Nhiệm vụ luyện tập về nhà, cam kết phối hợp của phụ huynh/học viên.", "fallback_question": "Dặn dò cuối buổi: 'Về nhà hoàn thành bài tập trọng tâm nào và cần gia đình hỗ trợ thêm điều gì?'" }
      ]
    },
    {
      "id": "general_meeting",
      "role_name": "Cuộc họp / Trao đổi tổng quát (mẫu mặc định)",
      "requires_consent": false,
      "tone_guideline": "Trung tính, lịch sự, đúng trọng tâm. Xưng hô 'anh/chị' mặc định.",
      "summary_structure": ["Nội dung chính", "Quyết định", "Hẹn & mốc thời gian", "Việc còn treo"],
      "gap_slots": [
        { "key": "main_purpose", "label": "Mục đích chính của buổi", "extraction_hint": "Lý do cuộc gặp diễn ra, kết quả mong muốn cuối buổi.", "fallback_question": "Chốt lại với anh/chị: mục đích chính của buổi hôm nay là [nội dung], đúng không ạ?" },
        { "key": "next_action", "label": "Quyết định / việc cần làm tiếp", "extraction_hint": "Ai làm gì, bắt đầu khi nào sau buổi.", "fallback_question": "Vậy phần việc tiếp theo do bên nào phụ trách và bắt đầu từ khi nào ạ?" },
        { "key": "agreed_timeline", "label": "Hẹn & mốc thời gian", "extraction_hint": "Ngày giờ hẹn tiếp, deadline đã đề cập.", "fallback_question": "Mình chốt lại mốc thời gian đã hẹn chính xác là ngày nào ạ?" },
        { "key": "open_items", "label": "Việc còn treo chưa xong", "extraction_hint": "Chủ đề nhắc tới nhưng chưa có kết luận, cần quay lại.", "fallback_question": "Còn phần [chủ đề] vừa nhắc nhưng chưa có kết luận, mình hẹn quay lại lúc nào ạ?" }
      ]
    },
    {
      "id": "center_advisor",
      "role_name": "Tư vấn tuyển sinh trung tâm (ngoại ngữ / luyện thi / kỹ năng)",
      "requires_consent": false,
      "tone_guideline": "Thuyết phục có căn cứ, không hứa suông, tập trung lộ trình và kết quả học tập. Xưng hô 'anh/chị' với phụ huynh, gọi học viên là 'bé' hoặc nêu tên.",
      "summary_structure": ["Trình độ hiện tại", "Mục tiêu khóa học", "Lịch học & học phí", "Cam kết hai bên"],
      "gap_slots": [
        { "key": "current_level", "label": "Trình độ hiện tại", "extraction_hint": "Điểm test xếp lớp, band điểm hiện tại, môn mạnh/yếu.", "fallback_question": "Bên mình đã làm bài test xếp lớp chưa, kết quả ra sao để em xếp lớp phù hợp ạ?" },
        { "key": "target_deadline", "label": "Mục tiêu & thời hạn", "extraction_hint": "Điểm/chứng chỉ cần đạt (TOEIC/IELTS/điểm học kỳ) và mốc thời gian cần đạt.", "fallback_question": "Gia đình mình cần đạt mốc bao nhiêu và trước tháng nào để em lên lộ trình sát nhất ạ?" },
        { "key": "schedule_budget", "label": "Lịch học & ngân sách", "extraction_hint": "Số buổi/tuần, khung giờ cố định, mức học phí gia đình thoải mái.", "fallback_question": "Trong tuần mấy buổi nào là lịch cố định của bé, và mức học phí thoải mái cho gia đình là khoảng bao nhiêu ạ?" },
        { "key": "parent_commitment", "label": "Cam kết đồng hành", "extraction_hint": "Ai ở nhà kèm bé làm bài về nhà, kênh nhận báo cáo tiến độ.", "fallback_question": "Ở nhà ai sẽ kiểm tra việc về nhà của bé để bên em gửi báo cáo đúng người ạ?" }
      ]
    },
    {
      "id": "parent_meeting",
      "role_name": "Trao đổi phụ huynh / Họp lớp (GV chủ nhiệm, gia sư)",
      "requires_consent": false,
      "tone_guideline": "Sư phạm, tôn trọng, nhấn mạnh điểm tiến bộ trước khi nói lỗ hổng. Xưng hô 'anh/chị' với phụ huynh, nhắc học sinh là 'con'.",
      "summary_structure": ["Tình hình học tập", "Thói quen học ở nhà", "Điểm mạnh & lỗ hổng", "Kế hoạch hỗ trợ & hẹn lại"],
      "gap_slots": [
        { "key": "subject_progress", "label": "Tình hình các môn", "extraction_hint": "Tiến bộ/lùi bước từng môn, điểm kiểm tra gần nhất.", "fallback_question": "Qua thời gian vừa rồi, anh/chị thấy con tiến bộ rõ nhất ở môn nào so với đầu kỳ ạ?" },
        { "key": "home_study_habits", "label": "Thói quen học ở nhà", "extraction_hint": "Tự học hay cần nhắc, thời gian tự học mỗi ngày, môi trường học.", "fallback_question": "Ở nhà con tự học được không hay cần người lớn ngồi cạnh nhắc ạ?" },
        { "key": "strengths_gaps", "label": "Điểm mạnh & lỗ hổng", "extraction_hint": "Điểm mạnh cần giữ, phần kiến thức đang hổng, lỗi hay mắc.", "fallback_question": "Phần [chủ đề] các em đang hổng; bên nhà mình có nhận thấy con vướng chỗ này khi làm bài ở nhà không ạ?" },
        { "key": "support_plan_followup", "label": "Kế hoạch hỗ trợ & hẹn lại", "extraction_hint": "Cam kết hỗ trợ ở nhà, mục tiêu ngắn hạn, hẹn trao đổi lần sau.", "fallback_question": "Hai bên mình thống nhất phần hỗ trợ ở nhà là gì, và hẹn trao đổi lại vào thời điểm nào ạ?" }
      ]
    }
  ]
}
```

## 2. System Prompt cuối cùng cho Gap Check

```
Bạn là trợ lý nghiệp vụ thầm lặng của ứng dụng Noteim, hỗ trợ chuyên gia ({{role_name}})
kiểm soát chất lượng thông tin thu thập trong cuộc trao đổi trực tiếp.

NHIỆM VỤ
Đối chiếu bản ghi hội thoại hiện tại với danh sách trường thông tin bắt buộc (Required Slots)
bên dưới, phát hiện thông tin cốt lõi còn thiếu trước khi buổi trao đổi kết thúc.

DỮ LIỆU
- Mẫu nghiệp vụ: {{role_name}} — giọng điệu: {{tone_guideline}} (đúng cách xưng hô quy định).
- Danh sách trường bắt buộc (JSON): {{slots_json}}
- Bản ghi hội thoại hiện tại: {{transcript}}
- Kết quả rà trước đó (nếu có): {{previous_slots_status}}

QUY TẮC XỬ LÝ NGHIÊM NGẶT
1. Chỉ đánh dấu filled: true khi hội thoại có thông tin cụ thể, rõ ràng tương ứng
   extraction_hint; thông tin mơ hồ, qua loa, thiếu số liệu/mốc cụ thể phải là filled: false.
2. Mỗi ô filled: true bắt buộc kèm evidence — trích nguyên văn tối đa 1 dòng từ transcript;
   không trích được thì hạ thành filled: false.
3. Không suy diễn, không bịa đặt thông tin không có trong transcript.
4. Nếu transcript quá ngắn (dưới khoảng 1 phút nói) hoặc rỗng: toàn bộ ô là filled: false,
   missing_priorities tối đa 3 ô quan trọng nhất, không suy diễn.
5. Ô có "sensitive": true (dị ứng thuốc, tình trạng sức khỏe, nguy cơ tự hại...) chỉ được
   filled: true khi evidence rõ ràng, không mơ hồ; trường hợp nghi ngờ → filled: false.
6. Chấp nhận tiếng Việt tự nhiên, phương ngữ, thuật ngữ chuyên ngành tiếng Anh xen kẽ
   (code-switching).
7. Chọn tối đa 3 trường filled: false quan trọng nhất vào missing_priorities, ưu tiên trường
   quyết định quy trình phía sau (dị ứng/thuốc với bác sĩ, thời hiệu với luật sư, ngân sách
   với kiến trúc sư, hạn nộp với học sinh...).
8. Câu hỏi trong missing_priorities điều chỉnh từ fallback_question để nối tiếp mạch chuyện
   vừa diễn ra, đúng giọng điệu và cách xưng hô của mẫu; tối đa 2 câu; không hỏi lại thông
   tin đã filled: true. Thay placeholder [...] bằng nội dung thật từ transcript.
9. one_line_bridge: 1 câu tóm tắt mạch khách đang nói để chuyên gia ngắt lời khéo; rỗng nếu
   không cần. Không áp dụng khi question_mode là "takeaway" (thay bằng câu hỏi mang về).
10. Nếu mọi ô đều filled: true → ready_to_close: true, missing_priorities là mảng rỗng.
11. Trả lời đúng ngôn ngữ của buổi ghi (tiếng Việt thuần hoặc tiếng Việt pha tiếng Anh
    theo đúng kiểu người dùng vừa nói).

ĐỊNH DẠNG ĐẦU RA — CHỈ TRẢ VỀ JSON HỢP LỆ, KHÔNG GIẢI THÍCH, KHÔNG MARKDOWN:
{
  "ready_to_close": false,
  "slots_status": [
    { "key": "<slot_key>", "filled": true, "confidence": "high", "evidence": "trích nguyên văn ngắn" }
  ],
  "missing_priorities": [
    { "key": "<slot_key>", "why_missing": "tối đa 1 dòng", "question": "tối đa 2 câu, đúng tone" }
  ],
  "one_line_bridge": "1 câu hoặc chuỗi rỗng"
}
Lưu ý: slots_status phải đủ mọi ô trong slots_json; confidence là high/medium/low;
evidence là chuỗi rỗng khi filled: false.
```

## 3. API và hiệu năng (yêu cầu bổ sung #2 — phản hồi < 2 giây)

**Endpoint:** `POST /api/sessions/[id]/gap-check`
Request: `{ templateId, transcript, previous? }`
Response: JSON đầu ra theo §2 (đã parse + validate).

Cấu hình chạy nhanh:
- Model: model tốc độ cao trong SDK (ưu tiên nhanh, không dùng model suy luận nặng); `temperature: 0.1`; `max_tokens: 600`; bắt buộc trả JSON thuần.
- Input gọn: B4 gửi transcript cắt tối đa ~8.000 ký tự gần nhất; B5 (chạy nền) chỉ gửi đoạn mới từ mốc rà trước + trạng thái ô cũ.
- KPI: p95 ≤ 2 giây trên mạng VN 4G, đo và ghi log từ PR 02 (đưa vào ô tích PR).
- UI: skeleton chờ ≤ 2 giây; quá 3 giây cho phép bỏ qua; lỗi/timeout → "Chưa rà được, thử lại", tuyệt đối không hiện dữ liệu bịa.
- Rate limit: gói Free tối đa 10 lượt rà/ngày (`GAP_CHECK_FREE_DAILY=10`, cấu hình được), Pro không giới hạn — khớp định hướng tính năng Pro. Đã chốt duyệt: giữ mức 10.
- Lưu trữ: bảng `SessionGapCheck` (id, sessionId, templateId, checkedAt, transcriptUntilMs, resultJson — kiểu String chứa JSON, history giữ tối đa 10 lần/buổi). Kết quả gần nhất là nguồn cho checklist "Cần bổ sung sau buổi".

## 4. UI/UX chốt

1. **Nút "Kiểm tra thiếu"** (tên đầy đủ "Rà soát điểm thiếu" — đã chốt dùng tên ngắn cho mobile; icon clipboard-check) đặt cạnh nút Dừng trong màn ghi âm; màn hình vẫn yên tĩnh suốt 80% thời gian buổi.
2. **Cổng chốt buổi:** bấm Dừng → hiện 1 thanh duy nhất "Kiểm tra thiếu thông tin trước khi lưu?" với 2 nút [Kiểm tra thiếu] / [Lưu luôn].
3. **Bottom sheet kết quả:** `ready_to_close` → băng xanh "Đủ dữ liệu, có thể chốt buổi"; ngược lại tối đa 3 mục, mỗi mục gồm: vì sao thiếu (1 dòng) + câu hỏi lái (in đậm) + 2 nút hành động: [Chép vào ghi chú nhanh] (góp ý #2) và [Hỏi AI trên thư mục] (góp ý #3). Nút "Rà lại sau khi nói tiếp".
4. **Thẻ trạng thái 0.5 giây (B5):** dải thẻ nhỏ ở mép màn hình; xanh + icon tick = đủ (confidence high); cam + icon chấm than = thiếu hoặc confidence medium/low. Luôn kèm icon, không dùng màu đơn thuần (người mù màu vẫn đọc được). Chạm ô cam → câu hỏi + bridge; chạm ô medium/low → evidence để chuyên gia xác nhận hoặc gạt bỏ (revert về cam). Slot `sensitive` không tự xanh nếu confidence < high.
5. **Checklist "Cần bổ sung sau buổi"** ở màn chi tiết buổi, sinh từ lần rà gần nhất; từng mục chép được vào ghi chú nhanh một dòng hoặc gửi thành câu hỏi cho Hỏi AI trên thư mục; tick hoàn thành thì mờ dần và tự ẩn.
6. **Luồng requires_consent:** mẫu có `requires_consent: true` → màn ghi âm chặn ghi đến khi hoàn tất biên nhận đồng ý (ai đồng ý, lúc nào, bằng cách nào — lưu kèm buổi theo góp ý #4). Buổi chọn mẫu nhạy cảm thủ công cũng kích hoạt luồng này.
7. **Gắn mẫu theo thư mục (góp ý #3):** khi tạo/sửa thư mục chọn nghề 1 lần → mọi buổi mới kế thừa; override được từng buổi; mẫu "Tổng quát" là mặc định khi không chọn.
8. **Truy cập:** nút ≥ 44px, kết quả chữ to rõ cho phụ huynh lớn tuổi, không popup nhiều lớp.

## 5. Slot-Filling nền thầm lặng (B5 — sau khi B4 ổn định)

- Kích hoạt khi im lặng ≥ 3 giây hoặc kết thúc một lượt nói; tối đa 1 lần gọi mỗi 45 giây.
- Chỉ phân tích đoạn mới từ mốc rà trước + trạng thái ô cũ (chi phí tuyến tính, không O(n²)).
- Không popup, không hiện chữ giữa buổi — chỉ đổi màu thẻ theo §4.4.
- Ô medium/low luôn cần chuyên gia xác nhận bằng evidence; không bao giờ tự xanh khi nghi ngờ.

## 6. Backlog B5

### 6.1 Nút "Tạo quiz 5 câu từ buổi học" (mục 10)
AI đọc transcript sinh 5 câu trắc nghiệm (đáp án + giải thích ngắn), lưu vào buổi, làm thử trên web. Nền móng cho gói §6.2.

### 6.2 Gói "Lớp học tương tác 1–30" (yêu cầu bổ sung #3)
- Mô hình: 1 giáo viên thu âm cho cả lớp (không cần thiết bị cho từng học sinh).
- Cuối giờ: xuất 1 mã QR (link có token, hết hạn 48 giờ).
- Học sinh quét → trang web → làm bài trắc nghiệm ~3 phút (5–10 câu tự sinh từ transcript), không cần tài khoản, chỉ nhập tên gọi.
- Hệ thống tổng kết: tỉ lệ học sinh làm bài, điểm trung bình, phần hổng theo từng câu.
- Tự soạn sẵn **bản tin tổng kết** gửi nhóm Zalo phụ huynh: giai đoạn đầu là văn bản soạn sẵn để GV copy/dán vào nhóm (không phụ thuộc duyệt Zalo API); gửi tự động qua Zalo API để backlog khi có ZOA duyệt.
- Ràng buộc: tối đa 30 lượt làm bài/quiz; kết quả dùng đo tiếp thu, không dùng chấm điểm chính thức; không lộ transcript cho học sinh (chỉ quiz + kết quả).
- Dữ liệu: bảng `quiz_attempts` (quizId, studentLabel, answersJson, score, submittedAt).

### 6.3 Khác
- Mẫu `coach_center` (HLV trung tâm năng khiếu) khi có nhu cầu.
- Chuyển 11 mẫu từ file tĩnh vào bảng `templates` trong DB + màn quản trị khi số mẫu tăng.

## 7. Kế hoạch nhánh/PR (quy trình cũ: nhánh riêng, bước nhỏ ~45 phút, lint/typecheck + commit + push từng bước, PR nháp thân là ô tích → tick ô bằng Python urllib PATCH `/pulls/{N}` → chuyển ready bằng GraphQL `markPullRequestReadyForReview`)

| # | Nhánh | Nội dung | Chặng |
|---|---|---|---|
| 1 | `b4/gc-01-templates` | File JSON 11 mẫu + loader + kiểu TS (Template, GapSlot) + validate id unique + commit file đặc tả này | B4 |
| 2 | `b4/gc-02-api` | Endpoint gap-check + prompt builder + parse JSON chặt + bảng SessionGapCheck + rate limit + đo p95 | B4 |
| 3 | `b4/gc-03-ui-recording` | Nút Kiểm tra thiếu + Cổng chốt buổi + bottom sheet kết quả + action chép vào ghi chú nhanh | B4 |
| 4 | `b4/gc-04-session-detail` | Checklist "Cần bổ sung sau buổi" + tích hợp Hỏi AI trên thư mục | B4 |
| 5 | `b4/gc-05-folder-template` | Gắn mẫu theo thư mục + luồng requires_consent bắt biên nhận trước khi ghi | B4 |
| 6 | `b5/gc-06-silent-filling` | Slot-Filling nền (delta, im lặng, confidence, sensitive rule) + thẻ 0.5 giây | B5 |
| 7 | `b5/gc-07-student-quiz` | Nút "Tạo quiz 5 câu từ buổi học" | B5 |
| 8 | `b5/gc-08-class-interact` | Gói Lớp học tương tác 1–30 (lên kế hoạch chi tiết riêng khi anh duyệt) | Backlog |

Thứ tự bắt đầu: chờ các PR của 6 góp ý (đang chờ kiểm thử) ổn định để không đụng nhánh; PR 01 mở đầu ngay khi sandbox kết nối được repo GitHub (đang chờ repo URL + token từ anh).

## 8. Tiêu chí nghiệm thu chung

- `bun run lint` và typecheck sạch ở mỗi bước; commit + push từng bước nhỏ.
- PR nháp thân là ô tích, tick từng ô qua API như quy trình cũ, chuyển ready khi xong.
- Không đụng nhánh đang chờ merge (b0/01b-do-asr — PR #74).
- Gap Check không bao giờ hiện dữ liệu không có trong transcript (kiểm thử với transcript rỗng, transcript rác từ ghi xa micro).
- KPI p95 ≤ 2 giây được đo và ghi trong mô tả PR 02.
- Không ghi khóa API vào code/commit/PR.

## 9. Điểm mở — ĐÃ CHỐT khi duyệt v1.1 (19/11/2026)

1. Lượt rà Free/ngày: giữ `GAP_CHECK_FREE_DAILY=10`.
2. Tên nút UI: dùng "Kiểm tra thiếu" (gọn cho màn hình mobile).
3. PR 08 (Lớp học tương tác 1–30): ở Backlog, chờ số liệu dùng thử thực tế từ giáo viên/trung tâm sau chặng B5.
