#!/usr/bin/env python3
"""Sinh 6 fixture buổi ghi của không gian Nhóm "Sàn BĐS Hải Phòng Land" (M7-01).

Chạy từ gốc repo: python3 scripts/gen-team-sessions.py
Sau đó chạy `node scripts/gen-peaks.mjs` để sinh peaks/peaks_thumb/headline_tag.
Buổi riêng tư của người khác vẫn có nội dung hợp lệ (mockup), nhưng repository
chặn đọc bằng DataError("forbidden") nên giao diện không bao giờ thấy.
"""
import json
import os

OUT = "fixtures/sessions"

WS = "w-hp-land"


def speaker(sid, contact_id, display_name, is_me, color, ratio, sample):
    return {
        "id": sid,
        "contact_id": contact_id,
        "display_name": display_name,
        "is_me": is_me,
        "color_index": color,
        "talk_ratio_percent": ratio,
        "sample_start_sec": sample,
    }


def bullet(bid, text, ts, spk, quote=False):
    return {
        "id": bid,
        "text": text,
        "timestamp_sec": ts,
        "speaker_id": spk,
        "is_quote": quote,
        "edited": False,
        "note_ids": [],
    }


def topic(tid, sec, title, start, end, tag, bullets, figure=None):
    d = {
        "id": tid,
        "section_id": sec,
        "title": title,
        "start_sec": start,
        "end_sec": end,
        "tag": tag,
        "bullets": bullets,
    }
    if figure:
        d["figure"] = figure
    return d


def action(aid, sid, task, contact, user, due, priority, done, done_at, ts):
    return {
        "id": aid,
        "session_id": sid,
        "task": task,
        "assignee_contact_id": contact,
        "assignee_user_id": user,
        "due_date": due,
        "priority": priority,
        "done": done,
        "done_at": done_at,
        "source_quote": None,
        "timestamp_sec": ts,
    }


def note(nid, ts, text):
    return {"id": nid, "timestamp_sec": ts, "text": text}


def bookmark(bid, ts, tag):
    return {"id": bid, "timestamp_sec": ts, "tag": tag}


def seg(gid, spk, start, end, text):
    return {
        "id": gid,
        "speaker_id": spk,
        "start_sec": start,
        "end_sec": end,
        "text": text,
        "lang": "vi",
        "translations": {},
        "edited": False,
    }


def span(spk, start, end):
    return {"speaker_id": spk, "start_sec": start, "end_sec": end}


def build_session(
    sid, owner, visibility, title, template, duration, size, created,
    speakers, spans, executive, topics, actions, notes, bookmarks,
    transcript, send_history,
):
    detail = {
        "id": sid,
        "user_id": owner,
        "workspace_id": WS,
        "visibility": visibility,
        "owner_user_id": owner,
        "title": title,
        "template_id": template,
        "primary_language": "vi",
        "detected_languages": ["vi"],
        "report_languages": ["vi"],
        "original_report_language": "vi",
        "status": "ready",
        "storage_status": "full",
        "duration_sec": duration,
        "size_bytes": size,
        "created_at": created,
        "audio_expires_at": None,
        "consent": {"confirmed": True, "announced": False},
        "participant_contact_ids": ["c-me"] if owner == "u-hoang" else [],
        "peaks_thumb": [0.5] * 40,
        "speaker_colors_thumb": [0] * 40,
        "open_task_count": sum(1 for a in actions if not a["done"]),
        "executive_summary": executive,
        "speakers": speakers,
        "topics": topics,
        "action_items": actions,
        "notes": notes,
        "bookmarks": bookmarks,
        "photos": [],
        "peaks": [0.5] * 40,
        "speaker_spans": spans,
        "send_history": send_history,
    }
    return {"detail": detail, "transcript": transcript, "chat": []}


sessions = []

