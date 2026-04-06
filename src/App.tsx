import React, { useRef, useState, useEffect } from 'react';
import * as ort from 'onnxruntime-web';

const App = () => {
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("이미지를 업로드해주세요.");
  const [charDict, setCharDict] = useState<string[]>([]); // 실시간 사전 상태
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- [추가] 앱 시작 시 사전 파일 불러오기 ---
  useEffect(() => {
    const loadDictionary = async () => {
      try {
        const response = await fetch('/korean_dict.txt'); // public 폴더의 파일
        const text = await response.text();
        // PaddleOCR 인덱스 규칙: 0번은 반드시 "blank"여야 함
        const lines = ["blank", ...text.split('\n').map(line => line.trim())];
        setCharDict(lines);
        console.log("사전 로드 완료, 총 글자 수:", lines.length);
      } catch (err) {
        console.error("사전 로드 실패:", err);
        setStatus("사전 파일을 찾을 수 없습니다.");
      }
    };
    loadDictionary();
  }, []);

  // --- [로직 1] 전처리 (변화 없음) ---
  const preprocess = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const imageData = ctx.getImageData(0, 0, 320, 48);
    const { data } = imageData;
    const float32Data = new Float32Array(3 * 48 * 320);
    const offsetG = 48 * 320;
    const offsetB = 48 * 320 * 2;

    for (let i = 0; i < 48 * 320; i++) {
      float32Data[i] = (data[i * 4] / 255.0 - 0.5) / 0.5;
      float32Data[i + offsetG] = (data[i * 4 + 1] / 255.0 - 0.5) / 0.5;
      float32Data[i + offsetB] = (data[i * 4 + 2] / 255.0 - 0.5) / 0.5;
    }
    return new ort.Tensor('float32', float32Data, [1, 3, 48, 320]);
  };

  // --- [로직 2] CTC 디코딩 (charDict 사용하도록 수정) ---
  const decodeCTC = (data: any, dims: number[]) => {
    if (charDict.length === 0) return "사전 로딩 중...";
    
    const steps = dims[1];
    const numChars = dims[2];
    let text = "";
    let prevIdx = -1;

    for (let i = 0; i < steps; i++) {
      const row = data.slice(i * numChars, (i + 1) * numChars);
      const maxIdx = row.indexOf(Math.max(...row));
      
      // 0번(blank)이 아니고, 이전 글자와 중복되지 않을 때만 추가
      if (maxIdx > 0 && maxIdx !== prevIdx) {
        // PaddleOCR v4 기준: maxIdx 그대로 사용 (이미 blank를 0번에 넣었으므로)
        text += charDict[maxIdx] || "";
      }
      prevIdx = maxIdx;
    }
    return text.trim();
  };

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
        ctx.clearRect(0, 0, 320, 48);
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 320, 48);
        ctx.drawImage(img, 0, 0, 320, 48);
        setStatus("이미지 로드 완료! 인식 시작을 눌러주세요.");
      };
      img.src = event.target.result as string;
    };
    reader.readAsDataURL(file);
  };

  const startInference = async () => {
    if (charDict.length === 0) {
      alert("사전이 아직 로드되지 않았습니다.");
      return;
    }
    try {
      setStatus("모델 로딩 및 분석 중...");
      const session = await ort.InferenceSession.create('/card_rec.onnx', {
        executionProviders: ['wasm']
      });

      const tensor = preprocess(canvasRef.current!);
      if (!tensor) return;

      const feeds = { [session.inputNames[0]]: tensor };
      const results = await session.run(feeds);
      const output = results[session.outputNames[0]];

      const text = decodeCTC(output.data, output.dims);
      setResult(text || "인식 결과 없음");
      setStatus("분석 완료!");
    } catch (err) {
      console.error(err);
      setStatus("에러 발생! 콘솔을 확인하세요.");
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>포켓몬 카드 번호 인식 (Final Test)</h1>
      <input type="file" accept="image/*" onChange={handleFileChange} />
      
      <div style={{ margin: '20px 0' }}>
        <p>인식 영역 미리보기:</p>
        <canvas ref={canvasRef} width={320} height={48} style={{ border: '2px solid red' }} />
      </div>

      <button onClick={startInference} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
        번호 인식 시작
      </button>

      <div style={{ marginTop: '20px', background: '#f0f0f0', padding: '15px' }}>
        <p>상태: <strong>{status}</strong></p>
        <p>사전 상태: {charDict.length > 0 ? `✅ 로드됨 (${charDict.length}자)` : "❌ 로드 전"}</p>
        <h2>결과: <span style={{ color: 'blue' }}>{result}</span></h2>
      </div>
    </div>
  );
};

export default App;