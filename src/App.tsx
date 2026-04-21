import React, { useRef, useState, useEffect } from 'react';
import { runOcrInference, initService } from './OcrService';
import './App.css';

const App = () => {
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("모델 로딩 중...");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImg, setCapturedImg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const TARGET_WIDTH = 400;
  const TARGET_HEIGHT = 558;

  useEffect(() => {
    initService().then(() => {
      setStatus("카메라 준비 완료");
      startCamera();
    });
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { min: 1080, ideal: 2000 },
          height: { min: 1920, ideal: 3600 },
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStatus("SYSTEM ONLINE");
      }
    } catch (err) {
      console.error(err);
      setStatus("CAMERA ERROR");
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current || isAnalyzing) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // 1. 피드백 제공: 비디오 정지 및 상태 변경
    video.pause(); 
    setIsAnalyzing(true);
    setResult(""); 
    setStatus("DATA SCANNING...");

    // 2. 캔버스 작업 (멈춘 비디오 프레임 복사)
    canvas.width = TARGET_WIDTH;
    canvas.height = TARGET_HEIGHT;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
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

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);

    // 3. 하단 미리보기용 이미지 저장
    const base64 = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImg(base64);

    // 4. 잠깐의 정지 후 카메라 재개 (사용자가 찍혔음을 인지할 시간 부여)
    setTimeout(() => {
      video.play().catch(e => console.error("Video play error:", e));
    }, 800);

    // 5. OCR 분석 수행
    try {
      const results = await runOcrInference(canvas);
      if (results && results.length > 0) {
        setResult(results.map((item: any) => item.text).join(", "));
        setStatus("ANALYSIS COMPLETE");
      } else {
        setStatus("RETRY SCAN");
      }
    } catch (error) {
      console.error(error);
      setStatus("SCAN ERROR");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="pokedex-container">
      <div className="left-panel">
        <div className="status-leds">
          <div className="led led-red led-blink"></div>
          <div className="led" style={{backgroundColor: '#ffd93e'}}></div>
          <div className="led" style={{backgroundColor: '#3eff3e'}}></div>
        </div>

        <div className="screen">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {isAnalyzing && <div className="scan-line"></div>}
        </div>

        <div style={{ marginTop: '30px', width: '100%' }}>
            <button 
              onClick={handleCapture} 
              disabled={isAnalyzing}
              style={{ 
                padding: '15px 0', fontSize: '18px', fontWeight: 'bold', width: '70%',
                backgroundColor: isAnalyzing ? '#888' : '#ffcb05', 
                color: '#222', border: 'none', borderRadius: '10px', cursor: 'pointer'
              }}
            >
              {isAnalyzing ? "SCANNING..." : "START SCAN"}
            </button>
        </div>
      </div>

      <div className="right-section">
        <h1 className="result-title">POKEMON SCANNER</h1>
        
        <div style={{ background: '#222', borderRadius: '10px', width: '95%', textAlign: 'left', margin: 'auto', padding: '15px' }}>
          <p style={{ color: '#888', fontSize: '12px', margin: 0 }}>SYSTEM STATUS:</p>
          <p style={{ color: '#3eff3e', fontWeight: 'bold', marginBottom: '20px' }}>{status}</p>
          
          <p style={{ color: '#888', fontSize: '12px', margin: 0 }}>OCR ANALYSIS:</p>
          <h2 style={{ fontSize: '18px', color: '#fff', wordBreak: 'break-all' }}>{result || "---"}</h2>
        </div>

        {capturedImg && (
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: '12px', color: '#888' }}>LAST CAPTURED DATA</p>
            <img src={capturedImg} alt="captured" className="capture-preview" />
          </div>
        )}
      </div>
    </div>
  );
};

export default App;