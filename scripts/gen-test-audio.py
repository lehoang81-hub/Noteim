#!/usr/bin/env python3
"""
Sinh bộ âm thanh thử cho chặng B0 (Noteim) từ lời của buổi ghi mẫu.

- Mặc định dùng giọng AI tự nhiên qua `edge-tts` (giọng Microsoft, cần mạng).
  Người Việt dùng giọng vi-VN, người Hàn dùng giọng ko-KR; đoạn tiếng Anh của
  người Hàn đọc bằng chính giọng Hàn của họ (giọng Anh pha Hàn, như thật).
- --engine fpt : dùng FPT.AI khi có khóa trong biến môi trường FPT_TTS_KEY;
  chỉ đổi Người nói 3 (bộ 01) và Chị Hằng (bộ 03) sang giọng miền Nam/Trung,
  các người nói còn lại vẫn dùng edge-tts.
- --engine elevenlabs : dùng ElevenLabs khi có khóa trong biến môi trường
  ELEVENLABS_API_KEY; cũng chỉ đổi Người nói 3 và Chị Hằng. Lưu ý: các giọng
  mặc định ElevenLabs đọc tiếng Việt chưa đạt khi thử (xem test-data/README.md);
  đặt ELEVEN_VOICE_SPK3 / ELEVEN_VOICE_CHI_HANG nếu có giọng Việt tốt hơn.
- --engine espeak : giọng đọc máy espeak-ng chạy offline (phương án dự phòng,
  nghe rõ là máy, KHÔNG dùng để đánh giá chất lượng AI nhận dạng giọng người).
- Mỗi người nói một giọng, cao độ, tốc độ, âm lượng riêng; có khoảng lặng ngắn
  và dài ("suy nghĩ lâu"), tiếng nền theo từng phòng.
- Mỗi đoạn đọc thành file riêng; start_sec/end_sec trong .truth.json đo từ độ
  dài thật của từng đoạn đã đọc.
- Xuất: <tên>.ogg (Opus 32 kbps), <tên>.m4a (AAC, cho iPhone), <tên>.truth.json
  (đáp án: từng đoạn, người nói, ngôn ngữ, chữ Nguyên văn, mốc thời gian).
- Bộ 06 đến 10 (M9-02): âm thanh cho 5 buổi mẫu theo nghề còn thiếu
  (fixtures/samples, gắn bằng scripts/attach-test-audio.mjs) — đọc đủ mọi
  câu trong fixture nên buổi dài (bất động sản, chủ doanh nghiệp) đọc nhanh
  hơn và nghỉ ngắn hơn để nhẹ dung lượng.

Cách chạy:
  pip install edge-tts numpy && python3 scripts/gen-test-audio.py
  python3 scripts/gen-test-audio.py --engine espeak       # dự phòng, chạy offline
  python3 scripts/gen-test-audio.py --only 03-bac-si-kham # sinh riêng một bộ

Bộ đọc lỗi (mạng, giới hạn) thì thử lại 3 lần, có chờ; vẫn lỗi thì dừng và báo,
KHÔNG lặng lẽ rơi về espeak.
"""
import argparse, asyncio, ctypes, hashlib, json, os, random, subprocess, sys, tempfile, time, wave
import urllib.request
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "test-data", "audio")
SR = 22050

FPT_TTS_KEY = os.environ.get("FPT_TTS_KEY", "")
EL_TTS_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
EL_VOICE_SPK3 = os.environ.get("ELEVEN_VOICE_SPK3", "5Q0t7uMcjvnagumLfvZi")      # Paul (mặc định, chưa đạt khi thử)
EL_VOICE_CHI_HANG = os.environ.get("ELEVEN_VOICE_CHI_HANG", "pFZP5JQG7iQjIQuC4Bku")  # Lily (khá khi thử)
# Góp ý vòng 1 (#75, bộ 05): kiểm lại ngày 2026-11-19 — Adam, Sarah, Laura,
# Josh đọc tiếng Việt và tiếng Anh pha trong câu chuẩn (xác nhận bằng Soniox).
EL_VOICE_05 = {
    "SPK_01": os.environ.get("ELEVEN_VOICE_05_SPK1", "pNInz6obpgDQGcFmaJgB"),  # Adam (trưởng nhóm)
    "SPK_02": os.environ.get("ELEVEN_VOICE_05_SPK2", "EXAVITQu4vr4xnSDxMaL"),  # Sarah (nhân viên)
}