# 1. s-nhom-marina-c — anh Hoàng ghi, đã chia sẻ cho cả nhóm
s1_transcript = [
    seg("g1", "SPK_01", 0, 320, "Dạ em chào anh Khánh, sáng nay mình đi thẳng vào căn góc anh quan tâm nhé. Căn 28G3 view cửa sông, 78,5 mét vuông hai phòng ngủ, giá niêm yết 4,72 tỷ, hôm nay sàn được quyền chiết khấu còn 4,68 tỷ."),
    seg("g2", "SPK_02", 320, 520, "Giá đó có kèm phí quản lý không anh? Hồi tuần trước bên em được báo căn tầng thấp còn rẻ hơn khoảng 80 triệu."),
    seg("g3", "SPK_01", 520, 760, "Phí quản lý tính riêng 12.000 một mét vuông một tháng, không gộp vào giá. Căn tầng thấp là căn khác hướng, anh quan tâm view sông thì 28G3 là lựa chọn tốt nhất còn giữ được lúc này."),
    seg("g4", "SPK_02", 760, 940, "Thế giá 4,68 tỷ giữ được tới bao giờ anh? Tôi thì ưng căn rồi, chỉ cần phương án thanh toán rõ ràng là tôi chốt luôn."),
    seg("g5", "SPK_03", 940, 1180, "Phương án hiện tại là đặt cọc 200 triệu, đợt một 30% khi ký hợp đồng mua bán, đợt hai 25% khi xong phần thô, phần còn lại theo tiến độ đến bàn giao dự kiến quý hai năm 2027."),
    seg("g6", "SPK_01", 1180, 1400, "Bên em lập luôn bảng thanh toán từng đợt bằng số tiền cụ thể gửi anh trước tối nay, anh xem lịch chi trả có khớp dòng tiền công ty mình không nhé."),
    seg("g7", "SPK_03", 1400, 1660, "Thêm ưu đãi tháng 11: khách ký hợp đồng mua bán trong tháng được tặng gói nội thất cơ bản trị giá 60 triệu, áp dụng kèm giá chiết khấu, không cộng lồng với ưu đãi khác."),
    seg("g8", "SPK_01", 1660, 1980, "Tôi chốt lại như sau: căn 28G3, giá 4,68 tỷ, đặt cọc 200 triệu chiều thứ Bảy 15/11 tại văn phòng sàn. Sàn chuẩn bị hợp đồng đặt cọc gửi anh duyệt trước chiều 14/11."),
    seg("g9", "SPK_02", 1980, 2160, "Được, tôi theo phương án đó. Nhưng bảng giá chính thức căn 28G3 phải là bản của chủ đầu tư, không phải bảng báo của sàn, tôi cần để đối chiếu."),
    seg("g10", "SPK_01", 2160, 2460, "Em gửi anh bảng giá chính thức kèm phương án thanh toán trước tối mai. Cảm ơn anh đã tin tưởng, chiều 15/11 em chuẩn bị sẵn hồ sơ, anh ký xong vẫn kịp giờ làm."),
]
s1 = build_session(
    "s-nhom-marina-c", "u-hoang", "workspace", "Khách chốt căn góc Marina C",
    "tpl-realestate", 2460, 7380000, "2026-11-13T09:40:00+07:00",
    [
        speaker("SPK_01", "c-me", None, True, 0, 57, 40),
        speaker("SPK_02", None, "Anh Khánh", False, 1, 21, 95),
        speaker("SPK_03", None, "Trâm", False, 2, 22, 380),
    ],
    [
        span("SPK_01", 0, 320), span("SPK_02", 320, 520), span("SPK_01", 520, 760),
        span("SPK_02", 760, 940), span("SPK_03", 940, 1180), span("SPK_01", 1180, 1400),
        span("SPK_03", 1400, 1660), span("SPK_01", 1660, 1980), span("SPK_02", 1980, 2160),
        span("SPK_01", 2160, 2460),
    ],
    "Anh Khánh đồng ý chốt căn góc 2PN tầng 28 Vinhomes Marina C, giá 4,68 tỷ sau chiết khấu 2%. Đặt cọc 200 triệu vào chiều 15/11, hoàn tất hợp đồng mua bán trước 30/11. Sàn gửi bảng giá chính thức và phương án thanh toán từng đợt cho khách trước tối 14/11.",
    [
        topic("t1", "sec-goal", "Chốt căn góc tầng 28", 0, 980, "decided", [
            bullet("b1", "Căn góc 2PN view sông, diện tích 78,5 m², giá niêm yết 4,72 tỷ, chiết khấu còn 4,68 tỷ.", 120, "SPK_01"),
            bullet("b2", "Tôi chốt căn này, giá giữ nguyên 4,68 tỷ như anh báo là được.", 720, "SPK_02", quote=True),
            bullet("b3", "Hoàn tất hợp đồng mua bán và đợt thanh toán đầu 30% trước 30/11.", 950, "SPK_01"),
        ]),
        topic("t2", "sec-payment", "Phương án thanh toán và ưu đãi", 980, 1720, "figure", [
            bullet("b4", "Đợt 1 là 30% khi ký HĐMB, đợt 2 là 25% khi xong thô, phần còn lại theo tiến độ bàn giao dự kiến quý II/2027.", 1080, "SPK_03"),
            bullet("b5", "Quà tặng kèm: gói nội thất cơ bản trị giá 60 triệu nếu khách ký HĐMB trong tháng 11.", 1300, "SPK_03"),
        ], figure={
            "chart_type": "bar",
            "title": "Giá trị từng đợt thanh toán",
            "unit": "triệu ₫",
            "labels": ["Đặt cọc", "Ký HĐMB", "Xong thô", "Bàn giao"],
            "values": [200, 1404, 1170, 1906],
            "source_timestamp_sec": 1100,
        }),
        topic("t3", "sec-next", "Việc sàn cần làm trước 15/11", 1720, 2460, "pending", [
            bullet("b6", "Chuẩn bị hợp đồng đặt cọc, gửi khách duyệt trước chiều 14/11.", 1780, "SPK_01"),
            bullet("b7", "Xin bảng giá chính thức căn 28G3 từ phòng pháp lý chủ đầu tư.", 1960, "SPK_03"),
        ]),
    ],
    [
        action("a1", "s-nhom-marina-c", "Gửi anh Khánh bản dự thảo hợp đồng đặt cọc", "c-me", None, "2026-11-14", "high", False, None, 1780),
        action("a2", "s-nhom-marina-c", "Xin bảng giá chính thức căn 28G3 từ chủ đầu tư", None, "u-dung", "2026-11-15", "medium", False, None, 1960),
        action("a3", "s-nhom-marina-c", "Chốt gói nội thất tặng kèm với chủ đầu tư", "c-me", None, "2026-11-13", "low", True, "2026-11-13T17:05:00+07:00", 1500),
    ],
    [
        note("n1", 850, "Khách hỏi lại chi phí quản lý 12.000/m²/tháng"),
        note("n2", 1500, "Ưu đãi nội thất chỉ áp dụng ký trong tháng 11"),
    ],
    [bookmark("bm1", 720, "decided"), bookmark("bm2", 1100, "figure")],
    s1_transcript,
    [{"sent_at": "2026-11-14T11:15:00+07:00", "recipient_count": 1}],
)
sessions.append(s1)

