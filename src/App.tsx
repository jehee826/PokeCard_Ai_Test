import React, { useRef, useState, useEffect } from 'react';
import { runOcrInference } from './OcrService'; // 캡슐화된 서비스 임포트

const App = () => {
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("모델 준비 중...");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- [로직 1] 앱 시작 시 모델 및 사전 미리 로드 (Preload) ---
  useEffect(() => {
    const init = async () => {
      try {
        // 배경에서 미리 다운로드 및 세션 생성 시작
        // 결과는 필요 없으므로 null을 넘겨 초기화만 수행합니다.
        await runOcrInference(null as any);
        setStatus("이미지를 업로드해주세요.");
      } catch (err) {
        console.error("초기화 에러:", err);
        setStatus("모델 로딩 실패. 네트워크를 확인하세요.");
      }
    };
    init();
  }, []);

  // --- [로직 2] 파일 선택 시 캔버스에 그리기 ---
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
        
        // 캔버스 초기화 후 이미지 그리기 (320x48 규격 고정)
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 320, 48);
        ctx.drawImage(img, 0, 0, 320, 48);
        setStatus("이미지 로드 완료! 분석을 시작하세요.");
      };
      img.src = event.target.result as string;
    };
    reader.readAsDataURL(file);
  };

  // --- [로직 3] 추론 실행 ---
  const startInference = async () => {
    if (!canvasRef.current) return;
    
    setStatus("분석 중...");
    // 서비스 호출 한 줄로 텍스트 추출 완료
    const text = await runOcrInference(canvasRef.current);
    
    setResult(text);
    setStatus(text === "인식 실패" ? "분석 실패" : "분석 완료!");
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>포켓몬 카드 번호 인식</h1>
      
      {/* 이미지 업로드 */}
      <input type="file" accept="image/*" onChange={handleFileChange} />
      
      {/* 프리뷰 영역 */}
      <div style={{ margin: '20px 0' }}>
        <p>인식 영역 미리보기 (320x48):</p>
        <canvas 
          ref={canvasRef} 
          width={320} 
          height={48} 
          style={{ border: '2px solid red', width: '100%', height: 'auto' }} 
        />
      </div>

      {/* 분석 버튼 */}
      <button 
        onClick={startInference} 
        style={{ width: '100%', padding: '12px', fontSize: '18px', cursor: 'pointer' }}
      >
        번호 인식 시작
      </button>

      {/* 결과 표시 창 */}
      <div style={{ marginTop: '20px', background: '#f9f9f9', padding: '15px', borderRadius: '10px', border: '1px solid #ddd' }}>
        <p>상태: <strong>{status}</strong></p>
        <p style={{ fontSize: '1.2rem' }}>
          결과: <span style={{ color: 'blue', fontWeight: 'bold' }}>{result || "---"}</span>
        </p>
      </div>
    </div>
  );
};

export default App;