CACHE = os.path.join(tempfile.gettempdir(), "noteim-audio-cache")

# ---------------------------------------------------------------- espeak (dự phòng)
_espeak_lib = None
_buf = []

def espeak_init():
    import espeakng_loader as E
    global _espeak_lib, _ccb
    _espeak_lib = ctypes.cdll.LoadLibrary(E.get_library_path())
    assert _espeak_lib.espeak_Initialize(2, 0, E.get_data_path().encode(), 0) == SR
    CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
    def _cb(wav, n, ev):
        if n > 0:
            _buf.append(ctypes.string_at(wav, n * 2))
        return 0
    _ccb = CB(_cb)
    _espeak_lib.espeak_SetSynthCallback(_ccb)

def tts_espeak(text, voice, pitch, speed):
    _buf.clear()
    _espeak_lib.espeak_SetVoiceByName(voice.encode())
    _espeak_lib.espeak_SetParameter(1, speed, 0)   # tốc độ, từ/phút
    _espeak_lib.espeak_SetParameter(3, pitch, 0)   # cao độ 0..100
    t = text.encode("utf-8")
    _espeak_lib.espeak_Synth(t, len(t) + 1, 0, 0, 0, 0x10, None, None)
    _espeak_lib.espeak_Synchronize()
    return np.frombuffer(b"".join(_buf), dtype=np.int16).astype(np.float32) / 32768.0

# ---------------------------------------------------------------- bộ đọc edge-tts
def decode_to_pcm(path):
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                       capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.int16).astype(np.float32) / 32768.0

def edge_synth(text, voice, rate, pitch):
    """Đọc MỘT đoạn bằng edge-tts thành file mp3 riêng, decode về PCM."""
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1(f"edge|{voice}|{rate}|{pitch}|{text}".encode()).hexdigest()[:16]
    mp3 = os.path.join(CACHE, key + ".mp3")
    if os.path.exists(mp3):
        return decode_to_pcm(mp3)
    import edge_tts
    async def run():
        c = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        await c.save(mp3 + ".part")
    try:
        asyncio.run(asyncio.wait_for(run(), 120))   # mỗi đoạn tối đa 120s, treo mạng thì coi như lỗi để thử lại
    except asyncio.TimeoutError as e:
        raise RuntimeError("hết 120s không đọc xong") from e
    os.replace(mp3 + ".part", mp3)
    return decode_to_pcm(mp3)

