"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { assetHref, parseScan } from "@/lib/scan";

export function Scanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [tag, setTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    return () => stopRef.current?.();
  }, []);

  function openScan(raw: string) {
    if (handled.current) return;
    const parsed = parseScan(raw);
    if (!parsed) {
      setError("That scan is not an asset tag.");
      return;
    }
    handled.current = true;
    stopRef.current?.();
    router.push(assetHref(parsed));
  }

  async function startCamera() {
    setError(null);
    const video = videoRef.current;
    if (!video) return;
    try {
      if ("BarcodeDetector" in window) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
        const Detector = (window as unknown as {
          BarcodeDetector: new (options: { formats: string[] }) => {
            detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
          };
        }).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });
        let stopped = false;
        const timer = window.setInterval(() => {
          if (stopped) return;
          void detector.detect(video).then((codes) => {
            const value = codes[0]?.rawValue;
            if (value) openScan(value);
          });
        }, 350);
        stopRef.current = () => {
          stopped = true;
          window.clearInterval(timer);
          stream.getTracks().forEach((track) => track.stop());
          setLive(false);
        };
        setLive(true);
        return;
      }
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (result) openScan(result.getText());
      });
      stopRef.current = () => {
        controls.stop();
        setLive(false);
      };
      setLive(true);
    } catch {
      setError("The camera did not start. You can type the tag instead. On a phone, allow camera access and use HTTPS.");
    }
  }

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-3xl bg-ink">
        <video ref={videoRef} className="aspect-[3/4] w-full object-cover sm:aspect-video" muted playsInline />
      </div>
      <div className="flex flex-wrap gap-2">
        {live ? (
          <Button variant="ghost" onClick={() => stopRef.current?.()}>
            Stop camera
          </Button>
        ) : (
          <Button onClick={() => void startCamera()}>Scan with camera</Button>
        )}
      </div>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          openScan(tag);
        }}
      >
        <Field label="Or type a tag" hint="A USB or Bluetooth scanner can type into this box. Press Enter.">
          <TextInput value={tag} onChange={(event) => setTag(event.target.value)} autoFocus className="font-mono" />
        </Field>
        <Button type="submit" variant="ink">
          Open asset
        </Button>
      </form>
      {error ? <Banner tone="bad">{error}</Banner> : null}
    </div>
  );
}
