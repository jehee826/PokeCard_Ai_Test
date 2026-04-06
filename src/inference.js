import * as ort from 'onnxruntime-web';


export async function loadModel() {
    try {
        const session = await ort.InferenceSession.create('/pokecard_model.onnx', {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });
        console.log("✅ ONNX 모델 로드 완료");
        return session;
    } catch (e) {
        console.error("❌ 모델 로드 실패:", e);
    }
}

async function preprocess(imageElement) {
    const canvas = document.createElement('canvas');
    canvas.width = 224;
    canvas.height = 224;
    
    // 💡 alpha: false로 배경 합성 노이즈 차단
    // willReadFrequently: 픽셀 데이터 추출 최적화
    const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    
    // 💡 파이썬의 Bilinear/Bicubic과 가장 유사한 고품질 설정
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // 배경을 흰색으로 먼저 채워 투명도 간섭 방지
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 224, 224);
    ctx.drawImage(imageElement, 0, 0, 224, 224);

    const imageData = ctx.getImageData(0, 0, 224, 224).data;
    const float32Data = new Float32Array(3 * 224 * 224);

    // PyTorch 표준 정규화 상수 (학습 때와 동일)
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

    // 💡 파이썬의 [C, H, W] 구조로 텐서 배치
    const stride = 224 * 224;
    for (let i = 0; i < stride; i++) {
        const r = imageData[i * 4];
        const g = imageData[i * 4 + 1];
        const b = imageData[i * 4 + 2];

        // 파이썬 transforms.ToTensor()는 255로 나눈 뒤 [0, 1]로 만듦
        // 그 후 Normalize: (x - mean) / std 적용
        float32Data[i] = ((r / 255.0) - mean[0]) / std[0];          // R 채널
        float32Data[i + stride] = ((g / 255.0) - mean[1]) / std[1]; // G 채널
        float32Data[i + 2 * stride] = ((b / 255.0) - mean[2]) / std[2]; // B 채널
    }

    return new ort.Tensor('float32', float32Data, [1, 3, 224, 224]);
}

export async function runInference(session, imageElement, categories) {
    const inputTensor = await preprocess(imageElement);
    const results = await session.run({ input: inputTensor });
    
    // 모델의 출력 노드 이름이 'output'인지 확인 (익스포트 설정에 따라 다를 수 있음)
    const outputName = session.outputNames[0];
    const output = results[outputName].data; 

    // 💡 Softmax: Logits -> 확률 변환 (수치 안정성 강화)
    const maxLogit = Math.max(...output); 
    const exps = output.map(x => Math.exp(x - maxLogit));
    const sumExps = exps.reduce((a, b) => a + b);
    const probabilities = exps.map(x => x / sumExps);

    const resultsWithLabels = categories.map((name, idx) => ({
        name: name.toUpperCase(),
        prob: probabilities[idx] * 100
    }));

    return resultsWithLabels.sort((a, b) => b.prob - a.prob).slice(0, 5);
}