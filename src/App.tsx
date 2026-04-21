import React, { useRef, useState, useEffect } from 'react';
import { runOcrInference, initService } from './OcrService';

const App = () => {
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("모델 로딩 중...");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const TARGET_WIDTH = 400;
  const TARGET_HEIGHT = 558;

  useEffect(() => {
    initService().then(() => {
      setStatus("카메라 연결 중...");
      startCamera();
    });
  }, []);

  const startCamera = async () => {
  try {
    const constraints = {
      video: {
        facingMode: 'environment',
        width: { min: 1080, ideal: 2160 }, 
        height: { min: 1920, ideal: 3840 },
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;

      // [갤럭시 핵심 전략 1] 물리적 초점 거리 확보를 위한 줌 강화
      // 1.5배 정도 당기면 카드를 30cm 뒤로 빼도 화면에 꽉 찹니다.
      // 이렇게 멀리 떼어야 갤럭시 렌즈가 초점을 확실히 잡습니다.
      const advancedConstraints: any = {};
      
      if (capabilities.zoom) {
        // 갤럭시 최신 기종일수록 1.5배 이상을 추천합니다.
        advancedConstraints.zoom = 1.5; 
      }

      if (capabilities.focusMode?.includes('continuous')) {
        advancedConstraints.focusMode = 'continuous';
      }

      await track.applyConstraints({ advanced: [advancedConstraints] } as any);

      // [갤럭시 핵심 전략 2] 일정 간격으로 초점을 강제로 다시 잡음 (Focus Kick)
      // 갤럭시 크롬이 초점을 잡다가 멈추는 현상을 방지합니다.
      setInterval(async () => {
        const currentTrack = (videoRef.current?.srcObject as MediaStream)?.getVideoTracks()[0];
        if (currentTrack && capabilities.focusMode?.includes('continuous')) {
          try {
            // 설정을 살짝 바꿨다 다시 돌려서 렌즈를 강제로 움직이게 만듭니다.
            await currentTrack.applyConstraints({ advanced: [{ focusMode: 'manual' }] } as any);
            await currentTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as any);
          } catch (e) {
            // 무시
          }
        }
      }, 3000); // 3초마다 초점 재점검

      videoRef.current.onloadedmetadata = () => {
        requestAnimationFrame(tick);
      };
    }
  } catch (err) {
    console.error(err);
    setStatus("카메라 연결 실패");
  }
};

  const tick = () => {
    if (!videoRef.current || !canvasRef.current || isAnalyzing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (canvas.width !== TARGET_WIDTH) canvas.width = TARGET_WIDTH;
    if (canvas.height !== TARGET_HEIGHT) canvas.height = TARGET_HEIGHT;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    if (videoWidth === 0 || videoHeight === 0) {
      requestAnimationFrame(tick);
      return;
    }

    const videoAspect = videoWidth / videoHeight;
    const targetAspect = TARGET_WIDTH / TARGET_HEIGHT;

    let sx, sy, sWidth, sHeight;
    if (videoAspect > targetAspect) {
      sHeight = videoHeight;
      sWidth = videoHeight * targetAspect;
      sx = (videoWidth - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = videoWidth;
      sHeight = videoWidth / targetAspect;
      sx = 0;
      sy = (videoHeight - sHeight) / 2;
    }

    // 선명도 보정 (약간의 샤프닝 효과)
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
    requestAnimationFrame(tick);
  };

  const handleCapture = async () => {
    if (!canvasRef.current || isAnalyzing) return;
    setIsAnalyzing(true);
    setStatus("분석 중...");
    const results = await runOcrInference(canvasRef.current);

    if (results && results.length > 0) {
      const texts = results.map((item: any) => item.text).join(", ");
      setResult(texts);
      setStatus("분석 완료");
    } else {
      setStatus("인식 실패 (조명이나 초점 확인)");
      setIsAnalyzing(false);
    }
  };

  const resetScanner = () => {
    setResult("");
    setIsAnalyzing(false);
    setStatus("카드를 맞춰주세요.");
    requestAnimationFrame(tick);
  };

  return (
    <div style={{ padding: '10px', textAlign: 'center', backgroundColor: '#fff', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '20px' }}>포켓몬 카드 스캐너</h1>
      <div style={{ 
        margin: '0 auto', border: '3px solid #333', width: '95%', maxWidth: '400px',
        aspectRatio: '400 / 558', overflow: 'hidden', background: '#000', borderRadius: '12px'
      }}>
        <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }} />
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>

      <div style={{ marginTop: '20px' }}>
        {!result ? (
          <button onClick={handleCapture} disabled={isAnalyzing} style={{ 
            padding: '15px 0', fontSize: '18px', fontWeight: 'bold', width: '80%',
            backgroundColor: isAnalyzing ? '#ccc' : '#28a745', color: 'white', 
            border: 'none', borderRadius: '30px'
          }}>
            분석하기
          </button>
        ) : (
          <button onClick={resetScanner} style={{ 
            padding: '15px 0', fontSize: '18px', width: '80%',
            backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '30px'
          }}>
            다시 찍기
          </button>
        )}
      </div>

      <div style={{ marginTop: '15px', padding: '15px', background: '#f8f9fa', borderRadius: '12px' }}>
        <p style={{ fontSize: '14px', color: '#666' }}>{status}</p>
        <h2 style={{ fontSize: '18px' }}>{result || "---"}</h2>
      </div>
    </div>
  );
};

export default App;