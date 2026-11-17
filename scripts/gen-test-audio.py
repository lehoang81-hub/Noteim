#!/usr/bin/env python3
"""
Sinh bộ âm thanh thử cho chặng B0 (Noteim) từ lời của buổi ghi mẫu.

- Giọng đọc máy espeak-ng (gói PyPI `espeakng-loader`, chạy offline). Giọng nghe ra máy,
  KHÔNG dùng để đánh giá chất lượng AI nhận dạng giọng người; dùng để thử đường ống:
  tải lên, phát, bản đồ nghe, đối chiếu chữ, ghi âm dài.
- Mỗi người nói một giọng, cao độ, tốc độ, âm lượng riêng; có khoảng lặng ngắn và dài
  ("suy nghĩ lâu"), tiếng nền theo từng phòng.
- Xuất: <tên>.ogg (Opus 32 kbps), <tên>.m4a (AAC, cho iPhone), <tên>.truth.json
  (đáp án: từng đoạn, người nói, ngôn ngữ, chữ Nguyên văn, mốc thời gian trong file).

Cách chạy:  pip install espeakng-loader numpy  &&  python3 scripts/gen-test-audio.py
"""
import ctypes, json, os, random, subprocess, wave
import numpy as np
import espeakng_loader as E

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "test-data", "audio")
SR = 22050

lib = ctypes.cdll.LoadLibrary(E.get_library_path())
assert lib.espeak_Initialize(2, 0, E.get_data_path().encode(), 0) == SR
_buf = []
CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
def _cb(wav, n, ev):
    if n > 0:
        _buf.append(ctypes.string_at(wav, n * 2))
    return 0
_ccb = CB(_cb)
lib.espeak_SetSynthCallback(_ccb)

def tts(text, voice, pitch, speed):
    _buf.clear()
    lib.espeak_SetVoiceByName(voice.encode())
    lib.espeak_SetParameter(1, speed, 0)   # tốc độ, từ/phút
    lib.espeak_SetParameter(3, pitch, 0)   # cao độ 0..100
    t = text.encode("utf-8")
    lib.espeak_Synth(t, len(t) + 1, 0, 0, 0, 0x10, None, None)
    lib.espeak_Synchronize()
    return np.frombuffer(b"".join(_buf), dtype=np.int16).astype(np.float32) / 32768.0

def db(x):
    return 10 ** (x / 20)

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

# Mỗi bộ: file mẫu, phòng, giọng theo người nói (voice, pitch, speed, gain_db)
SETS = [
    {
        "name": "01-bds-gap-chi-lan", "fixture": "fixtures/sessions/bds-gap-chi-lan.json", "room": "van-phong",
        "voices": {"SPK_01": ("vi+m3", 45, 165, 0), "SPK_02": ("vi+f2", 62, 150, -9), "SPK_03": ("vi+m1", 35, 155, -3)},
        "note": "Văn phòng yên. Chị Lan nói nhỏ hơn 9 dB để thử Cân âm lượng.",
    },
    {
        "name": "02-hop-doi-tac-han", "fixture": "fixtures/sessions/hop-doi-tac-han.json", "room": "phong-hop-may",
        "voices": {"SPK_01": ("vi+m3", 45, 165, 0), "SPK_02": ("ko+m2", 40, 160, 2), "SPK_03": ("ko+f3", 65, 170, -4), "SPK_04": ("vi+f1", 58, 155, -6)},
        "lang_voice": {"en": "en+m3"},
        "note": "Nói lẫn Việt, Hàn, Anh. Phòng họp cạnh xưởng, có điều hòa và tiếng máy.",
    },
    {
        "name": "03-bac-si-kham", "fixture": "fixtures/samples/doctor.json", "room": "phong-kham",
        "voices": {"SPK_01": ("vi+m2", 42, 170, 0), "SPK_02": ("vi+f4", 60, 140, -7)},
        "note": "Phòng khám ồn. Bệnh nhân nói chậm, nhỏ.",
    },
]

def build(cfg, rng):
    d = json.load(open(os.path.join(ROOT, cfg["fixture"])))
    segs = d.get("transcript") or d["detail"].get("transcript")
    parts, truth, cur = [], [], 0.8
    parts.append(np.zeros(int(0.8 * SR), np.float32))
    prev = None
    for s in segs:
        voice, pitch, speed, gain = cfg["voices"].get(s["speaker_id"], ("vi", 50, 155, 0))
        lang = s.get("lang", "vi")
        if lang != voice.split("+")[0]:
            voice = cfg.get("lang_voice", {}).get(lang, lang + "+" + voice.split("+")[1])
        a = tts(s["text"], voice, pitch, speed) * db(gain)
        # khoảng nghỉ: đổi người 0,4 đến 1,2 giây; cùng người 0,2 đến 0,6; thỉnh thoảng nghĩ lâu 3 đến 6 giây
        gap = rng.uniform(0.4, 1.2) if s["speaker_id"] != prev else rng.uniform(0.2, 0.6)
        if rng.random() < 0.12:
            gap = rng.uniform(3.0, 6.0)
        parts.append(np.zeros(int(gap * SR), np.float32)); cur += gap
        start = cur
        parts.append(a); cur += len(a) / SR
        truth.append({"id": s["id"], "speaker_id": s["speaker_id"], "lang": lang, "start_sec": round(start, 2),
                      "end_sec": round(cur, 2), "text": s["text"], "fixture_start_sec": s["start_sec"]})
        prev = s["speaker_id"]
    parts.append(np.zeros(int(1.0 * SR), np.float32))
    x = np.concatenate(parts)
    x = x + room(len(x), cfg["room"], rng).astype(np.float32)
    x = x / max(1.0, np.abs(x).max() / 0.95)
    return x, truth, d

def write(cfg, x, truth, d):
    wav = os.path.join("/tmp", cfg["name"] + ".wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    base = os.path.join(OUT, cfg["name"])
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-ac", "1", "-c:a", "libopus", "-b:a", "32k", base + ".ogg"], check=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-ac", "1", "-c:a", "aac", "-b:a", "48k", base + ".m4a"], check=True)
    det = d.get("detail", d)
    json.dump({
        "audio": cfg["name"], "from_fixture": cfg["fixture"], "session_id": det.get("id"),
        "duration_sec": round(len(x) / SR, 2), "room": cfg["room"], "note": cfg["note"],
        "voices": {k: {"voice": v[0], "pitch": v[1], "speed_wpm": v[2], "gain_db": v[3]} for k, v in cfg["voices"].items()},
        "segments": truth,
    }, open(base + ".truth.json", "w"), ensure_ascii=False, indent=2)
    os.remove(wav)

def long_file(rng):
    """File dài 62 phút (ghép lặp 3 bộ, có đoạn im lặng dài) để thử ghi, tải lên, phát buổi dài."""
    chunks = []
    for name in ["01-bds-gap-chi-lan", "02-hop-doi-tac-han", "03-bac-si-kham"]:
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(OUT, name + ".ogg"), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
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
    os.makedirs(OUT, exist_ok=True)
    rng = np.random.default_rng(20261117)
    random.seed(20261117)
    for cfg in SETS:
        x, truth, d = build(cfg, rng)
        write(cfg, x, truth, d)
        print(cfg["name"], f"{len(x)/SR/60:.1f} phút", len(truth), "đoạn")
    long_file(rng)
    print("04-dai-62-phut xong (không commit, xem .gitignore)")
