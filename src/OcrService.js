import * as ort from 'onnxruntime-web';

let detSession = null;
let recSession = null;
let charDict = [];

const DICT_PATH = '/en_dict.txt';
const DET_MODEL_PATH = '/card_det.onnx';
const REC_MODEL_PATH = '/card_rec_en.onnx';

export const initService = async () => {
    if (charDict.length === 0) {
        const response = await fetch(DICT_PATH);
        const text = await response.text();
        const lines = text.split(/\n/).map(line => line.replace(/\r$/, ''));
        charDict = ["blank", ...lines];
    }
    if (!detSession) {
        detSession = await ort.InferenceSession.create(DET_MODEL_PATH, { 
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all' 
        });
    }
    if (!recSession) {
        recSession = await ort.InferenceSession.create(REC_MODEL_PATH, { 
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all' 
        });
    }
};

const findAllBoxes = (heatmap, width, height) => {
    const boxes = [];
    const threshold = 0.2; //20퍼센트가 넘어가면 박스로 확정하고 박스침
    const visited = new Uint8Array(640 * 640);
    
    // --- 설정 변수 ---
    const unclip_ratio = 1.3; // [추가] 박스를 얼마나 키울지 결정 (1.5 ~ 2.0 추천)

    for (let i = 0; i < 640 * 640; i++) {
        if (heatmap[i] > threshold && !visited[i]) {
            let minX = 640, maxX = 0, minY = 640, maxY = 0;
            const stack = [i];
            visited[i] = 1;

            while (stack.length > 0) {
                const curr = stack.pop();
                const cx = curr % 640;
                const cy = Math.floor(curr / 640);
                minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
                minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);

                for (let [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx >= 0 && nx < 640 && ny >= 0 && ny < 640) {
                        const nIdx = ny * 640 + nx;
                        if (heatmap[nIdx] > threshold && !visited[nIdx]) {
                            visited[nIdx] = 1;
                            stack.push(nIdx);
                        }
                    }
                }
            }

            if ((maxX - minX) > 5 && (maxY - minY) > 5) {
                // 1. 기초 좌표 계산 (640 기준)
                let w = maxX - minX;
                let h = maxY - minY;
                
                // 2. Unclip 로직 적용 (박스 확장)
                // 박스의 둘레와 면적을 이용해 확장 길이를 계산합니다.
                const area = w * h;
                const perimeter = (w + h) * 2;
                const distance = (area * unclip_ratio) / perimeter;

                // 확장된 좌표 (여전히 640 기준)
                let expandedMinX = Math.max(0, minX - distance);
                let expandedMaxX = Math.min(639, maxX + distance);
                let expandedMinY = Math.max(0, minY - distance);
                let expandedMaxY = Math.min(639, maxY + distance);

                // 3. 최종 원본 크기 비율로 복원
                boxes.push({
                    x: (expandedMinX / 640) * width,
                    y: (expandedMinY / 640) * height,
                    w: ((expandedMaxX - expandedMinX) / 640) * width,
                    h: ((expandedMaxY - expandedMinY) / 640) * height
                });
            }
        }
    }
    return boxes;
};

export const runOcrInference = async (sourceCanvas) => {
    try {
        await initService();

        // 1. Detection 전처리
        const detCanvas = document.createElement('canvas');
        detCanvas.width = 640; detCanvas.height = 640;
        const detCtx = detCanvas.getContext('2d');
        // 비율 무시하고 640x640에 꽉 채워 그림 (기존 방식 유지)
        detCtx.drawImage(sourceCanvas, 0, 0, 640, 640);
        
        const detData = detCtx.getImageData(0, 0, 640, 640).data;
        const detFloat32 = new Float32Array(3 * 640 * 640);

        // [핵심] HWC -> CHW 순서 및 정규화
        for (let i = 0; i < 640 * 640; i++) {
            detFloat32[i] = (detData[i * 4] / 255.0 - 0.485) / 0.229;           // R
            detFloat32[i + 640*640] = (detData[i * 4 + 1] / 255.0 - 0.456) / 0.224; // G
            detFloat32[i + 640*640*2] = (detData[i * 4 + 2] / 255.0 - 0.406) / 0.225; // B
        }

        const detTensor = new ort.Tensor('float32', detFloat32, [1, 3, 640, 640]);
        const detOut = await detSession.run({ [detSession.inputNames[0]]: detTensor });
        const heatmap = detOut[detSession.outputNames[0]].data;

        // 2. 박스 추출 (원본 캔버스 크기 전달)
        const boxes = findAllBoxes(heatmap, sourceCanvas.width, sourceCanvas.height);
        const results = [];

        // 3. Recognition 수행
        for (const box of boxes) {
            const cropCanvas = document.createElement('canvas');
            // REC 모델 규격에 맞춤 (세로 48 고정)
            cropCanvas.width = 320; 
            cropCanvas.height = 48;
            const cropCtx = cropCanvas.getContext('2d');
            
            // 원본 캔버스에서 해당 좌표만큼 잘라와서 320x48로 리사이징
            cropCtx.drawImage(sourceCanvas, box.x, box.y, box.w, box.h, 0, 0, 320, 48);

            const recData = cropCtx.getImageData(0, 0, 320, 48).data;
            const recFloat32 = new Float32Array(3 * 48 * 320);
            for (let i = 0; i < 48 * 320; i++) {
                recFloat32[i] = (recData[i * 4] / 255.0 - 0.5) / 0.5;
                recFloat32[i + 48*320] = (recData[i * 4 + 1] / 255.0 - 0.5) / 0.5;
                recFloat32[i + 48*320*2] = (recData[i * 4 + 2] / 255.0 - 0.5) / 0.5;
            }

            const recTensor = new ort.Tensor('float32', recFloat32, [1, 3, 48, 320]);
            const recOut = await recSession.run({ [recSession.inputNames[0]]: recTensor });
            
            const text = decodeCTC(recOut[recSession.outputNames[0]].data, recOut[recSession.outputNames[0]].dims);
            if (text.length > 0) results.push({ text, box });
        }
        return results;
    } catch (e) {
        console.error("Inference Error:", e);
        return [];
    }
};

const decodeCTC = (data, dims) => {
    const steps = dims[1], numChars = dims[2];
    let text = "", prevIdx = -1;
    for (let i = 0; i < steps; i++) {
        const row = data.slice(i * numChars, (i + 1) * numChars);
        const maxIdx = row.indexOf(Math.max(...row));
        if (maxIdx > 0 && maxIdx !== prevIdx) text += charDict[maxIdx] || "";
        prevIdx = maxIdx;
    }
    return text.trim();
};