import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaceMesh } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ema = (prev, next, alpha) => (prev == null ? next : prev + alpha * (next - prev));

/**
 * MediaPipe FaceMesh landmark indices (standard):
 * mouth corners: 61 (left), 291 (right)
 * inner lips: 13 (upper), 14 (lower)
 * eye outer-ish: 33, 263 (used for scale normalization)
 */
const IDX = { mouthL: 61, mouthR: 291, lipU: 13, lipD: 14, eyeL: 33, eyeR: 263 };

function drawFlower(ctx, x, y, radius, rot, hue, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;

  // Single cherry blossom petal (soft heart/teardrop shape)
  ctx.beginPath();
  ctx.moveTo(0, -radius * 1.1); // top point
  ctx.quadraticCurveTo(
    radius * 0.9,
    -radius * 0.2,
    radius * 0.2,
    radius * 0.8
  );
  ctx.quadraticCurveTo(0, radius, -radius * 0.2, radius * 0.8);
  ctx.quadraticCurveTo(-radius * 0.9, -radius * 0.2, 0, -radius * 1.1);
  ctx.closePath();

  // Soft sakura pink with a bit of variation
  ctx.fillStyle = `hsla(${hue}, 85%, 78%, ${alpha})`;
  ctx.fill();

  ctx.restore();
}

