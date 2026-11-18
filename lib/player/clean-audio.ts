"use client";

/*
 * Bộ lọc Nghe sạch qua Web Audio cho trình phát thật (M9-01, issue #65,
 * đặc tả docs/09-nghe-sach.md): nối MediaElementSource của thẻ audio vào
 * một chuỗi xử lý rồi mới ra loa.
 *
 *   nguồn -> lọc cắt dưới 100 Hz -> lọc cắt trên 7 kHz -> nén nhẹ -> GainNode -> loa
 *
 * - Cân âm lượng người nói: GainNode đổi theo người nói của đoạn đang phát
 *   (mức từ ListeningMap.speaker_gain_db), chuyển mượt 80 ms
 *   (setTargetAtTime, hằng số thời gian 0,08 s) để không "nhảy" âm lượng.
 * - Lọc tiếng ồn: BẤT là bản tạm (cắt dải + nén nhẹ); bản thật dùng RNNoise
 *   chạy trong AudioWorklet — ghi rõ ở 07-handover.md mục 9.
 * - Tắt Nghe sạch thì ĐI THẲNG: các bộ lọc đưa về thông qua toàn dải, nén về
 *   mức 0, GainNode về 1 — đồ thị vẫn nối (MediaElementSource không gỡ ra
 *   được sau khi tạo) nhưng không xử lý gì, không giật khi bật tắt.
 * - AudioContext dựng muộn cùng thẻ audio (chạm Phát lần đầu) và resume ngay
 *   trong cử chỉ bấm — iPhone chặn tự phát và chặn AudioContext chưa resume.
 */

const RAMP_SEC = 0.08; // chuyển mượt 80 ms

export class CleanAudioChain {
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private highpass: BiquadFilterNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private gain: GainNode | null = null;
  private el: HTMLAudioElement | null = null;

  // Cài đặt chờ áp (đặt trước khi thẻ audio tồn tại cũng giữ được)
  private cleanOn = false;
  private denoiseOn = true;
  private levelOn = true;
  private speakerDb: number | null = null;

  /**
   * Ghi nhận thẻ audio. Chỉ dựng đồ thị Web Audio khi Nghe sạch được bật lần đầu
   * (review PR #67): một khi đã createMediaElementSource thì tiếng chỉ ra qua
   * AudioContext, mà iPhone tạm dừng AudioContext khi khóa màn hình hoặc chuyển
   * app. Người không bật Nghe sạch vẫn nghe bình thường khi khóa màn hình.
   */
  bind(el: HTMLAudioElement) {
    if (this.el === el) return;
    this.unbind();
    this.el = el;
    if (this.cleanOn) this.ensureGraph();
  }

  private ensureGraph() {
    const el = this.el;
    if (!el || this.ctx || typeof AudioContext === "undefined") return; // trình duyệt cũ: phát thẳng
    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaElementSource(el);
    this.highpass = this.ctx.createBiquadFilter();
    this.highpass.type = "highpass";
    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.compressor = this.ctx.createDynamicsCompressor();
    this.gain = this.ctx.createGain();
    this.source.connect(this.highpass);
    this.highpass.connect(this.lowpass);
    this.lowpass.connect(this.compressor);
    this.compressor.connect(this.gain);
    this.gain.connect(this.ctx.destination);
    if (!el.paused) void this.ctx.resume().catch(() => undefined);
    this.apply();
  }

  /** Gọi trong cử chỉ bấm Phát: AudioContext chỉ chạy được sau cử chỉ trên iPhone. */
  resume() {
    void this.ctx?.resume().catch(() => undefined);
  }

  setClean(on: boolean) {
    this.cleanOn = on;
    if (on) this.ensureGraph();
    this.apply();
  }

  setDenoise(on: boolean) {
    this.denoiseOn = on;
    this.apply();
  }

  setLevel(on: boolean) {
    this.levelOn = on;
    this.apply();
  }

  /** Mức cân âm lượng (dB) của người nói đang phát; null là ngoài lượt nói hoặc không cân. */
  setSpeakerGainDb(db: number | null) {
    this.speakerDb = db;
    this.apply();
  }

  destroy() {
    this.unbind();
  }

  private unbind() {
    this.source?.disconnect();
    this.highpass?.disconnect();
    this.lowpass?.disconnect();
    this.compressor?.disconnect();
    this.gain?.disconnect();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.source = null;
    this.highpass = null;
    this.lowpass = null;
    this.compressor = null;
    this.gain = null;
    this.el = null;
  }

  /** Áp cài đặt hiện tại lên đồ thị, mọi thay đổi chuyển mượt để không giật. */
  private apply() {
    const ctx = this.ctx;
    if (!ctx || !this.highpass || !this.lowpass || !this.compressor || !this.gain) return;
    const now = ctx.currentTime;
    const ramp = (param: AudioParam, value: number) => param.setTargetAtTime(value, now, RAMP_SEC);

    // Lọc tạm (bản tạm; bản thật RNNoise — xem 07-handover.md mục 9):
    // cắt dưới 100 Hz (gầm, rung bàn), cắt trên 7 kHz (tít máy), nén nhẹ
    const denoiseActive = this.cleanOn && this.denoiseOn;
    const nyquist = ctx.sampleRate / 2;
    ramp(this.highpass.frequency, denoiseActive ? 100 : 20);
    this.highpass.Q.value = 0.7;
    ramp(this.lowpass.frequency, denoiseActive ? 7000 : Math.min(20000, nyquist - 1));
    this.lowpass.Q.value = 0.7;
    // Nén nhẹ: ngưỡng -24 dB, tỉ lệ 2:1 — ghim chỗ quá to, không đổi chất giọng
    ramp(this.compressor.threshold, denoiseActive ? -24 : 0);
    this.compressor.knee.value = denoiseActive ? 12 : 0;
    this.compressor.ratio.value = denoiseActive ? 2 : 1;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.25;

    // Cân âm lượng: người nói nhỏ được tăng, người nói to được giảm
    const db = this.cleanOn && this.levelOn ? this.speakerDb : null;
    ramp(this.gain.gain, db === null ? 1 : 10 ** (db / 20));
  }
}
