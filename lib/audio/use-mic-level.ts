"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Đọc âm lượng micro (0 đến 1) để vẽ dải giọng sống.
 * Chỉ đo âm lượng: không ghi, không lưu, không gửi đi đâu.
 * status: "idle" | "asking" | "on" | "denied" | "unsupported"
 * onEnded: micro bị nơi khác chiếm hoặc ngắt đột ngột (sự kiện ended của track).
 */

export type MicStatus = "idle" | "asking" | "on" | "denied" | "unsupported";

export function useMicLevel(opts?: { onEnded?: () => void }) {
  const [status, setStatus] = useState<MicStatus>("idle");
  const [level, setLevel] = useState(0);
  const cleanup = useRef<() => void>(() => {});
  const onEndedRef = useRef(opts?.onEnded);

  useEffect(() => {
    onEndedRef.current = opts?.onEnded;
  }, [opts?.onEnded]);

  const stop = useCallback(() => {
    cleanup.current();
    cleanup.current = () => {};
    setLevel(0);
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }
    setStatus("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      let raf = 0;
      let smooth = 0;
      const loop = () => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        // Đổi sang thang dễ nhìn: tiếng nói thường ở 0,02 đến 0,2
        const target = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-6) + 55) / 45));
        smooth += (target - smooth) * 0.3;
        setLevel(smooth);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      stream.getTracks().forEach((t) =>
        t.addEventListener("ended", () => onEndedRef.current?.()),
      );
      cleanup.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      };
      setStatus("on");
    } catch {
      setStatus("denied");
    }
  }, []);

  useEffect(() => () => cleanup.current(), []);

  return { status, level, start, stop };
}
