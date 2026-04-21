import React, { useRef, useState, useEffect } from 'react';

const CameraTest = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [debugInfo, setDebugInfo] = useState<any>({});

  const TARGET_WIDTH = 400;
  const TARGET_HEIGHT = 558;

  useEffect(() => {
    startCamera();
  }, []);

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        const settings = track.getSettings();

        // 현재 카메라의 실제 정보 수집
        setDebugInfo({
          resolution: `${settings.width}x${settings.height}`,
          focusModeSupport: capabilities.focusMode?.join(', ') || '지원안함',
          zoomSupport: capabilities.zoom ? `지원 (최대: ${capabilities.zoom.max})` : '지원안함',
          activeZoom: settings.zoom || 1.0
        });

        const advancedConstraints: any = {};
        if (capabilities.zoom) {
          advancedConstraints.zoom = 2.0; // 테스트할 줌 수치
        }
        if (capabilities.focusMode?.includes('continuous')) {
          advancedConstraints.focusMode = 'continuous';
        }

        await track.applyConstraints({ advanced: [advancedConstraints] } as any);

        videoRef.current.onloadedmetadata = () => {
          requestAnimationFrame(tick);
        };
      }
    } catch (err) {
      alert("카메라 연결 실패: " + err);
    }
  };

  const tick = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = TARGET_WIDTH;
    canvas.height = TARGET_HEIGHT;

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

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);

    requestAnimationFrame(tick);
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#222', color: '#fff', minHeight: '100vh' }}>
      <h2>📷 카메라 디버그 모드</h2>
      
      {/* 미리보기 박스 */}
      <div style={{ 
        margin: '20px auto', border: '2px solid #00ff00', width: '90%', maxWidth: '400px',
        aspectRatio: '400 / 558', overflow: 'hidden', background: '#000'
      }}>
        <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }} />
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* 디버그 정보 UI */}
      <div style={{ 
        textAlign: 'left', display: 'inline-block', padding: '15px', 
        background: '#333', borderRadius: '8px', fontSize: '14px', lineHeight: '1.6' 
      }}>
        <p>🟢 <strong>실제 할당 해상도:</strong> {debugInfo.resolution}</p>
        <p>🔍 <strong>줌 지원 여부:</strong> {debugInfo.zoomSupport}</p>
        <p>🎯 <strong>초점 모드 목록:</strong> {debugInfo.focusModeSupport}</p>
        <p>📏 <strong>현재 적용 줌:</strong> {debugInfo.activeZoom}</p>
        <hr style={{ borderColor: '#555' }} />
        <p style={{ color: '#aaa', fontSize: '12px' }}>
          * 화면이 흐리다면 폰을 카드에서 30cm 이상 떼보세요.<br/>
          * 갤럭시는 멀리서 찍을수록 초점이 잘 잡힙니다.
        </p>
      </div>

      <button 
        onClick={() => window.location.reload()} 
        style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer' }}
      >
        새로고침
      </button>
    </div>
  );
};

export default CameraTest;