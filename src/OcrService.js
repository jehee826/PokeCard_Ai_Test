import * as ort from 'onnxruntime-web';

let session = null;
let charDict = [];
let dict_path = '/en_dict.txt'; //public 폴더를 기준으로한 경로
let ocr_path = '/card_rec_en.onnx';
/**
 * 사전 파일 및 모델 세션을 초기화합니다. (내부 호출용)
 */
const initService = async () => {
    // 1. 사전 파일 로드 (이미 로드되었다면 스킵)
    if (charDict.length === 0) {
        const response = await fetch(dict_path); 
        const text = await response.text();
        
        // 1. 기존 방식대로 사전 로드
        const lines = text.split(/\n/).map(line => line.replace(/\r$/, ''));
        charDict = ["blank", ...lines];

        // 2. 만약 사전에 슬래시가 없다면 강제로 추가
        if (!charDict.includes("/")) {
            charDict.push("/"); 
            console.log("⚠️ 사전에 슬래시가 없어 수동으로 추가했습니다. (Index:", charDict.length - 1, ")");
        }
    }

    // 2. ONNX 세션 생성
    if (!session) {
        session = await ort.InferenceSession.create(ocr_path, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });
    }
};

/**
 * 캔버스 이미지를 텐서로 변환 (전처리)
 */
const preprocess = (canvas) => {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, 320, 48);
    const { data } = imageData;
    const float32Data = new Float32Array(3 * 48 * 320);

    for (let i = 0; i < 48 * 320; i++) {
        float32Data[i] = (data[i * 4] / 255.0 - 0.5) / 0.5;
        float32Data[i + 48 * 320] = (data[i * 4 + 1] / 255.0 - 0.5) / 0.5;
        float32Data[i + 48 * 320 * 2] = (data[i * 4 + 2] / 255.0 - 0.5) / 0.5;
    }
    return new ort.Tensor('float32', float32Data, [1, 3, 48, 320]);
};

/**
 * CTC 디코딩
 */
const decodeCTC = (data, dims) => {
    const steps = dims[1];
    const numChars = dims[2];
    let text = "";
    let prevIdx = -1;

    for (let i = 0; i < steps; i++) {
        const row = data.slice(i * numChars, (i + 1) * numChars);
        const maxIdx = row.indexOf(Math.max(...row));
        if (maxIdx > 0 && maxIdx !== prevIdx) {
            text += charDict[maxIdx] || "";
        }
        prevIdx = maxIdx;
    }
    return text.trim();
};

/**
 * 외부에서 호출할 유일한 함수
 */
export const runOcrInference = async (canvas) => {
    try {
        await initService(); // 준비 작업 수행

        const tensor = preprocess(canvas);
        const feeds = { [session.inputNames[0]]: tensor };
        const results = await session.run(feeds);
        const output = results[session.outputNames[0]];
        

        return decodeCTC(output.data, output.dims);
    } catch (e) {
        console.log("현재사용중인 모델언어:",ocr_path);
        return "인식 실패";
    }
};