# 2. s-nhom-hop-tuan-45 — Trâm ghi, đã chia sẻ cho cả nhóm
s2_transcript = [
    seg("t1", "SPK_01", 0, 380, "Chào cả nhóm, họp giao việc tuần 45 bắt đầu nhé. Trước hết là số liệu: tuần này sàn chốt được 3,2 tỷ từ hai giao dịch nhỏ, còn thiếu 800 triệu so với kế hoạch. Tỷ lệ khách đến hẹn thì tăng 9% so với tuần trước."),
    seg("t2", "SPK_02", 380, 520, "Khách về nguồn chủ yếu từ quảng cáo căn Marina, hai khách đó là khách quay lại sau lần xem trước nên ký nhanh hơn dự kiến."),
    seg("t3", "SPK_01", 520, 700, "Tốt. Tuần 46 mình đặt mục tiêu 4 tỷ. Nguồn khách lớn nhất đang là căn Marina C của anh Hoàng, giá 4,68 tỷ, nếu ký được tuần này là vượt kế hoạch rồi."),
    seg("t4", "SPK_04", 700, 880, "Phía em, khách thuê văn phòng Sông Hồng muốn giảm giá 8% mới ký. Em thấy mức đó lạm quá, đề xuất giảm 5% kèm ba tháng miễn phí quản lý."),
    seg("t5", "SPK_01", 880, 1000, "Phương án 5% cộng miễn phí quản lý là hợp lý, giữ được biên cho sàn."),
    seg("t6", "SPK_04", 1000, 1180, "Vâng, em đàm phán lại trong tuần, báo kết quả thứ Sáu. Khách thuê từ tháng 1 năm sau, hợp đồng hai năm nên mình có dư địa thương lượng."),
    seg("t7", "SPK_03", 1180, 1360, "Căn 12A Hoàng Huy chủ nhà muốn chốt nhanh trước 20/11. Em cần phòng pháp lý rà lại sổ hồng vì sổ còn thế chấp tại ngân hàng, cần chủ nhà giải chấp trước khi giao dịch."),
    seg("t8", "SPK_01", 1360, 1520, "Việc thẩm định giao Mai Anh làm với phòng pháp lý trước 18/11. Báo ngay nếu sau 18/11 chưa xong để mình dời lịch ký."),
    seg("t9", "SPK_02", 1520, 1620, "Bảng giá căn 28G3 em đang đợi phòng pháp lý chủ đầu tư trả lời, hẹn chiều 14/11 có."),
    seg("t10", "SPK_01", 1620, 1760, "Dũng ưu tiên việc này, anh Hoàng đang cần bảng giá chính thức để khách ký đặt chỗ thứ Bảy."),
    seg("t11", "SPK_03", 1760, 1860, "Em sẽ ghép lịch gặp phòng pháp lý vào sáng mai luôn cho kịp."),
    seg("t12", "SPK_01", 1860, 1980, "OK. Chốt lại: Dũng bảng giá trước chiều 14/11, Hùng báo Sông Hồng thứ Sáu, Mai Anh thẩm định trước 18/11. Cả tuần săn thêm khách bổ sung cho nguồn tuần sau."),
]
s2 = build_session(
    "s-nhom-hop-tuan-45", "u-tram", "workspace", "Họp giao việc tuần 45",
    "tpl-business", 1980, 5940000, "2026-11-12T08:30:00+07:00",
    [
        speaker("SPK_01", None, "Trâm", False, 0, 55, 30),
        speaker("SPK_02", None, "Dũng", False, 1, 14, 390),
        speaker("SPK_03", None, "Mai Anh", False, 2, 19, 1190),
        speaker("SPK_04", None, "Hùng", False, 3, 12, 710),
    ],
    [
        span("SPK_01", 0, 380), span("SPK_02", 380, 520), span("SPK_01", 520, 700),
        span("SPK_04", 700, 880), span("SPK_01", 880, 1000), span("SPK_04", 1000, 1180),
        span("SPK_03", 1180, 1360), span("SPK_01", 1360, 1520), span("SPK_02", 1520, 1620),
        span("SPK_01", 1620, 1760), span("SPK_03", 1760, 1860), span("SPK_01", 1860, 1980),
    ],
    "Tuần 45 sàn đạt 3,2 tỷ doanh thu chốt, còn thiếu 800 triệu so với kế hoạch. Ba khách lớn đang đàm phán: căn Marina C của anh Hoàng, văn phòng Sông Hồng của anh Hùng, căn 12A Hoàng Huy của Mai Anh. Trâm giao việc cụ thể theo từng người, chốt lại mục tiêu tuần 46 là 4 tỷ.",
    [
        topic("t1", "sec-figure", "Số liệu tuần 45", 0, 620, "figure", [
            bullet("b1", "Doanh thu chốt tuần 45 là 3,2 tỷ từ hai giao dịch, còn thiếu 800 triệu so với kế hoạch tuần.", 180, "SPK_01"),
            bullet("b2", "Tỷ lệ khách đến hẹn tăng 9% so với tuần 44 sau khi đổi kịch bản gọi lại.", 420, "SPK_01"),
        ], figure={
            "chart_type": "bar",
            "title": "Doanh thu chốt theo tuần",
            "unit": "tỷ ₫",
            "labels": ["T43", "T44", "T45", "KH T46"],
            "values": [2.1, 2.8, 3.2, 4.0],
            "source_timestamp_sec": 300,
        }),
        topic("t2", "sec-deal", "Khách lớn đang đàm phán", 620, 1360, "pending", [
            bullet("b3", "Căn Marina C anh Hoàng đang chốt 4,68 tỷ, nếu ký được thì tuần này vượt kế hoạch.", 700, "SPK_01"),
            bullet("b4", "Khách thuê văn phòng Sông Hồng muốn giảm giá 8%, anh Hùng đề xuất giảm 5% kèm ba tháng miễn phí quản lý.", 920, "SPK_04"),
            bullet("b5", "Căn 12A Hoàng Huy bên bán muốn chốt nhanh trước 20/11, Mai Anh lo phần thẩm định pháp lý.", 1140, "SPK_03"),
        ]),
        topic("t3", "sec-next", "Giao việc tuần 46", 1360, 1980, "pending", [
            bullet("b6", "Dũng xin bảng giá căn 28G3 từ chủ đầu tư trước chiều 14/11 để hỗ trợ anh Hoàng.", 1420, "SPK_01"),
            bullet("b7", "Hùng đàm phán lại Sông Hồng theo phương án giảm 5%, báo lại kết quả thứ Sáu.", 1600, "SPK_01"),
            bullet("b8", "Mai Anh làm thẩm định pháp lý căn 12A với phòng pháp lý trước 18/11.", 1780, "SPK_03"),
        ]),
    ],
    [
        action("a1", "s-nhom-hop-tuan-45", "Xin bảng giá căn 28G3 từ chủ đầu tư trước chiều 14/11", None, "u-dung", "2026-11-14", "high", False, None, 1420),
        action("a2", "s-nhom-hop-tuan-45", "Đàm phán lại giá Sông Hồng theo phương án giảm 5%", None, "u-hung", "2026-11-17", "high", False, None, 1600),
        action("a3", "s-nhom-hop-tuan-45", "Thẩm định pháp lý căn 12A với phòng pháp lý", None, "u-mai-anh", "2026-11-18", "medium", False, None, 1780),
    ],
    [
        note("n1", 300, "Kế hoạch tuần 46 đặt 4 tỷ"),
        note("n2", 1240, "Chủ căn 12A muốn chốt trước 20/11"),
    ],
    [bookmark("bm1", 300, "figure"), bookmark("bm2", 1420, "pending")],
    s2_transcript,
    [{"sent_at": "2026-11-12T11:36:00+07:00", "recipient_count": 3}],
)
sessions.append(s2)

