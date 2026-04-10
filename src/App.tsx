import React, { useRef, useState, useEffect } from 'react';
import { runOcrInference, initService } from './OcrService';

const App = () => {
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("모델 로딩 중...");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 모델 학습 기준 가로 해상도 (400x558 파인튜닝 기준)
  const TARGET_WIDTH = 400;

  useEffect(() => {
    initService().then(() => setStatus("이미지를 업로드하세요."));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // [핵심] 원본이 크든 작든 가로를 400px로 강제 고정 (세로는 비율 유지)
        const scale = TARGET_WIDTH / img.width;
        const targetWidth = TARGET_WIDTH;
        const targetHeight = img.height * scale;

        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        // 부드러운 화질을 위한 스무딩 설정
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        setStatus(`준비 완료! (${Math.round(img.width)}px -> ${targetWidth}px 최적화)`);
        setResult(""); // 이전 결과 초기화
      };
      img.src = event.target.result as string;
    };
    reader.readAsDataURL(file);
  };

  const startInference = async () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 분석 전 캔버스를 깨끗하게 다시 그리기 (이전 빨간 박스 제거)
    // 현재 캔버스에 그려진 이미지를 임시 보관했다가 다시 그리는 방식
    const tempImg = new Image();
    tempImg.src = canvas.toDataURL();
    tempImg.onload = async () => {
      ctx.drawImage(tempImg, 0, 0);
      
      setStatus("번호 탐색 및 분석 중...");
      const results = await runOcrInference(canvas);

      if (results.length === 0) {
        setStatus("검출된 내용이 없습니다. (임계값 확인 필요)");
        return;
      }

      // 시각화 로직
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2; // 400px 해상도에 적절한 두께
      ctx.font = "bold 14px Arial";
      ctx.fillStyle = "red";

      const detectedTexts = results.map((item: any) => {
        const { x, y, w, h } = item.box;
        ctx.strokeRect(x, y, w, h);
        ctx.fillText(item.text, x, y - 5);
        return item.text;
      });

      setResult(detectedTexts.join(", "));
      setStatus(`분석 완료! (${results.length}개 영역 탐색)`);
    };
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1>포켓몬 카드 자동 인식 (Universal OCR)</h1>
      <div style={{ marginBottom: '20px' }}>
        <input type="file" accept="image/*" onChange={handleFileChange} />
      </div>

      <div style={{ 
        margin: '0 auto', 
        border: '2px solid #333', 
        width: `${TARGET_WIDTH}px`, // 학습 기준 가로값으로 고정 시각화
        minHeight: '558px',
        overflow: 'hidden',
        background: '#000'
      }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
      </div>

      <div style={{ marginTop: '20px' }}>
        <button 
          onClick={startInference} 
          style={{ padding: '12px 30px', fontSize: '18px', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px' }}
        >
          카드 분석 시작
        </button>
      </div>

      <div style={{ marginTop: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '8px' }}>
        <p>상태: <strong>{status}</strong></p>
        <h2>결과: <span style={{ color: '#d9534f' }}>{result || "---"}</span></h2>
      </div>
    </div>
  );
};

export default App;