export default function FlowerBooth() {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);

  const cameraRef = useRef(null);
  const faceMeshRef = useRef(null);

  // particles live in a ref so we can update without re-rendering
  const particlesRef = useRef([]);
  const rafRef = useRef(null);
  const lastTRef = useRef(performance.now());

  // blow detection state (refs to avoid rerenders every frame)
  const wSmoothRef = useRef(null);
  const hSmoothRef = useRef(null);
  const baselineWRef = useRef(null);
  const baselineHRef = useRef(null);

  const calibratingRef = useRef(true);
  const calFramesRef = useRef(0);
  const calSumWRef = useRef(0);
  const calSumHRef = useRef(0);

  const blowHoldRef = useRef(0);
  const cooldownRef = useRef(0);

  const [status, setStatus] = useState("✨ Click “Start Camera” to wake the petals");
  const [blowReadout, setBlowReadout] = useState("petal breeze: —");
  const [started, setStarted] = useState(false);
  const [sensitivity, setSensitivity] = useState(55);

  const sensitivityToScale = useMemo(() => {
    // 0..100 => 0.65..0.9 (lower means stricter)
    const s = sensitivity / 100;
    return 0.65 + (1 - s) * 0.25;
  }, [sensitivity]);

  function resizeCanvasToDisplaySize() {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width * dpr);
    const h = Math.floor(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function beginCalibration() {
    calibratingRef.current = true;
    calFramesRef.current = 0;
    calSumWRef.current = 0;
    calSumHRef.current = 0;
    baselineWRef.current = null;
    baselineHRef.current = null;
    setStatus("🌸 Calibrating… hold a soft, relaxed face");
  }

  function spawnFlowers(px, py, intensity = 1) {
    const particles = particlesRef.current;
    const count = Math.floor(6 + 18 * intensity);
    for (let i = 0; i < count; i++) {
      // Petals drift in all directions from your lips like a little explosion.
      const angle = Math.random() * Math.PI * 2;
      const speed = 350 + Math.random() * 420;
      particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 160,
        vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 120,
        r: 8 + Math.random() * 10,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 6,
        life: 1.2,
        hue: 330 + Math.random() * 20, // soft sakura pink
      });
    }
  }

  function particleLoop() {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const now = performance.now();
    const dt = (now - lastTRef.current) / 1000;
    lastTRef.current = now;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const particles = particlesRef.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 680 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;

      p.life -= dt * 0.85;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      const a = clamp(p.life, 0, 1);
      drawFlower(ctx, p.x, p.y, p.r, p.rot, p.hue, a);
    }

    rafRef.current = requestAnimationFrame(particleLoop);
  }

  async function startCamera() {
    if (started) return;
    setStarted(true);
    setStatus("⏳ Gathering tiny petal sprites…");

    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!video || !canvas) return;

    resizeCanvasToDisplaySize();

    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    faceMesh.onResults((results) => {
      const faces = results.multiFaceLandmarks;
      if (!faces || faces.length === 0) {
        setBlowReadout("petal breeze: — (no face found)");
        return;
      }

      const lm = faces[0];

      const mouthL = lm[IDX.mouthL];
      const mouthR = lm[IDX.mouthR];
      const lipU = lm[IDX.lipU];
      const lipD = lm[IDX.lipD];
      const eyeL = lm[IDX.eyeL];
      const eyeR = lm[IDX.eyeR];

      const S = dist(eyeL, eyeR) || 1e-6;
      const W = dist(mouthL, mouthR);
      const H = dist(lipU, lipD);

      const w = W / S;
      const h = H / S;

      wSmoothRef.current = ema(wSmoothRef.current, w, 0.35);
      hSmoothRef.current = ema(hSmoothRef.current, h, 0.35);

      // calibration: ~45 frames
      if (calibratingRef.current) {
        calFramesRef.current += 1;
        calSumWRef.current += wSmoothRef.current;
        calSumHRef.current += hSmoothRef.current;

        if (calFramesRef.current >= 45) {
          baselineWRef.current = calSumWRef.current / calFramesRef.current;
          baselineHRef.current = calSumHRef.current / calFramesRef.current;
          calibratingRef.current = false;
          setStatus("Ready ✨ blow a wish to scatter petals");
        } else {
          setStatus(`Calibrating… ${calFramesRef.current}/45`);
        }
        setBlowReadout(`petal calibration… ${calFramesRef.current}/45`);
        return;
      }

      const baselineW = baselineWRef.current || wSmoothRef.current;
      const baselineH = baselineHRef.current || hSmoothRef.current;

      // Normalized scores (1.0 ~= relaxed baseline mouth)
      const scoreW = wSmoothRef.current / baselineW;
      const scoreH = hSmoothRef.current / baselineH;

      // For your \"blow\" pose, both width and height shrink (pursed lips / kiss).
      // Treat a blow as a noticeably tighter mouth in both dimensions.
      const pursed = scoreW < 0.96 && scoreH < 0.85;

      if (cooldownRef.current > 0) cooldownRef.current -= 1;

      if (pursed) blowHoldRef.current += 1;
      else blowHoldRef.current = 0;

      // Require fewer consecutive frames so it reacts faster
      const isBlowing = blowHoldRef.current >= 4 && cooldownRef.current === 0;

      // mouth center in normalized coords
      const cxN = (mouthL.x + mouthR.x + lipU.x + lipD.x) / 4;
      const cyN = (mouthL.y + mouthR.y + lipU.y + lipD.y) / 4;

      // Convert to canvas pixels.
      // We visually mirror the video & canvas via CSS transform, so we mirror x here too:
      const px = (1 - cxN) * canvas.width;
      const py = cyN * canvas.height;

      setBlowReadout(
        `petal breeze: ${isBlowing ? "YES 🌬️" : pursed ? "…almost" : "not yet"} | w:${scoreW.toFixed(
          2
        )} h:${scoreH.toFixed(2)}`
      );

      if (isBlowing) {
        const intensity = clamp((1 - scoreW) / 0.25, 0, 1);
        spawnFlowers(px, py, intensity);
        cooldownRef.current = 6;
        blowHoldRef.current = 0;
      }
    });

    faceMeshRef.current = faceMesh;

    // MediaPipe Camera helper
    const camera = new Camera(video, {
      onFrame: async () => {
        // keep canvas in sync with layout size
        resizeCanvasToDisplaySize();
        await faceMesh.send({ image: video });
      },
      width: 1280,
      height: 720,
    });

    cameraRef.current = camera;

    try {
      beginCalibration();
      await camera.start();
      setStatus("Ready ✅ (blow to spawn flowers)");
      // Start particles loop
      lastTRef.current = performance.now();
      rafRef.current = requestAnimationFrame(particleLoop);
    } catch (e) {
      console.error(e);
      setStatus("Couldn’t start camera (check permissions) 🌙");
      setStarted(false);
    }
  }

  function takePhoto() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;

    const rect = overlay.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const out = document.createElement("canvas");
    out.width = Math.floor(rect.width * dpr);
    out.height = Math.floor(rect.height * dpr);

    const octx = out.getContext("2d");
    if (!octx) return;

    // Draw mirrored video to match what user sees
    octx.save();
    octx.scale(-1, 1);
    octx.drawImage(video, -out.width, 0, out.width, out.height);
    octx.restore();

    // Draw overlay as-is (we already mirrored x coords when placing particles)
    octx.drawImage(overlay, 0, 0);

    const a = document.createElement("a");
    a.download = `flowerbooth-${new Date().toISOString().replaceAll(":", "-")}.png`;
    a.href = out.toDataURL("image/png");
    a.click();
  }

  useEffect(() => {
    const onResize = () => resizeCanvasToDisplaySize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    return () => {
      // cleanup on unmount
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (cameraRef.current) {
        // Camera helper doesn’t expose a universal stop() in older builds, but try:
        try {
          cameraRef.current.stop();
        } catch (err) {
          console.error(err);
        }
      }
      if (faceMeshRef.current) {
        try {
          faceMeshRef.current.close();
        } catch (err) {
          console.error(err);
        }
      }
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        color: "#3c2330",
        display: "grid",
        placeItems: "center",
        padding: 16,
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      }}
    >
      <div
        style={{
          width: "min(1100px, 94vw)",
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 18, opacity: 0.95 }}>🌸 FlowerBooth</div>
            <div style={pillStyle}>Blow a wish → petals</div>
          </div>
          <div style={pillStyle}>{status}</div>
        </div>

        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: 24,
            overflow: "hidden",
            background:
              "linear-gradient(135deg, rgba(255, 245, 250, 0.98), rgba(255, 224, 239, 0.96))",
            border: "1px solid rgba(255,182,211,0.6)",
            boxShadow: "0 24px 60px rgba(255, 182, 211, 0.45)",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scaleX(-1)",
            }}
          />
          <canvas
            ref={overlayRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              transform: "scaleX(-1)",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={btnStyle} onClick={startCamera} disabled={started}>
              Start Camera
            </button>
            <button style={btnStyle} onClick={takePhoto} disabled={!started || status.startsWith("Calibrating")}>
              Take Photo
            </button>
            <button style={btnStyle} onClick={beginCalibration} disabled={!started}>
              Recalibrate
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={pillStyle}>
              Sensitivity{" "}
              <input
                type="range"
                min="0"
                max="100"
                value={sensitivity}
                onChange={(e) => setSensitivity(Number(e.target.value))}
                style={{
                  verticalAlign: "middle",
                  width: 180,
                  marginLeft: 10,
                  accentColor: "#ffb6d3",
                }}
              />
            </div>
            <div style={pillStyle}>{blowReadout}</div>
          </div>
        </div>

        <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.35 }}>
          Tip: soften your face, then blow a tiny birthday-candle wish for a moment to send petals drifting.
        </div>
      </div>
    </div>
  );
}

const pillStyle = {
  fontSize: 12,
  padding: "6px 10px",
  border: "1px solid rgba(255,182,211,0.7)",
  borderRadius: 999,
  opacity: 0.9,
  background: "rgba(255, 255, 255, 0.8)",
};

const btnStyle = {
  appearance: "none",
  border: "1px solid rgba(255,182,211,0.85)",
  background:
    "linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 224, 239, 0.95))",
  color: "#3c2330",
  padding: "10px 14px",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 700,
};