# 3. s-nhom-legend-ha-phong — Dũng ghi, đã chia sẻ cho cả nhóm
s3_transcript = [
    seg("t1", "SPK_01", 0, 300, "Dạ em chào chị Nhàn, chiều nay mình xem lại đúng căn tầng 14 tòa The Legend Hà Phong nhé. Căn này 120 mét vuông, view thành phố, chủ tòa đang để giá chào 380.000 một mét vuông một tháng."),
    seg("t2", "SPK_02", 300, 560, "Bên tôi cần đúng 120 mét vuông cho 18 nhân viên, chia ba phòng riêng và một khu vực mở. Văn phòng phải nhận nhà từ đầu tháng 1 năm 2027, hợp đồng ký hai năm."),
    seg("t3", "SPK_01", 560, 820, "Căn tầng 14 còn nguyên, chủ tòa cho sửa mặt bằng trước khi nhận. Giá chào chưa gồm phí quản lý 22.000 một mét vuông một tháng và ba chỗ đậu ô tô tính thêm 1,5 triệu mỗi tháng."),
    seg("t4", "SPK_02", 820, 1000, "Phí đậu xe thì bên tôi chấp nhận được. Nhưng giá thuê 380.000 cao hơn mặt bằng khu đó, tôi chỉ ký khi giá về mức 350.000."),
    seg("t5", "SPK_01", 1000, 1300, "Em sẽ đàm phán lại với chủ tòa theo phương án giảm 5% còn 361.000, kèm ba tháng miễn phí quản lý. Với hợp đồng hai năm thì chủ tòa dễ đồng ý phương án này hơn là cắt sâu giá một lần."),
    seg("t6", "SPK_02", 1300, 1480, "Giá về 361.000 kèm miễn phí quản lý thì ổn. Khi ký tôi đặt cọc hai tháng tiền thuê, nhưng chờ phương án giá cuối cùng của chủ tòa đã, cuối tuần tôi trả lời."),
    seg("t7", "SPK_01", 1480, 1600, "Vâng, em gửi phương án giá chính thức cho chị trước chiều thứ Sáu."),
    seg("t8", "SPK_02", 1600, 1740, "OK. Chị kèm luôn sơ đồ chia phòng cho em, chủ tòa duyệt sớm thì bên tôi khánh thành kịp tháng 1."),
]
s3 = build_session(
    "s-nhom-legend-ha-phong", "u-dung", "workspace", "Khách thuê The Legend Hà Phong",
    "tpl-realestate", 1740, 5220000, "2026-11-11T15:10:00+07:00",
    [
        speaker("SPK_01", None, "Dũng", False, 0, 56, 30),
        speaker("SPK_02", None, "Chị Nhàn", False, 1, 44, 320),
    ],
    [
        span("SPK_01", 0, 300), span("SPK_02", 300, 560), span("SPK_01", 560, 820),
        span("SPK_02", 820, 1000), span("SPK_01", 1000, 1300), span("SPK_02", 1300, 1480),
        span("SPK_01", 1480, 1600), span("SPK_02", 1600, 1740),
    ],
    "Chị Nhàn cần thuê văn phòng 120 m² tầng 14 The Legend Hà Phong cho công ty logistics, nhận nhà 01/01/2027, hợp đồng hai năm. Giá chào 380.000 ₫/m²/tháng chưa gồm phí quản lý; sàn đề xuất chủ tòa giảm 5% còn 361.000 kèm ba tháng miễn phí quản lý, khách chờ phương án giá cuối trước thứ Sáu.",
    [
        topic("t1", "sec-need", "Nhu cầu văn phòng", 0, 740, "decided", [
            bullet("b1", "Cần văn phòng 120 m² tầng trung, thuê từ 01/01/2027, hợp đồng hai năm.", 200, "SPK_02"),
            bullet("b2", "Nhóm khách 18 nhân viên, cần ba phòng riêng và một khu vực mở.", 480, "SPK_02"),
        ]),
        topic("t2", "sec-price", "Giá và phương án ký", 740, 1740, "pending", [
            bullet("b3", "Giá chào của chủ tòa là 380.000 một mét vuông một tháng, chưa gồm phí quản lý 22.000.", 800, "SPK_01"),
            bullet("b4", "Khách chỉ ký khi giá về 350.000; sàn đề xuất giảm 5% còn 361.000 kèm ba tháng miễn phí quản lý.", 1200, "SPK_01"),
            bullet("b5", "Khách đặt cọc hai tháng tiền thuê khi ký, chờ phương án giá cuối tuần.", 1450, "SPK_02"),
        ]),
    ],
    [
        action("a1", "s-nhom-legend-ha-phong", "Đàm phán giá tầng 14 The Legend theo phương án giảm 5%", None, "u-dung", "2026-11-17", "high", False, None, 1200),
    ],
    [note("n1", 640, "Khách cần ba chỗ đậu ô tô")],
    [bookmark("bm1", 1200, "pending")],
    s3_transcript,
    [],
)
sessions.append(s3)