def fpt_synth(text, voice):
    """Đọc một đoạn bằng FPT.AI (khoảng 5: trả về URL mp3, tải về)."""
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1(f"fpt|{voice}|{text}".encode()).hexdigest()[:16]
    mp3 = os.path.join(CACHE, key + ".mp3")
    if os.path.exists(mp3):
        return decode_to_pcm(mp3)
    from urllib.parse import urlencode
    req = urllib.request.Request(
        "https://api.fpt.ai/hmi/tts/v5", data=urlencode({"text": text}).encode(),
        headers={"api-key": FPT_TTS_KEY, "voice": voice, "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=60) as r:
        info = json.loads(r.read().decode())
    url = info.get("async")
    if not url:
        raise RuntimeError(f"FPT.AI không trả URL: {info}")
    for _ in range(3):  # máy chủ cần vài giây tổng hợp xong
        time.sleep(3)
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = r.read()
            if len(data) > 1000:
                break
        except Exception:
            data = b""
    else:
        raise RuntimeError("FPT.AI không tải được file mp3")
    with open(mp3, "wb") as f:
        f.write(data)
    return decode_to_pcm(mp3)

def el_synth(text, voice_id):
    """Đọc một đoạn bằng ElevenLabs (eleven_turbo_v2_5, đọc được tiếng Việt)."""
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1(f"el|{voice_id}|{text}".encode()).hexdigest()[:16]
    mp3 = os.path.join(CACHE, key + ".mp3")
    if os.path.exists(mp3):
        return decode_to_pcm(mp3)
    body = json.dumps({
        "text": text, "model_id": "eleven_turbo_v2_5",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}", data=body,
        headers={"xi-api-key": EL_TTS_KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    if len(data) < 1000:
        raise RuntimeError(f"ElevenLabs trả file quá nhỏ ({len(data)} byte)")
    with open(mp3, "wb") as f:
        f.write(data)
    return decode_to_pcm(mp3)

def with_retry(fn, label, attempts=3, waits=(5, 15, 30)):
    """Thử lại 3 lần khi bộ đọc lỗi (mạng, giới hạn); vẫn lỗi thì DỪNG và báo rõ."""
    last = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:
            last = e
            if i < attempts - 1:
                w = waits[i]
                print(f"  lỗi {label}: {e} — thử lại sau {w}s (lần {i + 1}/{attempts})")
                time.sleep(w)
    print(f"DỪNG: bộ đọc lỗi liên tục {attempts} lần ở {label}: {last}", file=sys.stderr)
    print("DỪNG: không lặng lẽ rơi về espeak. Kiểm tra mạng/khóa API rồi chạy lại.", file=sys.stderr)
    raise SystemExit(1)

# ---------------------------------------------------------------- phần chung
def db(x):
    return 10 ** (x / 20)

# Mức RMS mục tiêu cho người nói có gain 0 dB. Các giọng AI có mức gốc khác nhau
# (thử cho thấy giọng nữ edge đọc lớn hơn giọng nam khoảng 10 dB), nên mỗi đoạn
# được chuẩn hóa về mức này rồi mới nhân gain_db, để đo lại từ file cuối khớp gain.
TARGET_RMS = 0.08

def trim_silence(a, margin=0.02):
    """Cắt im lặng đầu/cuối của file đã đọc (ngưỡng thấp để không mất phụ âm)."""
    m = np.abs(a).max()
    if m <= 0:
        return a
    th = m * 10 ** (-50 / 20)
    nz = np.nonzero(np.abs(a) > th)[0]
    if len(nz) == 0:
        return a
    lo = max(0, int(nz[0]) - int(margin * SR)); hi = min(len(a), int(nz[-1]) + int(margin * SR))
    return a[lo:hi]

def pink(n, rng):
    w = rng.standard_normal(n)
    f = np.fft.rfft(w)
    f /= np.sqrt(np.maximum(np.arange(len(f)), 1))
    p = np.fft.irfft(f, n)
    return p / (np.abs(p).max() + 1e-9)

def room(n, kind, rng):
    t = np.arange(n) / SR
    if kind == "van-phong":      # văn phòng yên, quạt nhẹ
        return 0.010 * pink(n, rng)
    if kind == "phong-hop-may":  # phòng họp cạnh xưởng: điều hòa, tiếng máy 100 Hz
        return 0.022 * pink(n, rng) + 0.006 * np.sin(2 * np.pi * 100 * t)
    if kind == "phong-kham":     # phòng khám: hành lang ồn, tiếng gọi số xa xa
        base = 0.030 * pink(n, rng)
        for s in rng.uniform(0, n / SR, size=max(1, int(n / SR / 40))):
            i = int(s * SR); L = int(0.6 * SR)
            if i + L < n:
                base[i:i + L] += 0.04 * np.sin(2 * np.pi * 880 * t[:L]) * np.hanning(L)
        return base
    raise ValueError(kind)

# Mỗi bộ: file mẫu, phòng, ghi chú
SETS = [
    {
        "name": "01-bds-gap-chi-lan", "fixture": "fixtures/sessions/bds-gap-chi-lan.json", "room": "van-phong",
        "note": "Văn phòng yên. Chị Lan nói nhỏ hơn 9 dB để thử Cân âm lượng.",
    },
    {
        "name": "02-hop-doi-tac-han", "fixture": "fixtures/sessions/hop-doi-tac-han.json", "room": "phong-hop-may",
        "note": "Nói lẫn Việt, Hàn, Anh. Phòng họp cạnh xưởng, có điều hòa và tiếng máy.",
    },
    {
        "name": "03-bac-si-kham", "fixture": "fixtures/samples/doctor.json", "room": "phong-kham",
        "note": "Phòng khám ồn. Bệnh nhân nói chậm, nhỏ.",
    },
    {
        "name": "05-vi-en-pha-le", "fixture": "test-data/audio/05-vi-en-pha-le.dialogue.json", "room": "van-phong",
        "note": "Góp ý vòng 1 (#75): nói lẫn Việt, Anh kiểu dân văn phòng trong cùng một câu (KPI phase 2, dashboard, deadline, report). Văn phòng yên.",
    },
    {
        "name": "06-mau-bds-vinhomes-marina", "fixture": "fixtures/samples/realestate_sales.json", "room": "van-phong",
        "note": "Buổi mẫu bất động sản (s-sample-realestate_sales, M9-02). 60 đoạn nên đọc nhanh hơn, nghỉ ngắn để nhẹ dung lượng.",
        "gap_change": (0.3, 0.7), "gap_same": (0.15, 0.4), "long_gap_p": 0.06, "long_gap": (2.0, 3.5),
    },
    {
        "name": "07-mau-cong-chung-hqv", "fixture": "fixtures/samples/notary.json", "room": "van-phong",
        "note": "Buổi mẫu công chứng (s-sample-notary, M9-02). Văn phòng công chứng yên, bên bán nói chậm và trầm.",
    },
    {
        "name": "08-mau-luat-su-thue", "fixture": "fixtures/samples/lawyer.json", "room": "van-phong",
        "note": "Buổi mẫu luật sư (s-sample-lawyer, M9-02). Văn phòng luật yên, ông Phước kể chậm.",
    },
    {
        "name": "09-mau-kien-truc-lach-tray", "fixture": "fixtures/samples/architect.json", "room": "phong-hop-may",
        "note": "Buổi mẫu kiến trúc sư (s-sample-architect, M9-02). Họp hiện trường cạnh xưởng: điều hòa, tiếng máy.",
    },
    {
        "name": "10-mau-dieu-hanh-noi-that", "fixture": "fixtures/samples/business_owner.json", "room": "phong-hop-may",
        "note": "Buổi mẫu chủ doanh nghiệp (s-sample-business_owner, M9-02). Họp 5 người ở phòng cạnh xưởng, 69 đoạn nên đọc nhanh, nghỉ ngắn.",
        "gap_change": (0.3, 0.7), "gap_same": (0.15, 0.4), "long_gap_p": 0.06, "long_gap": (2.0, 3.5),
    },
]

# Bảng giọng dùng cho engine tự nhiên (edge / fpt / elevenlabs).
# pitch: lệch cao độ (Hz); rate: lệch tốc độ (%); gain_db: âm lượng theo người nói.
# Mỗi người nói một giọng, cao độ và tốc độ khác nhau để phân biệt nghe được.
# Bộ 02: đoạn tiếng Anh của Park và Kim đọc bằng CHÍNH giọng Hàn của họ
# (giọng Anh pha Hàn, như thật) — không đổi sang giọng tiếng Anh.
NAT_VOICES = {
    "01-bds-gap-chi-lan": {
        "SPK_01": {"voice": "vi-VN-NamMinhNeural", "pitch": "+0Hz", "rate": "+0%", "gain_db": 0, "role": "Bạn (môi giới)"},
        "SPK_02": {"voice": "vi-VN-HoaiMyNeural", "pitch": "+0Hz", "rate": "-8%", "gain_db": -9, "role": "Chị Lan (chậm hơn một chút, nhỏ hơn 9 dB)"},
        "SPK_03": {"voice": "vi-VN-NamMinhNeural", "pitch": "-15Hz", "rate": "+10%", "gain_db": -3, "role": "Người nói 3 (bạn của chị Lan, trầm và nhanh hơn)"},
    },
    "02-hop-doi-tac-han": {
        "SPK_01": {"voice": "vi-VN-NamMinhNeural", "pitch": "+0Hz", "rate": "+0%", "gain_db": 0, "role": "Bạn (môi giới)"},
        "SPK_02": {"voice": "ko-KR-InJoonNeural", "pitch": "-10Hz", "rate": "+0%", "gain_db": 2, "role": "Park Ji-ho (trầm hơn một chút)"},
        "SPK_03": {"voice": "ko-KR-SunHiNeural", "pitch": "+8Hz", "rate": "+5%", "gain_db": -4, "role": "Kim Min-ji (cao và nhanh hơn)"},
        "SPK_04": {"voice": "vi-VN-HoaiMyNeural", "pitch": "+10Hz", "rate": "+0%", "gain_db": -6, "role": "Chị Thảo (cao hơn)"},
    },
    "03-bac-si-kham": {
        "SPK_01": {"voice": "vi-VN-NamMinhNeural", "pitch": "+0Hz", "rate": "+0%", "gain_db": 0, "role": "Bạn (bác sĩ)"},
        "SPK_02": {"voice": "vi-VN-HoaiMyNeural", "pitch": "+0Hz", "rate": "-15%", "gain_db": -7, "role": "Chị Hằng (bệnh nhân, chậm và nhỏ)"},
        "SPK_03": {"voice": "vi-VN-NamMinhNeural", "pitch": "-10Hz", "rate": "-5%", "gain_db": 0, "role": "Người nhà (con chị Hằng)"},
    },
    "05-vi-en-pha-le": {
        "SPK_01": {"voice": "vi-VN-NamMinhNeural", "pitch": "+0Hz", "rate": "+0%", "gain_db": 0, "role": "Anh Minh (trưởng nhóm)"},
        "SPK_02": {"voice": "vi-VN-HoaiMyNeural", "pitch": "+5Hz", "rate": "+6%", "gain_db": -2, "role": "Em Nhi (nhân viên, nói nhanh hơn một chút)"},
    },
    "06-mau-bds-vinhomes-marina": {
        "SPK_01": {"voice": "vi-VN-NamMinhNeural", "pitch": "+0Hz", "rate": "+20%", "gain_db": 0, "role": "Bạn (môi giới, dẫn buổi)"},
        "SPK_02": {"voice": "vi-VN-HoaiMyNeural", "pitch": "+0Hz", "rate": "+18%", "gain_db": -3, "role": "Chị Lan (khách, nhỏ hơn 3 dB)"},
        "SPK_03": {"voice": "vi-VN-NamMinhNeural", "pitch": "-20Hz", "rate": "+18%", "gain_db": -5, "role": "Anh đi cùng chị Lan (trầm, nhỏ hơn 5 dB)"},
    },
    "07-mau-cong-chung-hqv": {
        "SPK_01": {"voice": "vi-VN-HoaiMyNeural", "pitch": "+0Hz", "rate": "+0%", "gain_db": 0, "role": "Bạn (công chứng viên)"},
        "SPK_02": {"voice": "vi-VN-NamMinhNeural", "pitch": "-10Hz", "rate": "-5%", "gain_db": -2, "role": "Chủ hộ bên bán (trầm, chậm)"},
        "SPK_03": {"voice": "vi-VN-HoaiMyNeural", "pitch": "+12Hz", "rate": "+5%", "gain_db": -4, "role": "Em bên mua (cao, nhanh hơn)"},
    },
    "08-mau-luat-su-thue": {
        "SPK_01": {"voice": "vi-VN-HoaiMyNeural", "pitch": "+0Hz", "rate": "+0%", "gain_db": 0, "role": "Bạn (luật sư)"},
        "SPK_02": {"voice": "vi-VN-NamMinhNeural", "pitch": "-8Hz", "rate": "-8%", "gain_db": -2, "role": "Ông Phước (bên thuê, kể chậm)"},
        "SPK_03": {"voice": "vi-VN-NamMinhNeural", "pitch": "+15Hz", "rate": "+5%", "gain_db": -5, "role": "Người viết hợp đồng (sáng, nhỏ hơn 5 dB)"},
    },
    "09-mau-kien-truc-lach-tray": {
        "SPK_01": {"voice": "vi-VN-NamMinhNeural", "pitch": "+0Hz", "rate": "+0%", "gain_db": 0, "role": "Bạn (kiến trúc sư)"},
        "SPK_02": {"voice": "vi-VN-NamMinhNeural", "pitch": "+20Hz", "rate": "+8%", "gain_db": -4, "role": "Anh chủ nhà (sáng và nhanh hơn)"},
        "SPK_03": {"voice": "vi-VN-HoaiMyNeural", "pitch": "+5Hz", "rate": "-5%", "gain_db": -2, "role": "Chị quản lý thi công (chậm hơn một chút)"},
    },
    "10-mau-dieu-hanh-noi-that": {
        "SPK_01": {"voice": "vi-VN-NamMinhNeural", "pitch": "+0Hz", "rate": "+20%", "gain_db": 0, "role": "Bạn (chủ doanh nghiệp, dẫn họp)"},
        "SPK_02": {"voice": "vi-VN-HoaiMyNeural", "pitch": "+0Hz", "rate": "+20%", "gain_db": -3, "role": "Kế toán (báo số liệu)"},
        "SPK_03": {"voice": "vi-VN-NamMinhNeural", "pitch": "-15Hz", "rate": "+25%", "gain_db": -5, "role": "Trưởng xưởng (trầm, nói nhanh)"},
        "SPK_04": {"voice": "vi-VN-HoaiMyNeural", "pitch": "+12Hz", "rate": "+22%", "gain_db": -4, "role": "Marketing (cao và nhanh)"},
        "SPK_05": {"voice": "vi-VN-NamMinhNeural", "pitch": "+10Hz", "rate": "+20%", "gain_db": -6, "role": "Bán hàng (nhỏ nhất phòng)"},
    },
}

# engine fpt / elevenlabs chỉ đổi những người nói này (còn lại vẫn dùng edge):
SWAP = {"01-bds-gap-chi-lan": ["SPK_03"], "03-bac-si-kham": ["SPK_02"]}
# engine elevenlabs có bảng riêng: bộ 05 đọc trọn hai người nói bằng ElevenLabs
# vì giọng edge-tts tiếng Việt bị chặn 403 ở máy làm việc ngày 2026-11-19.
EL_SWAP = dict(SWAP)
EL_SWAP["05-vi-en-pha-le"] = ["SPK_01", "SPK_02"]
FPT_VOICES = {"SPK_03": "giahung", "SPK_02": "thuminh"}   # giọng miền Nam; chưa chạy thử được vì chưa có khóa
# Đoạn tiếng Anh của Park (SPK_02) và Kim (SPK_03) đọc bằng CHÍNH giọng Hàn của họ
# (giọng Anh pha Hàn, như thật) — không đổi sang giọng tiếng Anh.

# Bảng giọng espeak — phương án dự phòng offline, giữ nguyên như trước.
ESPEAK_SETS = {
    "01-bds-gap-chi-lan": {"voices": {"SPK_01": ("vi+m3", 45, 165, 0), "SPK_02": ("vi+f2", 62, 150, -9), "SPK_03": ("vi+m1", 35, 155, -3)}, "lang_voice": {}},
    "02-hop-doi-tac-han": {"voices": {"SPK_01": ("vi+m3", 45, 165, 0), "SPK_02": ("ko+m2", 40, 160, 2), "SPK_03": ("ko+f3", 65, 170, -4), "SPK_04": ("vi+f1", 58, 155, -6)}, "lang_voice": {"en": "en+m3"}},
    "03-bac-si-kham": {"voices": {"SPK_01": ("vi+m2", 42, 170, 0), "SPK_02": ("vi+f4", 60, 140, -7)}, "lang_voice": {}},
    "05-vi-en-pha-le": {"voices": {"SPK_01": ("vi+m3", 45, 165, 0), "SPK_02": ("vi+f2", 55, 170, -2)}, "lang_voice": {}},
    "06-mau-bds-vinhomes-marina": {"voices": {"SPK_01": ("vi+m3", 45, 180, 0), "SPK_02": ("vi+f2", 62, 175, -3), "SPK_03": ("vi+m1", 35, 175, -5)}, "lang_voice": {}},
    "07-mau-cong-chung-hqv": {"voices": {"SPK_01": ("vi+f4", 58, 155, 0), "SPK_02": ("vi+m2", 42, 150, -2), "SPK_03": ("vi+f1", 65, 165, -4)}, "lang_voice": {}},
    "08-mau-luat-su-thue": {"voices": {"SPK_01": ("vi+f4", 55, 160, 0), "SPK_02": ("vi+m2", 45, 145, -2), "SPK_03": ("vi+m1", 40, 165, -5)}, "lang_voice": {}},
    "09-mau-kien-truc-lach-tray": {"voices": {"SPK_01": ("vi+m3", 45, 160, 0), "SPK_02": ("vi+m2", 50, 170, -4), "SPK_03": ("vi+f2", 58, 150, -2)}, "lang_voice": {}},
    "10-mau-dieu-hanh-noi-that": {"voices": {"SPK_01": ("vi+m3", 45, 180, 0), "SPK_02": ("vi+f2", 58, 180, -3), "SPK_03": ("vi+m1", 35, 185, -5), "SPK_04": ("vi+f1", 65, 180, -4), "SPK_05": ("vi+m2", 50, 180, -6)}, "lang_voice": {}},
}
ESPEAK_FALLBACK = ("vi", 50, 155, 0)

def synth_segment(cfg, s, engine):
    """Đọc MỘT đoạn (trả PCM float32, chưa nhân gain ở tầng này cho engine tự nhiên)."""
    text = s["text"]; lang = s.get("lang", "vi"); spk = s["speaker_id"]
    if engine == "espeak":
        voice, pitch, speed, gain = ESPEAK_SETS[cfg["name"]]["voices"].get(spk, ESPEAK_FALLBACK)
        if lang != voice.split("+")[0]:
            voice = ESPEAK_SETS[cfg["name"]].get("lang_voice", {}).get(lang, lang + "+" + voice.split("+")[1])
        return tts_espeak(text, voice, pitch, speed) * db(gain), gain, {"engine": "espeak", "voice": voice}
    v = NAT_VOICES[cfg["name"]][spk]
    eng = "edge"
    if engine == "fpt" and spk in SWAP.get(cfg["name"], []):
        eng = "fpt"
    if engine == "elevenlabs" and spk in EL_SWAP.get(cfg["name"], []):
        eng = "elevenlabs"
    if eng == "fpt":
        pcm = with_retry(lambda: fpt_synth(text, FPT_VOICES[spk]), f"bộ đọc FPT đoạn {s['id']}")
        return pcm * db(v["gain_db"]), v["gain_db"], {"engine": "fpt", "voice": FPT_VOICES[spk], "pitch": "mặc định", "rate": "mặc định"}
    if eng == "elevenlabs":
        if cfg["name"] == "05-vi-en-pha-le":
            vid = EL_VOICE_05[spk]
        else:
            vid = EL_VOICE_SPK3 if spk == "SPK_03" else EL_VOICE_CHI_HANG
        pcm = with_retry(lambda: el_synth(text, vid), f"bộ đọc ElevenLabs đoạn {s['id']}")
        return pcm * db(v["gain_db"]), v["gain_db"], {"engine": "elevenlabs", "voice": vid, "pitch": "mặc định", "rate": "mặc định"}
    pcm = with_retry(lambda: edge_synth(text, v["voice"], v["rate"], v["pitch"]), f"edge-tts đoạn {s['id']}")
    pcm = trim_silence(pcm)
    r = float(np.sqrt(np.mean(pcm ** 2))) + 1e-9
    pcm = pcm * (TARGET_RMS / r) * db(v["gain_db"])
    return pcm, v["gain_db"], {"engine": "edge", "voice": v["voice"], "pitch": v["pitch"], "rate": v["rate"]}

def build(cfg, rng, engine):
    d = json.load(open(os.path.join(ROOT, cfg["fixture"])))
    segs = d.get("transcript") or d["detail"].get("transcript")
    parts, truth, cur = [], [], 0.8
    parts.append(np.zeros(int(0.8 * SR), np.float32))
    prev = None
    # khoảng nghỉ theo từng bộ (mặc định như bộ B0): đổi người, cùng người,
    # xác suất và độ dài "nghĩ lâu". Bộ mẫu dài (06, 10) nghỉ ngắn hơn để nhẹ.
    gap_change = cfg.get("gap_change", (0.4, 1.2))
    gap_same = cfg.get("gap_same", (0.2, 0.6))
    long_gap_p = cfg.get("long_gap_p", 0.12)
    long_gap = cfg.get("long_gap", (3.0, 6.0))
    for i, s in enumerate(segs, 1):
        a, gain, voice_used = synth_segment(cfg, s, engine)
        if i % 10 == 0 or i == len(segs):
            print(f"  {cfg['name']}: {i}/{len(segs)} đoạn", flush=True)
        if len(a) == 0:
            print(f"DỪNG: đoạn {s['id']} đọc ra file rỗng.", file=sys.stderr)
            raise SystemExit(1)
        # khoảng nghỉ: đổi người 0,4 đến 1,2 giây; cùng người 0,2 đến 0,6; thỉnh thoảng nghĩ lâu 3 đến 6 giây
        gap = rng.uniform(*gap_change) if s["speaker_id"] != prev else rng.uniform(*gap_same)
        if rng.random() < long_gap_p:
            gap = rng.uniform(*long_gap)
        parts.append(np.zeros(int(gap * SR), np.float32)); cur += gap
        start = cur
        parts.append(a); cur += len(a) / SR
        truth.append({"id": s["id"], "speaker_id": s["speaker_id"], "lang": s.get("lang", "vi"), "start_sec": round(start, 2),
                      "end_sec": round(cur, 2), "text": s["text"], "fixture_start_sec": s["start_sec"], "gain_db": gain,
                      "voice": voice_used})
        prev = s["speaker_id"]
    parts.append(np.zeros(int(1.0 * SR), np.float32))
    x = np.concatenate(parts)
    x = x + room(len(x), cfg["room"], rng).astype(np.float32)
    x = x / max(1.0, np.abs(x).max() / 0.95)
    return x, truth, d

def write(cfg, x, truth, d, engine):
    wav = os.path.join("/tmp", cfg["name"] + ".wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    base = os.path.join(OUT, cfg["name"])
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-ac", "1", "-c:a", "libopus", "-b:a", "32k", base + ".ogg"], check=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-ac", "1", "-c:a", "aac", "-b:a", "48k", base + ".m4a"], check=True)
    det = d.get("detail", d)
    voices_out = {}
    if engine == "espeak":
        ev = ESPEAK_SETS[cfg["name"]]["voices"]
        voices_out = {k: {"voice": v[0], "pitch": v[1], "speed_wpm": v[2], "gain_db": v[3], "engine": "espeak"} for k, v in ev.items()}
    else:
        voices_out = {k: dict(v, engine="fpt" if (engine == "fpt" and k in SWAP.get(cfg["name"], [])) else
                              "elevenlabs" if (engine == "elevenlabs" and k in EL_SWAP.get(cfg["name"], [])) else "edge")
                      for k, v in NAT_VOICES[cfg["name"]].items()}
    json.dump({
        "audio": cfg["name"], "from_fixture": cfg["fixture"], "session_id": det.get("id"),
        "engine": engine, "duration_sec": round(len(x) / SR, 2), "room": cfg["room"], "note": cfg["note"],
        "voices": voices_out,
        "segments": truth,
    }, open(base + ".truth.json", "w"), ensure_ascii=False, indent=2)
    os.remove(wav)

def long_file(rng):
    """File dài 62 phút (ghép lặp 3 bộ, có đoạn im lặng dài) để thử ghi, tải lên, phát buổi dài."""
    chunks = []
    for name in ["01-bds-gap-chi-lan", "02-hop-doi-tac-han", "03-bac-si-kham"]:
        # C1-07: bản .ogg đã bỏ khỏi repo (docs/13 mục 6) — đọc bản .m4a nguồn
        # (sinh đủ cũng tạo cả .ogg và .m4a nên .m4a luôn có; thiếu thì thử .ogg)
        src = os.path.join(OUT, name + ".m4a")
        if not os.path.exists(src):
            src = os.path.join(OUT, name + ".ogg")
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                             capture_output=True, check=True).stdout
        chunks.append(np.frombuffer(pcm, np.int16))
    out, total = [], 0
    target = 62 * 60 * SR
    i = 0
    while total < target:
        c = chunks[i % 3]; out.append(c); total += len(c)
        sil = np.zeros(int(rng.uniform(20, 90) * SR), np.int16)   # nghỉ giải lao, im lặng dài
        out.append(sil); total += len(sil); i += 1
    x = np.concatenate(out)[:target]
    wav = "/tmp/04-dai-62-phut.wav"
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(x.tobytes())
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-c:a", "libopus", "-b:a", "24k", os.path.join(OUT, "04-dai-62-phut.ogg")], check=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-c:a", "aac", "-b:a", "32k", os.path.join(OUT, "04-dai-62-phut.m4a")], check=True)
    os.remove(wav)

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Sinh bộ âm thanh thử chặng B0")
    ap.add_argument("--engine", choices=["edge", "espeak", "fpt", "elevenlabs"], default="edge",
                    help="bộ đọc: edge (mặc định, tự nhiên, cần mạng), espeak (dự phòng offline), "
                         "fpt/elevenlabs (đổi Người nói 3 và Chị Hằng khi có khóa trong biến môi trường)")
    ap.add_argument("--only", help="chỉ sinh một bộ, ví dụ 03-bac-si-kham")
    ap.add_argument("--skip-long", action="store_true", help="không sinh file dài 62 phút")
    args = ap.parse_args()

    if args.engine == "espeak":
        import espeakng_loader  # noqa: F401 — cài bằng: pip install espeakng-loader numpy
        espeak_init()
    if args.engine == "fpt" and not FPT_TTS_KEY:
        print("DỪNG: --engine fpt cần khóa trong biến môi trường FPT_TTS_KEY.", file=sys.stderr)
        raise SystemExit(1)
    if args.engine == "elevenlabs" and not EL_TTS_KEY:
        print("DỪNG: --engine elevenlabs cần khóa trong biến môi trường ELEVENLABS_API_KEY.", file=sys.stderr)
        raise SystemExit(1)

    os.makedirs(OUT, exist_ok=True)
    rng = np.random.default_rng(20261117)
    random.seed(20261117)
    for cfg in SETS:
        if args.only and cfg["name"] != args.only:
            continue
        t0 = time.time()
        x, truth, d = build(cfg, rng, args.engine)
        write(cfg, x, truth, d, args.engine)
        print(cfg["name"], f"{len(x)/SR/60:.1f} phút", len(truth), "đoạn", f"({time.time() - t0:.0f}s)", "engine:", args.engine)
    if not args.skip_long:
        long_file(rng)
        print("04-dai-62-phut xong (không commit, xem .gitignore)")
