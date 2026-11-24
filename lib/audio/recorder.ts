"use client";

/*
 * Bộ thu tiếng thật trên màn ghi âm (C1-04 yêu cầu 2a, docs/12 §0.2 yêu cầu
 * bổ sung 2): MediaRecorder bọc quanh stream micro mà useMicLevel đã mở.
 *
 * - iOS Safari chỉ nhận "audio/mp4"; Chrome/Android/Firefox nhận
 *   "audio/webm" (Opus) — chọn bằng isTypeSupported, ưu tiên mp4 trước.
 * - Mỗi đoạn 5 giây đẩy ngay vào IndexedDB (lib/audio/chunk-store.ts) nên
 *   tải lỗi hay đóng tab giữa chừng đều không mất phần đã ghi.
 * - Tạm dừng ghi thì tạm dừng recorder để độ dài băng khớp đồng hồ ghi.
 * - Kết thúc ghép các đoạn thành một Blob để presign + PUT thẳng lên R2.
 *   Trên máy không có MediaRecorder (trình duyệt cũ): trả null, buổi ghi
 *   vẫn là "Bản ghi thử" như trước PR này.
 */

const CANDIDATE_MIMES = [
  "audio/mp4", // iOS Safari
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
] as const;

const CHUNK_TIMESLICE_MS = 5000;

/** Loại file trước dấu chấm phẩy — danh sách cho phép của máy chủ nhận dạng
 * theo loại gốc (audio/mp4, audio/webm, …). */
export function baseContentType(mime: string): string {
  return mime.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function pickRecorderMime(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  for (const mime of CANDIDATE_MIMES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // trình duyệt không có isTypeSupported: bỏ qua mime này
    }
  }
  return null;
}

export type AssembledAudio = { blob: Blob; mime: string } | null;

export class MeetingRecorder {
  private recorder: MediaRecorder | null = null;
  private mime: string | null = null;
  /** Các lần ghi đoạn vào IndexedDB chưa chốt xong — stop() chờ hết để
   * clearLive() ngay sau đó không xóa mất đoạn cuối. */
  private pendingWrites = new Set<Promise<void>>();

  /** Đang có buổi ghi thu được không (đã start và chưa stop). */
  get active(): boolean {
    return this.recorder !== null;
  }

  start(stream: MediaStream | null): void {
    if (!stream) return;
    // Đã đang thu stream này thì không dựng recorder đè lên (mỗi lần mic
    // mở lại chỉ nối tiếp phần đã có). */
    if (this.recorder && this.recorder.state !== "inactive") return;
    const mime = pickRecorderMime();
    if (!mime) return; // không thu được: buổi ghi vẫn chạy như Bản ghi thử
    try {
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;
        const write = import("./chunk-store")
          .then((m) => m.appendLiveChunk(event.data, mime))
          .catch(() => undefined)
          .finally(() => this.pendingWrites.delete(write));
        this.pendingWrites.add(write);
      };
      // Đoạn cuối cũng được đẩy khi stop() — không cần requestData thủ công.
      recorder.start(CHUNK_TIMESLICE_MS);
      this.recorder = recorder;
      this.mime = mime;
    } catch {
      // Không dựng được recorder (mime bị từ chối lúc chạy thật): cứ ghi như cũ
      this.recorder = null;
      this.mime = null;
    }
  }

  pause(): void {
    if (this.recorder?.state === "recording") this.recorder.pause();
  }

  resume(): void {
    if (this.recorder?.state === "paused") this.recorder.resume();
  }

  /** Dừng thu và ghép toàn bộ đoạn đã có trong IndexedDB thành một Blob.
   * Gọi lần nữa sau khi đã dừng thì đọc lại phần đã ghi (băng giữ nguyên
   * để buổi tạo sau vẫn có băng). */
  async stop(): Promise<AssembledAudio> {
    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        try {
          recorder.stop();
        } catch {
          resolve();
        }
      });
      this.recorder = null;
    }
    // Chờ mọi đoạn đã đẩy vào IndexedDB chốt xong rồi mới ghép.
    await Promise.all([...this.pendingWrites]);
    const { readEntry, blobFromEntry } = await import("./chunk-store");
    const entry = await readEntry("live");
    if (!entry || entry.chunks.length === 0) return null;
    return { blob: await blobFromEntry(entry), mime: entry.mime || this.mime || "audio/webm" };
  }

  /** Bỏ phần đã thu (người dùng hủy buổi ghi) — băng live bị xóa sạch. */
  async discard(): Promise<void> {
    const { clearLive } = await import("./chunk-store");
    await this.stop(); // chờ đoạn cuối ghi xong rồi mới xóa, không đứt giữa chừng
    await clearLive();
    this.mime = null;
  }
}