# 4. s-nhom-chu-dau-tu-le-hong — Trâm ghi, riêng tư
s4_transcript = [
    seg("t1", "SPK_01", 0, 400, "Dạ chào ông Việt, chiều nay hai bên mình chốt lại phương án phân phối dự án Lê Hồng cho sàn. Theo buổi làm việc trước, đợt một là 40 căn thương mại, giá bán từ 2,1 đến 2,9 tỷ mỗi căn."),
    seg("t2", "SPK_02", 400, 800, "Đúng vậy. Tôi mở phân phối độc quyền cho sàn giai đoạn một. Sàn giữ chiết khấu 1,5%, thêm 0,5% nếu chốt trên 15 căn trong quý một."),
    seg("t3", "SPK_01", 800, 1200, "Bên sàn cam kết bố trí sáu nhân viên bán hàng chuyên trách cho dự án và ngân sách quảng cáo khu vực Hải Phòng từ đầu tháng 12. Hàng tuần bên tôi gửi báo cáo khách xem nhà cho phòng kinh doanh của công ty."),
    seg("t4", "SPK_02", 1200, 1650, "Tôi giao cho sàn đợt đầu 40 căn, làm tốt thì đợt hai nói chuyện shophouse. Nhưng tôi yêu cầu chỉ định người phụ trách riêng, khách lớn phải có sàn trực tiếp dẫn xem."),
    seg("t5", "SPK_01", 1650, 2100, "Bên em để chị Trâm phụ trách trực tiếp dự án, em là người duyệt mọi báo cáo. Kịch bản dẫn xem và bảng hỏi khách đều làm theo chuẩn công ty mình gửi ông duyệt trước khi áp dụng."),
    seg("t6", "SPK_02", 2100, 2500, "Được. Ký phụ lục phân phối ngày 25/11 tại văn phòng công ty. Phần quảng cáo, tôi duyệt nội dung mẫu trước, không chạy trước khi có chữ ký của phòng truyền thông."),
    seg("t7", "SPK_01", 2500, 2900, "Vâng. Bên em soạn phụ lục gồm phân khu căn, bảng chiết khấu và cam kết nhân sự, gửi trước thứ Hai tuần sau để phòng pháp lý hai bên rà một lượt."),
    seg("t8", "SPK_02", 2900, 3120, "OK, tôi chờ phụ lục của sàn. Chính sách giá không đổi trước 31/12, sau đó tôi mới tính lại cho đợt hai."),
]
s4 = build_session(
    "s-nhom-chu-dau-tu-le-hong", "u-tram", "private", "Gặp chủ đầu tư Lê Hồng",
    "tpl-business", 3120, 9360000, "2026-11-13T16:30:00+07:00",
    [
        speaker("SPK_01", None, "Trâm", False, 0, 53, 30),
        speaker("SPK_02", None, "Ông Việt", False, 1, 47, 420),
    ],
    [
        span("SPK_01", 0, 400), span("SPK_02", 400, 800), span("SPK_01", 800, 1200),
        span("SPK_02", 1200, 1650), span("SPK_01", 1650, 2100), span("SPK_02", 2100, 2500),
        span("SPK_01", 2500, 2900), span("SPK_02", 2900, 3120),
    ],
    "Chủ đầu tư dự án Lê Hồng đồng ý mở phân phối độc quyền cho sàn giai đoạn một với 40 căn thương mại, chiết khấu cho sàn 1,5% (thêm 0,5% nếu chốt trên 15 căn trong quý). Sàn cam kết sáu nhân viên chuyên trách và ngân sách quảng cáo Hải Phòng từ đầu tháng 12; ký phụ lục phân phối ngày 25/11.",
    [
        topic("t1", "sec-deal", "Phân phối độc quyền 40 căn", 0, 1800, "decided", [
            bullet("b1", "Chủ đầu tư mở phân phối độc quyền cho sàn giai đoạn một, 40 căn thương mại giá 2,1 đến 2,9 tỷ.", 240, "SPK_01"),
            bullet("b2", "Chiết khấu cho sàn 1,5%, thêm 0,5% nếu chốt trên 15 căn trong quý.", 900, "SPK_02"),
            bullet("b3", "Tôi giao cho sàn đợt đầu 40 căn, làm tốt thì đợt hai nói chuyện shophouse.", 1450, "SPK_02", quote=True),
        ]),
        topic("t2", "sec-commit", "Cam kết triển khai", 1800, 3120, "pending", [
            bullet("b4", "Sàn cam kết sáu nhân viên chuyên trách và ngân sách quảng cáo khu vực Hải Phòng từ đầu tháng 12.", 1860, "SPK_01"),
            bullet("b5", "Ngày 25/11 ký phụ lục phân phối tại văn phòng chủ đầu tư.", 2400, "SPK_01"),
        ]),
    ],
    [
        action("a1", "s-nhom-chu-dau-tu-le-hong", "Soạn phụ lục phân phối độc quyền gửi chủ đầu tư", None, "u-tram", "2026-11-22", "high", False, None, 2400),
    ],
    [note("n1", 2350, "Quảng cáo phải duyệt nội dung mẫu trước")],
    [bookmark("bm1", 1450, "decided"), bookmark("bm2", 2400, "pending")],
    s4_transcript,
    [],
)
sessions.append(s4)

