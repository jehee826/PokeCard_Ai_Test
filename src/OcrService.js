import * as ort from 'onnxruntime-web';

// 중요: PaddleOCR 사전(Dictionary) - 숫자와 슬래시(/) 위주로 구성
// 실제 모델의 korean_dict와 순서가 맞아야 합니다.
const CHARACTER_DICT = "0123456789/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ ".split("");

export const runOcrInference = async (canvas) => {
    try {
        // 1. public 폴더의 모델 로드 (서버 상대 경로)
        const session = await ort.InferenceSession.create('/models/card_rec.onnx', {
            executionProviders: ['wasm'], 
            graphOptimizationLevel: 'all'
        });

        // 2. 캔버스 데이터를 텐서로 변환
        const tensor = preprocess(canvas);

        // 3. 모델 실행
        const feeds = { [session.inputNames[0]]: tensor };
        const results = await session.run(feeds);
        const output = results[session.outputNames[0]];

        // 4. 결과 디코딩
        return decodeCTC(output.data, output.dims);
    } catch (e) {
        console.error("OCR 추론 중 오류 발생:", e);
        return "인식 실패";
    }
};

const preprocess = (canvas) => {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, 320, 48);
    const { data } = imageData;
    const float32Data = new Float32Array(1 * 3 * 48 * 320);

    // CHW(Channel, Height, Width) 순서 및 정규화
    const offsetG = 48 * 320;
    const offsetB = 48 * 320 * 2;

    for (let i = 0; i < 48 * 320; i++) {
        float32Data[i] = (data[i * 4] / 255.0 - 0.5) / 0.5;           // R
        float32Data[i + offsetG] = (data[i * 4 + 1] / 255.0 - 0.5) / 0.5; // G
        float32Data[i + offsetB] = (data[i * 4 + 2] / 255.0 - 0.5) / 0.5; // B
    }
    return new ort.Tensor('float32', float32Data, [1, 3, 48, 320]);
};

const decodeCTC = (data, dims) => {
    const steps = dims[1];
    const numChars = dims[2];
    let text = "";
    let prevIdx = -1;

    for (let i = 0; i < steps; i++) {
        const row = data.slice(i * numChars, (i + 1) * numChars);
        const maxIdx = row.indexOf(Math.max(...row));
        // 0은 보통 Blank(CTC), 그 외 인덱스를 사전에서 매핑
        if (maxIdx > 0 && maxIdx !== prevIdx) {
            text += CHARACTER_DICT[maxIdx - 1] || "";
        }
        prevIdx = maxIdx;
    }
    return text.trim();
};