# 5. s-nhom-van-phong-song-hong — Hùng ghi, riêng tư
s5_transcript = [
    seg("t1", "SPK_01", 0, 260, "Dạ em chào anh Khoa, hôm nay anh xem lại khu văn phòng tầng 9 tòa Sông Hồng nhé. Khu trống đang có 90 mét vuông, chủ tòa để giá 360.000 một mét vuông một tháng, chưa gồm phí quản lý."),
    seg("t2", "SPK_02", 260, 470, "Bên tôi cần đúng khu đó cho 14 nhân viên. Nhưng anh nói thật, mức 360.000 là cao hơn hai tòa cạnh bên từ 6 đến 8 phần trăm. Tôi ký được nếu giá giảm 8%."),
    seg("t3", "SPK_01", 470, 700, "Mặt bằng tòa Sông Hồng mới sơn lại, thang máy riêng cho khu văn phòng và đổ bộ điều hòa đa zone. Giá giảm 8% thì em không có quyền, nhưng em có phương án khác giữ lợi ích cho anh."),
    seg("t4", "SPK_02", 470, 700, "") if False else seg("t4", "SPK_02", 700, 900, "Anh nói phương án nghe trước. Nếu vẫn phải trả gần bằng giá chào thì bên tôi không có lý do chuyển sang tòa này."),
    seg("t5", "SPK_01", 900, 1160, "Phương án của em: giá giảm 5% còn 342.000, cộng ba tháng miễn phí quản lý. Quy đổi ra, năm đầu anh tiết kiệm được khoảng 58 triệu so với giá chào, gần bằng giảm 8% nhưng chủ tòa dễ gật hơn."),
    seg("t6", "SPK_02", 1160, 1330, "Mức đó gần kỳ vọng của tôi rồi. Nhận nhà từ tháng 1/2027, hợp đồng hai năm, ba tháng miễn phí quản lý tính từ khi nhận nhà."),
    seg("t7", "SPK_01", 1330, 1450, "Vâng, em đàm phán lại với chủ tòa và báo anh phương án bằng văn bản trước thứ Sáu."),
    seg("t8", "SPK_02", 1450, 1560, "OK, cuối tuần tôi chốt. Anh giữ khu tầng 9 giúp tôi, đừng để khách khác đặt trước."),
]
s5 = build_session(
    "s-nhom-van-phong-song-hong", "u-hung", "private", "Khách thuê văn phòng Sông Hồng",
    "tpl-realestate", 1560, 4680000, "2026-11-12T10:15:00+07:00",
    [
        speaker("SPK_01", None, "Hùng", False, 0, 54, 30),
        speaker("SPK_02", None, "Anh Khoa", False, 1, 46, 270),
    ],
    [
        span("SPK_01", 0, 260), span("SPK_02", 260, 470), span("SPK_01", 470, 700),
        span("SPK_02", 700, 900), span("SPK_01", 900, 1160), span("SPK_02", 1160, 1330),
        span("SPK_01", 1330, 1450), span("SPK_02", 1450, 1560),
    ],
    "Anh Khoa muốn thuê 90 m² văn phòng tòa Sông Hồng từ tháng 1/2027, hợp đồng hai năm, yêu cầu giảm giá 8%. Hùng đề xuất giảm 5% còn 342.000 ₫/m²/tháng kèm ba tháng miễn phí quản lý; khách chờ phương án bằng văn bản trước thứ Sáu rồi chốt.",
    [
        topic("t1", "sec-need", "Yêu cầu của khách", 0, 700, "decided", [
            bullet("b1", "Khách cần khu 90 m² tầng 9 cho 14 nhân viên, nhận nhà từ tháng 1/2027, hợp đồng hai năm.", 340, "SPK_02"),
            bullet("b2", "Khách chỉ ký khi giá giảm 8% so với giá chào 360.000 một mét vuông một tháng.", 600, "SPK_02"),
        ]),
        topic("t2", "sec-deal", "Phương án giảm giá", 700, 1560, "pending", [
            bullet("b3", "Đề xuất chủ tòa: giá giảm 5% còn 342.000 kèm ba tháng miễn phí quản lý, tương đương tiết kiệm khoảng 58 triệu năm đầu.", 1050, "SPK_01"),
            bullet("b4", "Gửi phương án bằng văn bản trước thứ Sáu, khách chốt cuối tuần.", 1380, "SPK_01"),
        ]),
    ],
    [
        action("a1", "s-nhom-van-phong-song-hong", "Đàm phán lại giá Sông Hồng theo phương án giảm 5%", None, "u-hung", "2026-11-17", "high", False, None, 1100),
    ],
    [],
    [bookmark("bm1", 1050, "pending")],
    s5_transcript,
    [],
)
sessions.append(s5)

# 6. s-nhom-chot-can-12a — Mai Anh ghi, riêng tư
s6_transcript = [
    seg("t1", "SPK_01", 0, 300, "Dạ buổi nay ba bên mình gặp nhau để chốt căn 12A tòa B Hoàng Huy. Bên chị Ngọc là chủ nhà, anh Phúc là khách mua, em là bên môi giới. Căn 96 mét vuông ba phòng ngủ, giá trao đổi quanh 3,2 tỷ."),
    seg("t2", "SPK_02", 300, 520, "Tôi xem căn hai lần rồi, ưng hướng và tầng. Nhưng sổ hồng căn này còn thế chấp ở Vietbank thì tôi không ký được, phải sạch nợ trước khi làm hợp đồng."),
    seg("t3", "SPK_03", 520, 800, "Khoản thế chấp của tôi còn 1,1 tỷ, tôi giải chấp được trước 18/11 nếu khách đặt cọc sớm. Sau khi giải chấp, ngân hàng trả sổ gốc trong ba ngày làm việc."),
    seg("t4", "SPK_01", 800, 1060, "Thứ tự làm việc như sau: bên anh Phúc đặt cọc 150 triệu, chị Ngọc giải chấp trước 18/11, hai bên ký hợp đồng công chứng ngày 21/11 tại văn phòng công chứng Nguyễn Bỉnh Khiêm."),
    seg("t5", "SPK_02", 1060, 1280, "Cọc 150 triệu tôi đồng ý, nhưng ghi rõ trong giấy đặt cọc: nếu đến 18/11 sổ chưa giải chấp xong thì cọc trả lại đầy đủ, hai bên không phạt gì."),
    seg("t6", "SPK_03", 1280, 1560, "Tôi chấp nhận điều khoản đó. Giá cuối cùng tôi giữ 3,15 tỷ, không giảm thêm; phí công chứng mỗi bên chịu một nửa."),
    seg("t7", "SPK_01", 1560, 1700, "Giá 3,15 tỷ, anh Phúc thấy sao? Nếu ok em lập giấy đặt cọc ngay chiều nay cho hai bên ký."),
    seg("t8", "SPK_02", 1700, 1820, "OK, 3,15 tỷ theo phương án đó. Em gửi giấy đặt cọc sớm, tôi ký chiều nay luôn cho kịp lịch giải chấp."),
]
s6 = build_session(
    "s-nhom-chot-can-12a", "u-mai-anh", "private", "Chốt giao dịch căn 12A Hoàng Huy",
    "tpl-realestate", 1820, 5460000, "2026-11-10T14:00:00+07:00",
    [
        speaker("SPK_01", None, "Mai Anh", False, 0, 38, 30),
        speaker("SPK_02", None, "Anh Phúc", False, 1, 34, 310),
        speaker("SPK_03", None, "Chị Ngọc", False, 2, 28, 530),
    ],
    [
        span("SPK_01", 0, 300), span("SPK_02", 300, 520), span("SPK_03", 520, 800),
        span("SPK_01", 800, 1060), span("SPK_02", 1060, 1280), span("SPK_03", 1280, 1560),
        span("SPK_01", 1560, 1700), span("SPK_02", 1700, 1820),
    ],
    "Ba bên thống nhất giá bán căn 12A tòa B Hoàng Huy 3,15 tỷ. Khách đặt cọc 150 triệu ngay hôm gặp; bên bán cam kết giải chấp thế chấp tại Vietbank trước 18/11, nếu trễ thì cọc trả lại đủ. Hai bên ký hợp đồng công chứng ngày 21/11, phí công chứng mỗi bên chịu một nửa.",
    [
        topic("t1", "sec-deal", "Thống nhất giá và điều khoản cọc", 0, 1060, "decided", [
            bullet("b1", "Giá bán cuối cùng 3,15 tỷ; khách đặt cọc 150 triệu ngay trong buổi.", 900, "SPK_01"),
            bullet("b2", "Nếu đến 18/11 sổ chưa giải chấp xong thì cọc trả lại đầy đủ, hai bên không phạt gì.", 1160, "SPK_02"),
        ]),
        topic("t2", "sec-next", "Lịch giải chấp và công chứng", 1060, 1820, "pending", [
            bullet("b3", "Bên bán giải chấp thế chấp 1,1 tỷ tại Vietbank trước 18/11, ngân hàng trả sổ gốc trong ba ngày làm việc.", 1350, "SPK_03"),
            bullet("b4", "Ký hợp đồng công chứng ngày 21/11 tại văn phòng công chứng Nguyễn Bỉnh Khiêm, phí mỗi bên chịu một nửa.", 1600, "SPK_01"),
        ]),
    ],
    [
        action("a1", "s-nhom-chot-can-12a", "Nhắc chủ nhà giải chấp thế chấp trước 18/11", None, "u-mai-anh", "2026-11-18", "high", False, None, 1350),
    ],
    [note("n1", 1180, "Điều khoản trả cọc nếu giải chấp trễ — ghi vào giấy đặt cọc")],
    [bookmark("bm1", 900, "decided"), bookmark("bm2", 1350, "pending")],
    s6_transcript,
    [],
)
sessions.append(s6)

os.makedirs(OUT, exist_ok=True)
for s in sessions:
    path = f"{OUT}/{s['detail']['id']}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(s, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("ghi", path)
