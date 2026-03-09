import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Edit3, Volume2, Download, Copy, ChevronLeft, Check, Loader2, Play, AlertCircle, FileText, Plus, X, Package, Upload, BrainCircuit, Trophy, RefreshCw, ArrowRight, Settings } from 'lucide-react';

// --- Utility Functions ---

const fetchWithRetry = async (fn, retries = 5) => {
    let delay = 1000;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
        }
    }
};

// バッチ処理用に長めの待機時間とリトライ回数を持たせた関数
const fetchWithRetryBatch = async (fn, retries = 6) => {
    let delay = 2000;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, delay));
            delay *= 1.5;
        }
    }
};

function pcmToWav(pcmData, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmData.byteLength;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const pcmView = new Uint8Array(pcmData);
    const bufferView = new Uint8Array(buffer, 44);
    bufferView.set(pcmView);

    return new Blob([buffer], { type: 'audio/wav' });
}

const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        return successful;
    } catch (err) {
        return false;
    } finally {
        document.body.removeChild(textArea);
    }
};

const initialBatchItems = [
    { id: 1, word: '', saveType: 'html', includeQuiz: false, status: 'idle', audioStatus: 'idle', quizStatus: 'idle', wordData: null, audioBlob: null, quizData: null, errorMsg: null },
    { id: 2, word: '', saveType: 'html', includeQuiz: false, status: 'idle', audioStatus: 'idle', quizStatus: 'idle', wordData: null, audioBlob: null, quizData: null, errorMsg: null },
    { id: 3, word: '', saveType: 'html', includeQuiz: false, status: 'idle', audioStatus: 'idle', quizStatus: 'idle', wordData: null, audioBlob: null, quizData: null, errorMsg: null }
];

// --- Sub-Component for each Tab Content ---

function TabContent({ tabData, updateTab, apiKey }) {
    const {
        view, wordInput, exampleType, manualExample, wordData,
        audioUrl, isGeneratingAudio, errorMsg, showConfirmModal, copySuccess, audioBlob,
        quizData, currentQuizIndex, quizScore, quizResults, isGeneratingQuiz,
        showQuizFeedback, selectedOptionIndex,
        batchItems = initialBatchItems
    } = tabData;

    const audioRef = useRef(null);
    const fileInputRef = useRef(null);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const htmlContent = event.target.result;
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');

            try {
                const word = doc.querySelector('.word')?.textContent || "";
                const phonetic = doc.querySelector('.phonetic')?.textContent?.replace(/\//g, "") || "";

                const meaningItems = doc.querySelectorAll('.meaning-item');
                const meanings = Array.from(meaningItems).map(item => ({
                    partOfSpeech: item.querySelector('.pos-tag')?.textContent || "",
                    meaning: item.querySelector('.meaning-text')?.textContent || "",
                    variations: item.querySelector('.variation-text')?.textContent?.replace("変化: ", "") || ""
                }));

                const exampleEn = doc.querySelector('.ex-en')?.textContent || "";
                const exampleJa = doc.querySelector('.ex-ja')?.textContent || "";

                const pointItems = doc.querySelectorAll('.point-item');
                const learningPoints = Array.from(pointItems).map(li => li.textContent);

                const audioElement = doc.querySelector('audio source') || doc.querySelector('audio');
                let restoredAudioUrl = null;
                let restoredAudioBlob = null;

                if (audioElement && (audioElement.src.startsWith('data:audio') || audioElement.getAttribute('src')?.startsWith('data:audio'))) {
                    const src = audioElement.src || audioElement.getAttribute('src');
                    const base64Data = src.split(',')[1];
                    const binaryStr = atob(base64Data);
                    const len = binaryStr.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryStr.charCodeAt(i);
                    }
                    restoredAudioBlob = new Blob([bytes], { type: 'audio/wav' });
                    restoredAudioUrl = URL.createObjectURL(restoredAudioBlob);
                }

                if (!word) throw new Error("単語データが見つかりませんでした。");

                updateTab({
                    wordData: {
                        word,
                        phonetic,
                        meanings,
                        example: { english: exampleEn, japanese: exampleJa },
                        learningPoints
                    },
                    audioUrl: restoredAudioUrl,
                    audioBlob: restoredAudioBlob,
                    view: 'result',
                    tabName: word
                });
            } catch (err) {
                console.error(err);
                updateTab({ errorMsg: "ファイルの解析に失敗しました。正しいLexicon形式のHTMLか確認してください。" });
            }
        };
        reader.readAsText(file);
    };

    const handleCreate = async () => {
        if (!wordInput.trim()) return;

        updateTab({ view: 'loading', errorMsg: null });

        const systemPrompt = `あなたは優秀な英語学習アシスタントです。ユーザーが入力した英単語について、詳細で実践的な学習情報を提供してください。
必ず指定されたJSONスキーマに従って出力してください。
【指示】
1. meanings: 自動詞か他動詞か名詞か形容詞かなどを明記し、それぞれの場合の日本語訳と変化形（例：stride-strode-stridden）を確実なソースに基づき調査してください。
2. example: ユーザーが手動で例文を入力した場合は、その英文を使用し、適切な日本語訳を生成してください。自動生成の場合は、その単語の最も一般的な用法を示す例文を生成してください。
3. learningPoints: これが最も重要です。類義語、対義語、似ているスペルの単語との区別、派生語、特定の語法（前置詞との結びつきなど）を徹底的に調査し、複数のポイントを配列として出力してください。`;

        const userPrompt = `単語: ${wordInput}
例文の指定: ${exampleType === 'auto' ? 'AIによる自動生成' : `以下の例文を使用してください: 「${manualExample}」`}`;

        const payload = {
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        word: { type: "STRING" },
                        phonetic: { type: "STRING" },
                        meanings: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    partOfSpeech: { type: "STRING", description: "例: （名詞）, （自動詞）など" },
                                    meaning: { type: "STRING", description: "日本語訳" },
                                    variations: { type: "STRING", description: "変化形など。なければ空文字。" }
                                },
                                required: ["partOfSpeech", "meaning", "variations"]
                            }
                        },
                        example: {
                            type: "OBJECT",
                            properties: {
                                english: { type: "STRING" },
                                japanese: { type: "STRING" }
                            },
                            required: ["english", "japanese"]
                        },
                        learningPoints: {
                            type: "ARRAY",
                            items: { type: "STRING" }
                        }
                    },
                    required: ["word", "phonetic", "meanings", "example", "learningPoints"]
                }
            }
        };

        try {
            const response = await fetchWithRetry(async () => {
                const headers = { 'Content-Type': 'application/json' };
                if (apiKey) headers['x-gemini-api-key'] = apiKey;
                const res = await fetch(`/api/generate-word`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error(`API Error: ${res.status}`);
                return await res.json();
            });

            const textResp = response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textResp) {
                const data = JSON.parse(textResp);
                updateTab({
                    wordData: data,
                    view: 'result',
                    tabName: data.word
                });
            } else {
                throw new Error("Invalid response format");
            }
        } catch (error) {
            console.error(error);
            updateTab({
                errorMsg: "単語データの生成に失敗しました。しばらく経ってからもう一度お試しください。",
                view: 'create'
            });
        }
    };

    const handleGenerateAudio = async () => {
        if (!wordData || isGeneratingAudio) return;
        updateTab({ isGeneratingAudio: true, errorMsg: null });

        const textToRead = `
単語。${wordData.word}。
意味。
${wordData.meanings.map(m => `${m.partOfSpeech}。${m.meaning}。${m.variations ? `変化形、${m.variations}。` : ''}`).join(' ')}
例文。
${wordData.example.english}
日本語訳。
${wordData.example.japanese}
学習のポイント。
${wordData.learningPoints.join('。')}
        `;

        const payload = {
            contents: [{ parts: [{ text: textToRead }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Aoede" }
                    }
                }
            },
            model: "gemini-2.5-flash-preview-tts"
        };

        try {
            const response = await fetchWithRetry(async () => {
                const headers = { 'Content-Type': 'application/json' };
                if (apiKey) headers['x-gemini-api-key'] = apiKey;
                const res = await fetch(`/api/generate-audio`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error(`API Error: ${res.status}`);
                return await res.json();
            });

            const audioDataObj = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (audioDataObj) {
                const { data, mimeType } = audioDataObj;
                const sampleRateMatch = mimeType.match(/rate=(\d+)/);
                const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000;

                const binaryString = atob(data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                const wavBlob = pcmToWav(bytes.buffer, sampleRate);
                const url = URL.createObjectURL(wavBlob);
                updateTab({ audioUrl: url, audioBlob: wavBlob, isGeneratingAudio: false });
            } else {
                throw new Error("No audio data returned");
            }
        } catch (error) {
            console.error(error);
            updateTab({ errorMsg: "音声の生成に失敗しました。", isGeneratingAudio: false });
        }
    };

    // --- Quiz Generation Logic ---

    const handleGenerateQuiz = async () => {
        if (!wordData || isGeneratingQuiz) return;
        updateTab({ isGeneratingQuiz: true, errorMsg: null, view: 'loading_quiz' });

        const systemPrompt = `あなたはプロの英語講師です。提供された「対象単語情報」に基づき、ユーザーの習得度を段階的に高める4レベルの英単語クイズ（計12問）をJSON形式で作成してください。
クオリティを最大化するため、以下のルールを厳守してください。

# 問題文の言語に関する重要ルール
- **「指示（コマンド）」は日本語**で作成してください（例：「"withstand"の意味として最も適切なものはどれですか？」、「次の空所に当てはまる単語を選びなさい」）。
- **英文の文脈を問う問題（レベル2の穴埋めなど）では、問題文の中に英文を直接提示してください。**
- 学習者が「何を問われているか」は日本語で瞬時に理解でき、かつ「英語の思考」が必要な部分はしっかりと英語で提示される、ハイブリッドな構成を目指してください。
- **英語を使うべきケース**: 
    - レベル2: 穴埋め問題のターゲットとなる「英文そのもの」。
    - レベル4: 英語の定義文を用いたクイズや、類義語のニュアンスを英語で説明・提示する場合。
- 不要な英語の指示（例："Choose the best answer"）は避け、日本語で指示してください。

# クイズ構成ルール
1. レベル1: 意味の理解（2問・初級）
   - 日本語の意味から英単語を選択、英単語から日本語の意味を選択
2. レベル2: 意味の定着（3問・初級）
   - 穴埋め英文。主要な用法を網羅すること。問題文の中に( )を含んだ英文を提示すること。
3. レベル3: 語法・変化形の理解（5問・中級）
   - 時制、三単現、複数形、随伴する前置詞などを問う。ミスリードを含めること。
4. レベル4: 発展的学習（2問・上級）
   - 類義語選択、反意語選択、仲間外れ探し、または英語による定義説明。

各設問には必ず explanation (解説) を含めてください。解説には「正解の理由」だけでなく、「他の選択肢がなぜ間違いか（またはその選択肢の意味）」も含め、詳細かつ学習効果の高い内容にしてください。

各設問の構造: question, options (4つ), correctIndex, explanation, level`;

        const userPrompt = `
# 対象単語情報
- 単語: ${wordData.word}
- 主な意味: ${wordData.meanings.map(m => m.meaning).join(', ')}
- 語源・学習のポイント: ${wordData.learningPoints.join(' / ')}
- 例文: ${wordData.example.english} (${wordData.example.japanese})
`;

        const payload = {
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        quizzes: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    question: { type: "STRING" },
                                    options: { type: "ARRAY", items: { type: "STRING" }, minItems: 4, maxItems: 4 },
                                    correctIndex: { type: "INTEGER" },
                                    explanation: { type: "STRING" },
                                    level: { type: "INTEGER" }
                                },
                                required: ["question", "options", "correctIndex", "explanation", "level"]
                            }
                        }
                    },
                    required: ["quizzes"]
                }
            }
        };

        try {
            const response = await fetchWithRetry(async () => {
                const headers = { 'Content-Type': 'application/json' };
                if (apiKey) headers['x-gemini-api-key'] = apiKey;
                const res = await fetch(`/api/generate-quiz`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error(`API Error: ${res.status}`);
                return await res.json();
            });

            const textResp = response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textResp) {
                const data = JSON.parse(textResp);
                updateTab({
                    quizData: data.quizzes,
                    view: 'quiz',
                    currentQuizIndex: 0,
                    quizScore: 0,
                    quizResults: [],
                    isGeneratingQuiz: false,
                    showQuizFeedback: false,
                    selectedOptionIndex: null
                });
            }
        } catch (error) {
            console.error(error);
            updateTab({ errorMsg: "クイズの生成に失敗しました。", isGeneratingQuiz: false, view: 'result' });
        }
    };

    const handleAnswerQuiz = (index) => {
        if (showQuizFeedback) return;
        updateTab({ selectedOptionIndex: index, showQuizFeedback: true });
    };

    const handleNextQuiz = () => {
        const currentQuiz = quizData[currentQuizIndex];
        const isCorrect = selectedOptionIndex === currentQuiz.correctIndex;
        const newScore = isCorrect ? quizScore + 10 : quizScore;
        const result = {
            question: currentQuiz.question,
            selected: currentQuiz.options[selectedOptionIndex],
            correct: currentQuiz.options[currentQuiz.correctIndex],
            isCorrect,
            explanation: currentQuiz.explanation,
            level: currentQuiz.level
        };

        if (currentQuizIndex < quizData.length - 1) {
            updateTab({
                quizScore: newScore,
                currentQuizIndex: currentQuizIndex + 1,
                quizResults: [...quizResults, result],
                showQuizFeedback: false,
                selectedOptionIndex: null
            });
        } else {
            updateTab({
                quizScore: newScore,
                quizResults: [...quizResults, result],
                view: 'quiz_result',
                showQuizFeedback: false,
                selectedOptionIndex: null
            });
        }
    };

    // --- Offline Content Generation ---

    const generateLightweightText = () => {
        if (!quizData) return "";
        let text = `【Lexicon学習クイズ・解答解説シート】\n`;
        text += `対象単語: ${wordData.word}\n`;
        text += `作成日: ${new Date().toLocaleDateString()}\n`;
        text += `==========================================\n\n`;

        quizData.forEach((q, idx) => {
            text += `[Level ${q.level}] Q${idx + 1}: ${q.question}\n`;
            q.options.forEach((opt, i) => {
                text += `  ${String.fromCharCode(65 + i)}) ${opt}\n`;
            });
            text += `\n【正解】 ${String.fromCharCode(65 + q.correctIndex)}\n`;
            text += `【解説】 ${q.explanation}\n`;
            text += `------------------------------------------\n\n`;
        });

        text += `Generated by Lexicon AI`;
        return text;
    };

    const handleDownloadLightweightText = () => {
        const text = generateLightweightText();
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Lexicon_${wordData.word}_Quiz_Lightweight.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const generateOfflineQuizHtml = (includeAnswers = false) => {
        if (!quizData) return "";
        const title = includeAnswers ? `解答解説 - ${wordData.word}` : `学習クイズ - ${wordData.word}`;

        const quizHtml = quizData.map((q, idx) => `
            <div class="quiz-block" style="background: #171717; border: 1px solid #333; padding: 25px; border-radius: 12px; margin-bottom: 30px;">
                <div style="font-size: 10px; color: #d4af37; font-weight: bold; margin-bottom: 8px;">LEVEL ${q.level} - QUESTION ${idx + 1}</div>
                <div style="font-size: 18px; color: #fff; margin-bottom: 20px; line-height: 1.6;">${q.question.replace(/\n/g, '<br>')}</div>
                <div style="display: grid; gap: 10px;">
                    ${q.options.map((opt, i) => `
                        <div style="padding: 12px; border: 1px solid #444; border-radius: 6px; color: #ccc; ${includeAnswers && i === q.correctIndex ? 'border-color: #d4af37; color: #d4af37; background: #d4af3711;' : ''}">
                            <span style="font-weight: bold; margin-right: 10px;">${String.fromCharCode(65 + i)}</span> ${opt}
                        </div>
                    `).join('')}
                </div>
                ${includeAnswers ? `
                    <div style="margin-top: 20px; padding: 15px; background: #000; border-radius: 6px; font-size: 14px; border-left: 3px solid #d4af37;">
                        <div style="font-weight: bold; color: #d4af37; margin-bottom: 8px;">解説</div>
                        <div style="color: #aaa; line-height: 1.6;">${q.explanation}</div>
                    </div>
                ` : ''}
            </div>
        `).join('');

        return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 40px 20px; max-width: 800px; margin: 0 auto; }
        h1 { font-family: serif; text-align: center; margin-bottom: 40px; color: #fff; }
        .no-print { text-align: center; margin-bottom: 30px; }
        button { background: #d4af37; color: #000; border: none; padding: 10px 20px; border-radius: 5px; font-weight: bold; cursor: pointer; }
        @media print { .no-print { display: none; } }
    </style>
</head>
<body>
    <div class="no-print"><button onclick="window.print()">印刷 / PDFとして保存</button></div>
    <h1>${title}</h1>
    <div style="text-align: center; color: #777; margin-bottom: 40px;">対象単語: ${wordData.word}</div>
    ${quizHtml}
    <div style="text-align: center; margin-top: 60px; font-size: 12px; color: #555;">Generated by Lexicon AI</div>
</body>
</html>`;
    };

    const handleDownloadQuizPackage = (includeAnswers) => {
        const html = generateOfflineQuizHtml(includeAnswers);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Lexicon_${wordData.word}_Quiz${includeAnswers ? '_Answers' : ''}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDownloadPackage = async () => {
        if (!wordData || !audioBlob) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Audio = reader.result;
            const meaningsHtml = wordData.meanings.map(m => `
                <div class="meaning-item" style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; border-bottom: 1px solid #333; padding-bottom: 8px;">
                    <span class="pos-tag" style="font-size: 11px; background: #262626; padding: 2px 6px; border-radius: 4px; color: #a3a3a3; border: 1px solid #404040;">${m.partOfSpeech}</span>
                    <span class="meaning-text" style="font-size: 17px; color: #e5e5e5;">${m.meaning}</span>
                    ${m.variations ? `<span class="variation-text" style="font-style: italic; font-size: 14px; color: #737373; margin-left: auto;">変化: ${m.variations}</span>` : ''}
                </div>
            `).join('');
            const pointsHtml = wordData.learningPoints.map(p => `<li class="point-item" style="margin-bottom: 8px;">${p}</li>`).join('');

            const htmlContent = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>Lexicon - ${wordData.word}</title><style>body { font-family: sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; justify-content: center; padding: 20px; } .card { background: #171717; border: 1px solid #262626; border-radius: 16px; padding: 40px; max-width: 500px; width: 100%; } .word { font-size: 42px; text-align: center; color: #fff; margin: 0; } .phonetic { text-align: center; color: #d4af37; margin-bottom: 20px; } .label { font-size: 10px; color: #737373; text-transform: uppercase; margin-top: 24px; margin-bottom: 10px; } .example { background: #000; padding: 15px; border-radius: 8px; border-left: 3px solid #d4af37; } audio { width: 100%; margin-top: 20px; opacity: 0.5; }</style></head><body><div class="card"><h1 class="word">${wordData.word}</h1><p class="phonetic">/${wordData.phonetic}/</p><div class="label">意味</div>${meaningsHtml}<div class="label">例文</div><div class="example"><div class="ex-en">${wordData.example.english}</div><div class="ex-ja" style="color: #777; font-size: 13px; margin-top: 5px;">${wordData.example.japanese}</div></div><div class="label">ポイント</div><ul>${pointsHtml}</ul><audio controls><source src="${base64Audio}" type="audio/wav"></audio></div></body></html>`;

            const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(htmlBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Lexicon_${wordData.word}_FullPackage.html`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };
        reader.readAsDataURL(audioBlob);
    };

    const handleCopyText = () => {
        if (!wordData) return;
        const text = `【単語】 ${wordData.word}\n\n【意味】\n${wordData.meanings.map(m => `${m.partOfSpeech} ${m.meaning}`).join('\n')}\n\n【例文】\n${wordData.example.english}\n\n【学習ポイント】\n${wordData.learningPoints.join('\n')}`;
        const success = fallbackCopyTextToClipboard(text);
        if (success) { updateTab({ copySuccess: true }); setTimeout(() => updateTab({ copySuccess: false }), 2000); }
    };

    const handlePrintPDF = () => {
        if (!wordData) return;
        window.print();
    };

    const resetApp = () => {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        updateTab({
            wordInput: '', view: 'menu', tabName: 'ホーム', wordData: null, audioUrl: null, audioBlob: null,
            quizData: null, quizScore: 0, quizResults: []
        });
    };

    // --- Batch Processing Logic ---

    const updateBatchItemState = (itemId, changes) => {
        updateTab((prevTab) => {
            const currentBatchItems = prevTab.batchItems || initialBatchItems;
            const newBatchItems = currentBatchItems.map(item =>
                item.id === itemId ? { ...item, ...changes } : item
            );
            return { batchItems: newBatchItems };
        });
    };

    const generateWordDataForBatch = async (word) => {
        const systemPrompt = `あなたは優秀な英語学習アシスタントです。ユーザーが入力した英単語について、詳細で実践的な学習情報を提供してください。
必ず指定されたJSONスキーマに従って出力してください。
【指示】
1. meanings: 自動詞か他動詞か名詞か形容詞かなどを明記し、それぞれの場合の日本語訳と変化形（例：stride-strode-stridden）を確実なソースに基づき調査してください。
2. example: ユーザーが手動で例文を入力した場合は、その英文を使用し、適切な日本語訳を生成してください。自動生成の場合は、その単語の最も一般的な用法を示す例文を生成してください。
3. learningPoints: これが最も重要です。類義語、対義語、似ているスペルの単語との区別、派生語、特定の語法（前置詞との結びつきなど）を徹底的に調査し、複数のポイントを配列として出力してください。`;

        const userPrompt = `単語: ${word}\n例文の指定: AIによる自動生成`;

        const payload = {
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        word: { type: "STRING" },
                        phonetic: { type: "STRING" },
                        meanings: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    partOfSpeech: { type: "STRING" },
                                    meaning: { type: "STRING" },
                                    variations: { type: "STRING" }
                                },
                                required: ["partOfSpeech", "meaning", "variations"]
                            }
                        },
                        example: {
                            type: "OBJECT",
                            properties: {
                                english: { type: "STRING" },
                                japanese: { type: "STRING" }
                            },
                            required: ["english", "japanese"]
                        },
                        learningPoints: { type: "ARRAY", items: { type: "STRING" } }
                    },
                    required: ["word", "phonetic", "meanings", "example", "learningPoints"]
                }
            }
        };

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['x-gemini-api-key'] = apiKey;
        const response = await fetchWithRetryBatch(async () => {
            const res = await fetch(`/api/generate-word`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`API Error: ${res.status}`);
            return await res.json();
        });

        const textResp = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResp) return JSON.parse(textResp);
        throw new Error("Invalid response format");
    };

    const generateAudioForBatch = async (wordData) => {
        const textToRead = `単語。${wordData.word}。意味。${wordData.meanings.map(m => `${m.partOfSpeech}。${m.meaning}。${m.variations ? `変化形、${m.variations}。` : ''}`).join(' ')} 例文。${wordData.example.english} 日本語訳。${wordData.example.japanese} 学習のポイント。${wordData.learningPoints.join('。')}`;

        const payload = {
            contents: [{ parts: [{ text: textToRead }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } }
            },
            model: "gemini-2.5-flash-preview-tts"
        };

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['x-gemini-api-key'] = apiKey;
        const response = await fetchWithRetryBatch(async () => {
            const res = await fetch(`/api/generate-audio`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`API Error: ${res.status}`);
            return await res.json();
        });

        const audioDataObj = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (audioDataObj) {
            const { data, mimeType } = audioDataObj;
            const sampleRateMatch = mimeType.match(/rate=(\d+)/);
            const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000;
            const binaryString = atob(data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) { bytes[i] = binaryString.charCodeAt(i); }
            return pcmToWav(bytes.buffer, sampleRate);
        }
        throw new Error("No audio data returned");
    };

    const generateQuizForBatch = async (wordData) => {
        const systemPrompt = `あなたはプロの英語講師です。提供された「対象単語情報」に基づき、ユーザーの習得度を段階的に高める4レベルの英単語クイズ（計12問）をJSON形式で作成してください。
クオリティを最大化するため、以下のルールを厳守してください。
# 問題文の言語に関する重要ルール
- **「指示（コマンド）」は日本語**で作成してください（例：「"withstand"の意味として最も適切なものはどれですか？」、「次の空所に当てはまる単語を選びなさい」）。
- **英文の文脈を問う問題（レベル2の穴埋めなど）では、問題文の中に英文を直接提示してください。**
- 学習者が「何を問われているか」は日本語で瞬時に理解でき、かつ「英語の思考」が必要な部分はしっかりと英語で提示される、ハイブリッドな構成を目指してください。
- **英語を使うべきケース**: 
    - レベル2: 穴埋め問題のターゲットとなる「英文そのもの」。
    - レベル4: 英語の定義文を用いたクイズや、類義語のニュアンスを英語で説明・提示する場合。
- 不要な英語の指示（例："Choose the best answer"）は避け、日本語で指示してください。
# クイズ構成ルール
1. レベル1: 意味の理解（2問・初級）
2. レベル2: 意味の定着（3問・初級）
3. レベル3: 語法・変化形の理解（5問・中級）
4. レベル4: 発展的学習（2問・上級）
各設問には必ず explanation (解説) を含めてください。解説には「正解の理由」だけでなく、「他の選択肢がなぜ間違いか（またはその選択肢の意味）」も含め、詳細かつ学習効果の高い内容にしてください。
各設問の構造: question, options (4つ), correctIndex, explanation, level`;

        const userPrompt = `# 対象単語情報\n- 単語: ${wordData.word}\n- 主な意味: ${wordData.meanings.map(m => m.meaning).join(', ')}\n- 語源・学習のポイント: ${wordData.learningPoints.join(' / ')}\n- 例文: ${wordData.example.english} (${wordData.example.japanese})`;

        const payload = {
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        quizzes: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    question: { type: "STRING" },
                                    options: { type: "ARRAY", items: { type: "STRING" }, minItems: 4, maxItems: 4 },
                                    correctIndex: { type: "INTEGER" },
                                    explanation: { type: "STRING" },
                                    level: { type: "INTEGER" }
                                },
                                required: ["question", "options", "correctIndex", "explanation", "level"]
                            }
                        }
                    },
                    required: ["quizzes"]
                }
            }
        };

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['x-gemini-api-key'] = apiKey;
        const response = await fetchWithRetryBatch(async () => {
            const res = await fetch(`/api/generate-quiz`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`API Error: ${res.status}`);
            return await res.json();
        });

        const textResp = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResp) return JSON.parse(textResp).quizzes;
        throw new Error("Invalid response format");
    };

    const runBatchPipeline = async (item) => {
        try {
            const wordData = await generateWordDataForBatch(item.word);
            updateBatchItemState(item.id, { status: 'word_done', wordData });

            const promises = [];

            if (item.saveType === 'package') {
                updateBatchItemState(item.id, { audioStatus: 'generating' });
                promises.push(
                    generateAudioForBatch(wordData).then(audioBlob => {
                        updateBatchItemState(item.id, { audioStatus: 'done', audioBlob });
                    }).catch(err => {
                        console.error("Audio Error:", err);
                        updateBatchItemState(item.id, { audioStatus: 'error', errorMsg: '音声エラー' });
                    })
                );
            }

            if (item.includeQuiz) {
                updateBatchItemState(item.id, { quizStatus: 'generating' });
                promises.push(
                    generateQuizForBatch(wordData).then(quizData => {
                        updateBatchItemState(item.id, { quizStatus: 'done', quizData });
                    }).catch(err => {
                        console.error("Quiz Error:", err);
                        updateBatchItemState(item.id, { quizStatus: 'error', errorMsg: 'クイズエラー' });
                    })
                );
            }

            await Promise.all(promises);

        } catch (err) {
            console.error("Word Error:", err);
            updateBatchItemState(item.id, { status: 'word_error', errorMsg: '単語生成エラー' });
        }
    };

    const handleStartBatch = () => {
        const itemsToProcess = (batchItems || initialBatchItems).filter(item => item.word.trim() !== '');
        if (itemsToProcess.length === 0) return;

        const initializedItems = itemsToProcess.map(item => ({
            ...item,
            status: 'generating_word',
            audioStatus: item.saveType === 'package' ? 'idle' : 'none',
            quizStatus: item.includeQuiz ? 'idle' : 'none',
            errorMsg: null
        }));

        updateTab((prevTab) => {
            const currentBatch = prevTab.batchItems || initialBatchItems;
            const newBatch = currentBatch.map(item => {
                const initItem = initializedItems.find(i => i.id === item.id);
                return initItem ? initItem : item;
            });
            return { view: 'batch_progress', batchItems: newBatch };
        });

        initializedItems.forEach(item => {
            runBatchPipeline(item);
        });
    };

    const downloadHtmlOnly = (wordData) => {
        if (!wordData) return;
        const meaningsHtml = wordData.meanings.map(m => `
            <div class="meaning-item" style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; border-bottom: 1px solid #333; padding-bottom: 8px;">
                <span class="pos-tag" style="font-size: 11px; background: #262626; padding: 2px 6px; border-radius: 4px; color: #a3a3a3; border: 1px solid #404040;">${m.partOfSpeech}</span>
                <span class="meaning-text" style="font-size: 17px; color: #e5e5e5;">${m.meaning}</span>
                ${m.variations ? `<span class="variation-text" style="font-style: italic; font-size: 14px; color: #737373; margin-left: auto;">変化: ${m.variations}</span>` : ''}
            </div>
        `).join('');
        const pointsHtml = wordData.learningPoints.map(p => `<li class="point-item" style="margin-bottom: 8px;">${p}</li>`).join('');

        const htmlContent = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>Lexicon - ${wordData.word}</title><style>body { font-family: sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; justify-content: center; padding: 20px; } .card { background: #171717; border: 1px solid #262626; border-radius: 16px; padding: 40px; max-width: 500px; width: 100%; } .word { font-size: 42px; text-align: center; color: #fff; margin: 0; } .phonetic { text-align: center; color: #d4af37; margin-bottom: 20px; } .label { font-size: 10px; color: #737373; text-transform: uppercase; margin-top: 24px; margin-bottom: 10px; } .example { background: #000; padding: 15px; border-radius: 8px; border-left: 3px solid #d4af37; }</style></head><body><div class="card"><h1 class="word">${wordData.word}</h1><p class="phonetic">/${wordData.phonetic}/</p><div class="label">意味</div>${meaningsHtml}<div class="label">例文</div><div class="example"><div class="ex-en">${wordData.example.english}</div><div class="ex-ja" style="color: #777; font-size: 13px; margin-top: 5px;">${wordData.example.japanese}</div></div><div class="label">ポイント</div><ul>${pointsHtml}</ul></div></body></html>`;

        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(htmlBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Lexicon_${wordData.word}_Light.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const downloadPackageBatch = (wordData, audioBlob) => {
        if (!wordData || !audioBlob) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Audio = reader.result;
            const meaningsHtml = wordData.meanings.map(m => `
                <div class="meaning-item" style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; border-bottom: 1px solid #333; padding-bottom: 8px;">
                    <span class="pos-tag" style="font-size: 11px; background: #262626; padding: 2px 6px; border-radius: 4px; color: #a3a3a3; border: 1px solid #404040;">${m.partOfSpeech}</span>
                    <span class="meaning-text" style="font-size: 17px; color: #e5e5e5;">${m.meaning}</span>
                    ${m.variations ? `<span class="variation-text" style="font-style: italic; font-size: 14px; color: #737373; margin-left: auto;">変化: ${m.variations}</span>` : ''}
                </div>
            `).join('');
            const pointsHtml = wordData.learningPoints.map(p => `<li class="point-item" style="margin-bottom: 8px;">${p}</li>`).join('');

            const htmlContent = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>Lexicon - ${wordData.word}</title><style>body { font-family: sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; justify-content: center; padding: 20px; } .card { background: #171717; border: 1px solid #262626; border-radius: 16px; padding: 40px; max-width: 500px; width: 100%; } .word { font-size: 42px; text-align: center; color: #fff; margin: 0; } .phonetic { text-align: center; color: #d4af37; margin-bottom: 20px; } .label { font-size: 10px; color: #737373; text-transform: uppercase; margin-top: 24px; margin-bottom: 10px; } .example { background: #000; padding: 15px; border-radius: 8px; border-left: 3px solid #d4af37; } audio { width: 100%; margin-top: 20px; opacity: 0.5; }</style></head><body><div class="card"><h1 class="word">${wordData.word}</h1><p class="phonetic">/${wordData.phonetic}/</p><div class="label">意味</div>${meaningsHtml}<div class="label">例文</div><div class="example"><div class="ex-en">${wordData.example.english}</div><div class="ex-ja" style="color: #777; font-size: 13px; margin-top: 5px;">${wordData.example.japanese}</div></div><div class="label">ポイント</div><ul>${pointsHtml}</ul><audio controls><source src="${base64Audio}" type="audio/wav"></audio></div></body></html>`;

            const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(htmlBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Lexicon_${wordData.word}_FullPackage.html`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };
        reader.readAsDataURL(audioBlob);
    };

    const downloadQuizTextBatch = (wordData, quizData) => {
        if (!wordData || !quizData) return;
        let text = `【Lexicon学習クイズ・解答解説シート】\n`;
        text += `対象単語: ${wordData.word}\n`;
        text += `作成日: ${new Date().toLocaleDateString()}\n`;
        text += `==========================================\n\n`;

        quizData.forEach((q, idx) => {
            text += `[Level ${q.level}] Q${idx + 1}: ${q.question}\n`;
            q.options.forEach((opt, i) => {
                text += `  ${String.fromCharCode(65 + i)}) ${opt}\n`;
            });
            text += `\n【正解】 ${String.fromCharCode(65 + q.correctIndex)}\n`;
            text += `【解説】 ${q.explanation}\n`;
            text += `------------------------------------------\n\n`;
        });

        text += `Generated by Lexicon AI`;

        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Lexicon_${wordData.word}_Quiz_Lightweight.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };


    if (view === 'menu') return (
        <div className="flex flex-col items-center justify-center h-full min-h-[70vh] animate-fade-in px-4">
            <div className="mb-10 text-center">
                <div className="inline-flex items-center justify-center p-4 mb-6 rounded-full bg-neutral-800 border border-[#d4af37]/30 shadow-[0_0_15px_rgba(212,175,55,0.15)]">
                    <BookOpen size={48} className="text-[#d4af37]" />
                </div>
                <h1 className="text-4xl md:text-5xl font-serif font-light text-neutral-100 tracking-wider mb-2">Lexicon</h1>
                <p className="text-neutral-400 font-light tracking-widest text-sm md:text-base uppercase">AI Intelligent Vocabulary</p>
            </div>
            <div className="flex flex-col gap-4 w-full max-w-xs">
                <button onClick={() => updateTab({ view: 'create' })} className="px-8 py-4 bg-neutral-100 text-neutral-950 font-medium rounded-sm hover:bg-[#d4af37] transition-all shadow-lg flex items-center justify-center gap-2"><Edit3 size={18} />新規作成する</button>
                <button onClick={() => updateTab({ view: 'batch_setup' })} className="px-8 py-4 bg-neutral-900 border border-neutral-700 text-neutral-300 font-medium rounded-sm hover:border-[#d4af37] hover:text-[#d4af37] transition-all shadow-lg flex items-center justify-center gap-2"><Package size={18} />まとめて生成する</button>
                <button onClick={() => fileInputRef.current?.click()} className="px-8 py-4 bg-neutral-900 border border-neutral-700 text-neutral-300 font-medium rounded-sm hover:border-[#d4af37] hover:text-[#d4af37] transition-all shadow-lg flex items-center justify-center gap-2"><Upload size={18} />HTMLから復元</button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".html" className="hidden" />
                <button onClick={() => updateTab({ showSettingsModal: true })} className="mt-4 px-8 py-3 bg-transparent text-neutral-500 font-medium hover:text-neutral-300 transition-all flex items-center justify-center gap-2"><Settings size={16} /> APIキー設定</button>
            </div>
            {tabData.showSettingsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
                    <div className="bg-neutral-900 p-8 rounded-lg max-w-md w-full border border-neutral-800 shadow-2xl">
                        <h3 className="text-xl text-neutral-100 mb-2 font-serif flex items-center gap-2"><Settings size={20} className="text-[#d4af37]" /> 設定</h3>
                        <p className="text-neutral-400 text-sm mb-6">ご自身のGemini APIキーを入力することで、独自の制限枠でアプリを利用できます。空欄の場合は共有キーが使用されます。</p>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-neutral-400 mb-2">Gemini API Key</label>
                            <input type="password" value={tabData.tempApiKey !== undefined ? tabData.tempApiKey : apiKey} onChange={(e) => updateTab({ tempApiKey: e.target.value })} placeholder="AIzaSy..." className="w-full bg-neutral-950 border border-neutral-700 rounded-md px-4 py-3 text-neutral-100 font-mono text-sm focus:outline-none focus:border-[#d4af37] transition-all" />
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => updateTab({ showSettingsModal: false, tempApiKey: undefined })} className="flex-1 py-3 border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors rounded">キャンセル</button>
                            <button onClick={() => {
                                const newKey = tabData.tempApiKey !== undefined ? tabData.tempApiKey : apiKey;
                                tabData.saveApiKey(newKey);
                                updateTab({ showSettingsModal: false, tempApiKey: undefined });
                            }} className="flex-1 py-3 bg-[#d4af37] hover:bg-[#b8962d] text-neutral-950 font-bold transition-colors rounded">保存する</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    if (view === 'batch_setup') return (
        <div className="max-w-4xl mx-auto pt-12 pb-24 px-4 animate-fade-in">
            <button onClick={() => updateTab({ view: 'menu' })} className="flex items-center gap-2 text-neutral-400 hover:text-[#d4af37] transition-colors mb-8 font-light text-sm"><ChevronLeft size={16} /> メインメニューへ</button>
            <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-lg shadow-2xl">
                <h2 className="text-2xl font-serif text-neutral-100 mb-8 border-b border-neutral-800 pb-4">まとめて生成（最大3つ）</h2>
                <div className="space-y-6">
                    {batchItems.map((item, index) => (
                        <div key={item.id} className="p-6 bg-neutral-950 border border-neutral-800 rounded-md">
                            <div className="flex flex-col md:flex-row gap-6">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-neutral-400 mb-2">単語 {index + 1}</label>
                                    <input type="text" value={item.word} onChange={(e) => updateBatchItemState(item.id, { word: e.target.value })} placeholder="英単語を入力" className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-4 py-3 text-neutral-100 focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] transition-all" />
                                </div>
                                <div className="flex-1 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-400 mb-2">保存方法</label>
                                        <div className="flex gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={item.saveType === 'html'} onChange={() => updateBatchItemState(item.id, { saveType: 'html' })} className="text-[#d4af37] focus:ring-[#d4af37] bg-neutral-900 border-neutral-700" /><span className="text-neutral-300 text-sm">音声なしHTML</span></label>
                                            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={item.saveType === 'package'} onChange={() => updateBatchItemState(item.id, { saveType: 'package' })} className="text-[#d4af37] focus:ring-[#d4af37] bg-neutral-900 border-neutral-700" /><span className="text-neutral-300 text-sm">音声付きパッケージ</span></label>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-2 cursor-pointer mt-2">
                                            <input type="checkbox" checked={item.includeQuiz} onChange={(e) => updateBatchItemState(item.id, { includeQuiz: e.target.checked })} className="rounded text-[#d4af37] focus:ring-[#d4af37] bg-neutral-900 border-neutral-700" />
                                            <span className="text-neutral-300 text-sm">クイズ解答解説テキストを生成する</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-8">
                    <button onClick={handleStartBatch} disabled={!batchItems.some(i => i.word.trim() !== '')} className="w-full py-4 bg-[#d4af37] text-neutral-950 font-bold text-lg rounded-sm hover:bg-[#b8962d] transition-colors flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">まとめて生成！ <ChevronLeft size={18} className="rotate-180" /></button>
                </div>
            </div>
        </div>
    );

    if (view === 'batch_progress') return (
        <div className="max-w-4xl mx-auto pt-12 pb-24 px-4 animate-fade-in">
            <button onClick={() => updateTab({ view: 'menu' })} className="flex items-center gap-2 text-neutral-400 hover:text-[#d4af37] transition-colors mb-8 font-light text-sm"><ChevronLeft size={16} /> メインメニューへ戻る</button>
            <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-lg shadow-2xl">
                <div className="mb-8 border-b border-neutral-800 pb-4">
                    <h2 className="text-2xl font-serif text-neutral-100 mb-2">生成進捗</h2>
                    <p className="text-sm text-neutral-400">※生成には時間がかかります（単語帳: 約30秒、音声: 最大2分、クイズ: 約1分）。完了したものから順次ダウンロードが可能です。</p>
                </div>
                <div className="space-y-6">
                    {batchItems.filter(i => i.status !== 'idle').map((item, index) => (
                        <div key={item.id} className="p-6 bg-neutral-950 border border-neutral-800 rounded-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-neutral-100">{item.word}</h3>
                                <div className="text-sm text-neutral-400 mt-2 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span>単語帳:</span>
                                        {item.status === 'generating_word' ? <span className="text-yellow-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> 生成中...</span> :
                                            item.status === 'word_done' ? <span className="text-green-500 flex items-center gap-1"><Check size={12} /> 完了</span> :
                                                <span className="text-red-500 flex items-center gap-1"><AlertCircle size={12} /> エラー</span>}
                                    </div>
                                    {item.saveType === 'package' && (
                                        <div className="flex items-center gap-2">
                                            <span>音声:</span>
                                            {item.audioStatus === 'idle' ? <span className="text-neutral-500">待機中</span> :
                                                item.audioStatus === 'generating' ? <span className="text-yellow-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> 生成中...</span> :
                                                    item.audioStatus === 'done' ? <span className="text-green-500 flex items-center gap-1"><Check size={12} /> 完了</span> :
                                                        <span className="text-red-500 flex items-center gap-1"><AlertCircle size={12} /> エラー</span>}
                                        </div>
                                    )}
                                    {item.includeQuiz && (
                                        <div className="flex items-center gap-2">
                                            <span>クイズ:</span>
                                            {item.quizStatus === 'idle' ? <span className="text-neutral-500">待機中</span> :
                                                item.quizStatus === 'generating' ? <span className="text-yellow-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> 生成中...</span> :
                                                    item.quizStatus === 'done' ? <span className="text-green-500 flex items-center gap-1"><Check size={12} /> 完了</span> :
                                                        <span className="text-red-500 flex items-center gap-1"><AlertCircle size={12} /> エラー</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 w-full md:w-auto">
                                {item.saveType === 'html' && item.status === 'word_done' && (
                                    <button onClick={() => downloadHtmlOnly(item.wordData)} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm rounded flex items-center justify-center gap-2"><Download size={14} /> 単語帳HTMLを保存</button>
                                )}
                                {item.saveType === 'package' && item.audioStatus === 'done' && (
                                    <button onClick={() => downloadPackageBatch(item.wordData, item.audioBlob)} className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8962d] text-neutral-950 font-bold text-sm rounded flex items-center justify-center gap-2"><Package size={14} /> 音声パッケージ保存</button>
                                )}
                                {item.includeQuiz && item.quizStatus === 'done' && (
                                    <button onClick={() => downloadQuizTextBatch(item.wordData, item.quizData)} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm rounded flex items-center justify-center gap-2"><FileText size={14} /> クイズテキスト保存</button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    if (view === 'create') return (
        <div className="max-w-2xl mx-auto pt-12 pb-24 px-4 animate-fade-in">
            <button onClick={() => updateTab({ view: 'menu' })} className="flex items-center gap-2 text-neutral-400 hover:text-[#d4af37] transition-colors mb-8 font-light text-sm"><ChevronLeft size={16} /> メインメニューへ</button>
            <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-lg shadow-2xl">
                <h2 className="text-2xl font-serif text-neutral-100 mb-8 border-b border-neutral-800 pb-4">新規単語の登録</h2>
                <div className="space-y-8">
                    <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-2">単語入力</label>
                        <input type="text" value={wordInput} onChange={(e) => updateTab({ wordInput: e.target.value })} placeholder="例: stride, expect" className="w-full bg-neutral-950 border border-neutral-700 rounded-md px-4 py-3 text-neutral-100 focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] transition-all" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-3">例文の作成方法</label>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <label className={`flex-1 flex items-center gap-3 p-4 border rounded-md cursor-pointer transition-all ${exampleType === 'auto' ? 'border-[#d4af37] bg-neutral-950' : 'border-neutral-700 bg-neutral-900 hover:border-neutral-500'}`}><input type="radio" checked={exampleType === 'auto'} onChange={() => updateTab({ exampleType: 'auto' })} className="hidden" /><div className={`w-4 h-4 rounded-full border flex items-center justify-center ${exampleType === 'auto' ? 'border-[#d4af37]' : 'border-neutral-500'}`}>{exampleType === 'auto' && <div className="w-2 h-2 rounded-full bg-[#d4af37]" />}</div><span className={exampleType === 'auto' ? 'text-neutral-100' : 'text-neutral-400'}>自動生成</span></label>
                            <label className={`flex-1 flex items-center gap-3 p-4 border rounded-md cursor-pointer transition-all ${exampleType === 'manual' ? 'border-[#d4af37] bg-neutral-950' : 'border-neutral-700 bg-neutral-900 hover:border-neutral-500'}`}><input type="radio" checked={exampleType === 'manual'} onChange={() => updateTab({ exampleType: 'manual' })} className="hidden" /><div className={`w-4 h-4 rounded-full border flex items-center justify-center ${exampleType === 'manual' ? 'border-[#d4af37]' : 'border-neutral-500'}`}>{exampleType === 'manual' && <div className="w-2 h-2 rounded-full bg-[#d4af37]" />}</div><span className={exampleType === 'manual' ? 'text-neutral-100' : 'text-neutral-400'}>手動入力</span></label>
                        </div>
                    </div>
                    <button onClick={handleCreate} disabled={!wordInput.trim()} className="w-full py-4 bg-neutral-100 text-neutral-950 font-medium rounded-sm hover:bg-[#d4af37] transition-colors flex justify-center items-center gap-2">作成！ <ChevronLeft size={18} className="rotate-180" /></button>
                </div>
            </div>
        </div>
    );

    if (view === 'loading') return <div className="flex flex-col items-center justify-center h-full min-h-[60vh]"><Loader2 size={48} className="text-[#d4af37] animate-spin mb-6" /><h3 className="text-xl font-serif text-neutral-200">AIが徹底調査中...</h3></div>;
    if (view === 'loading_quiz') return <div className="flex flex-col items-center justify-center h-full min-h-[60vh]"><BrainCircuit size={48} className="text-[#d4af37] animate-pulse mb-6" /><h3 className="text-xl font-serif text-neutral-200">クイズを作成中...</h3></div>;

    if (view === 'result') return (
        <div className="max-w-3xl mx-auto pt-8 pb-24 px-4 animate-fade-in">
            <div className="no-print flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
                <button onClick={() => updateTab({ showConfirmModal: true })} className="flex items-center gap-2 text-neutral-400 hover:text-[#d4af37] transition-colors font-light text-sm"><ChevronLeft size={16} /> 単語帳作成画面へ</button>
                <div className="flex flex-wrap gap-3">
                    <button onClick={handleCopyText} className="flex items-center gap-2 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-300 hover:bg-neutral-700 transition-colors">{copySuccess ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}コピー</button>
                    <button onClick={handlePrintPDF} className="flex items-center gap-2 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-300 hover:bg-neutral-700 transition-colors"><FileText size={16} /> PDF保存</button>
                    {audioBlob && <button onClick={handleDownloadPackage} className="flex items-center gap-2 px-4 py-2 bg-[#d4af37] rounded-md text-sm text-neutral-950 font-bold hover:bg-[#b8962d]"><Package size={16} /> パッケージ保存</button>}
                </div>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 p-8 md:p-12 rounded-lg shadow-2xl">
                <div className="text-center mb-12">
                    <h1 className="text-5xl md:text-6xl font-serif text-neutral-100 mb-4 tracking-wide">{wordData.word}</h1>
                    <p className="text-lg text-[#d4af37] font-light">/{wordData.phonetic}/</p>
                </div>
                <div className="mb-10">
                    <h3 className="text-xs font-bold tracking-widest text-neutral-500 uppercase mb-4">意味・品詞</h3>
                    <div className="space-y-4">
                        {wordData.meanings.map((m, idx) => (
                            <div key={idx} className="flex flex-col sm:flex-row sm:items-baseline gap-2 pb-4 border-b border-neutral-800/50 last:border-0">
                                <span className="shrink-0 px-2 py-1 bg-neutral-800 text-neutral-300 text-xs rounded border border-neutral-700">{m.partOfSpeech}</span>
                                <span className="text-neutral-200 text-lg flex-1">{m.meaning}</span>
                                {m.variations && <span className="text-sm text-neutral-500 italic">変化: {m.variations}</span>}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="mb-10 bg-neutral-950 p-6 rounded-md border border-neutral-800/50">
                    <h3 className="text-xs font-bold tracking-widest text-neutral-500 uppercase mb-4">例文</h3>
                    <p className="text-neutral-100 text-lg mb-3 font-serif">{wordData.example.english}</p>
                    <p className="text-neutral-400 text-sm">{wordData.example.japanese}</p>
                </div>
                <div className="mb-10"><h3 className="text-xs font-bold tracking-widest text-neutral-500 uppercase mb-4">学習のポイント</h3><ul className="space-y-3">{wordData.learningPoints.map((p, i) => <li key={i} className="flex items-start gap-3 text-neutral-300"><span className="text-[#d4af37] mt-1">•</span><span>{p}</span></li>)}</ul></div>
                <div className="no-print pt-8 border-t border-neutral-800 flex flex-col items-center gap-6">
                    <button onClick={handleGenerateQuiz} className="flex items-center gap-3 px-10 py-4 bg-neutral-100 hover:bg-[#d4af37] text-neutral-950 rounded-full transition-all font-bold"><BrainCircuit size={20} /> AI習得クイズに挑戦する</button>
                    {!audioUrl ? <button onClick={handleGenerateAudio} disabled={isGeneratingAudio} className="flex items-center gap-3 px-8 py-3 bg-neutral-800 text-neutral-200 rounded-full">{isGeneratingAudio ? <Loader2 size={18} className="animate-spin text-[#d4af37]" /> : <Volume2 size={18} className="text-[#d4af37]" />}{isGeneratingAudio ? '生成中...' : '音声を生成'}</button> : <div className="flex gap-4"><button onClick={() => audioRef.current?.play()} className="w-12 h-12 flex items-center justify-center bg-neutral-100 text-neutral-900 rounded-full hover:bg-[#d4af37]"><Play size={20} className="ml-1" /></button><audio ref={audioRef} src={audioUrl} className="hidden" /></div>}
                </div>
            </div>
            {showConfirmModal && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"><div className="bg-neutral-900 p-8 rounded-lg max-w-sm w-full"><h3 className="text-xl text-neutral-100 mb-4">確認</h3><p className="text-neutral-400 text-sm mb-8">データを破棄して戻りますか？</p><div className="flex gap-4"><button onClick={() => updateTab({ showConfirmModal: false })} className="flex-1 py-3 border border-neutral-700 text-neutral-300 rounded">キャンセル</button><button onClick={resetApp} className="flex-1 py-3 bg-red-900 text-white rounded">はい</button></div></div></div>}
        </div>
    );

    if (view === 'quiz') {
        const currentQuiz = quizData[currentQuizIndex];
        return (
            <div className="max-w-2xl mx-auto pt-12 pb-24 px-4 animate-fade-in">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <span className="text-xs text-[#d4af37] font-bold tracking-widest uppercase">Level {currentQuiz.level}</span>
                        <h2 className="text-neutral-100 text-xl font-serif">Question {currentQuizIndex + 1} of {quizData.length}</h2>
                    </div>
                    <div className="w-32 h-2 bg-neutral-800 rounded-full overflow-hidden"><div className="h-full bg-[#d4af37] transition-all" style={{ width: `${((currentQuizIndex + 1) / quizData.length) * 100}%` }} /></div>
                </div>

                <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-lg shadow-2xl mb-8">
                    <p className="text-neutral-100 text-lg md:text-xl leading-relaxed mb-10 whitespace-pre-wrap">{currentQuiz.question}</p>
                    <div className="grid grid-cols-1 gap-4">
                        {currentQuiz.options.map((option, idx) => {
                            let style = "bg-neutral-950 border-neutral-700 text-neutral-300";
                            if (showQuizFeedback) {
                                if (idx === currentQuiz.correctIndex) style = "bg-green-900/20 border-green-500 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.1)]";
                                else if (idx === selectedOptionIndex) style = "bg-red-900/20 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]";
                                else style = "opacity-40 border-neutral-800 text-neutral-600";
                            } else {
                                style += " hover:border-[#d4af37] hover:text-[#d4af37]";
                            }
                            return (
                                <button key={idx} onClick={() => handleAnswerQuiz(idx)} disabled={showQuizFeedback} className={`w-full p-4 border rounded-md text-left transition-all flex items-center gap-4 ${style}`}>
                                    <span className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-xs font-bold ${showQuizFeedback && idx === currentQuiz.correctIndex ? 'bg-green-500 text-neutral-950' : 'bg-neutral-800'}`}>{String.fromCharCode(65 + idx)}</span>
                                    <span className="text-base">{option}</span>
                                </button>
                            );
                        })}
                    </div>

                    {showQuizFeedback && (
                        <div className="mt-8 p-6 bg-neutral-950 rounded-md border-l-4 border-[#d4af37] animate-fade-in">
                            <div className="flex items-center gap-2 mb-4">
                                {selectedOptionIndex === currentQuiz.correctIndex ? <Check className="text-green-500" /> : <X className="text-red-500" />}
                                <span className={`font-bold ${selectedOptionIndex === currentQuiz.correctIndex ? 'text-green-500' : 'text-red-500'}`}>
                                    {selectedOptionIndex === currentQuiz.correctIndex ? '正解！' : '不正解'}
                                </span>
                            </div>
                            <div className="text-sm text-neutral-400 leading-relaxed mb-6 whitespace-pre-wrap">
                                <span className="block font-bold text-neutral-300 mb-2 underline decoration-[#d4af37]/30">解説</span>
                                {currentQuiz.explanation}
                            </div>
                            <button onClick={handleNextQuiz} className="w-full py-3 bg-[#d4af37] text-neutral-950 font-bold rounded hover:bg-[#b8962d] flex items-center justify-center gap-2">
                                {currentQuizIndex === quizData.length - 1 ? '結果を見る' : '次の問題へ'} <ArrowRight size={18} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (view === 'quiz_result') {
        const getRank = (score) => {
            if (score === 120) return { label: 'Master', color: 'text-yellow-400', desc: '完璧です！実戦で使いましょう' };
            if (score >= 90) return { label: 'Expert', color: 'text-[#d4af37]', desc: 'あと一息！語法を再確認' };
            if (score >= 60) return { label: 'Learner', color: 'text-blue-400', desc: '定着まであと少し。レベル3を復習' };
            return { label: 'Novice', color: 'text-red-400', desc: 'まずはレベル1・2を確実に' };
        };
        const rank = getRank(quizScore);

        return (
            <div className="max-w-3xl mx-auto pt-8 pb-24 px-4 animate-fade-in">
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center p-6 rounded-full bg-neutral-900 border border-neutral-800 shadow-xl mb-6"><Trophy size={64} className={rank.color} /></div>
                    <h2 className="text-4xl font-serif text-neutral-100 mb-2">{quizScore} / 120</h2>
                    <p className={`text-2xl font-bold ${rank.color} mb-2 tracking-widest`}>{rank.label}</p>
                    <p className="text-neutral-500">{rank.desc}</p>

                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <button onClick={handleDownloadLightweightText} className="flex items-center gap-2 px-5 py-2.5 bg-[#d4af37] rounded-md text-sm text-neutral-950 font-bold hover:bg-[#b8962d] transition-all"><FileText size={16} /> 軽量版テキスト (一括)</button>
                        <div className="h-10 w-[1px] bg-neutral-800 mx-1 hidden sm:block"></div>
                        <button onClick={() => handleDownloadQuizPackage(false)} className="flex items-center gap-2 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-xs text-neutral-300 hover:border-[#d4af37]"><Download size={14} /> HTMLクイズ</button>
                        <button onClick={() => handleDownloadQuizPackage(true)} className="flex items-center gap-2 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-xs text-neutral-300 hover:border-[#d4af37]"><Download size={14} /> HTML解答解説</button>
                    </div>
                    <p className="text-[10px] text-neutral-600 mt-4 uppercase tracking-tighter">※軽量版は音声や複雑な装飾を含まないため、非常に小さな容量で保存可能です。</p>
                </div>

                <div className="space-y-6 mb-12">
                    {quizResults.map((res, idx) => (
                        <div key={idx} className={`p-6 border rounded-lg ${res.isCorrect ? 'bg-green-950/10 border-green-900/30' : 'bg-red-950/10 border-red-900/30'}`}>
                            <div className="flex items-start gap-3 mb-4">
                                {res.isCorrect ? <Check className="text-green-500 shrink-0 mt-1" size={20} /> : <X className="text-red-500 shrink-0 mt-1" size={20} />}
                                <p className="text-neutral-200 font-medium">Q{idx + 1}: {res.question}</p>
                            </div>
                            <div className="text-sm text-neutral-400 bg-neutral-950/50 p-4 rounded border border-neutral-800/50 leading-relaxed italic">{res.explanation}</div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button onClick={() => updateTab({ view: 'result' })} className="px-8 py-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md flex items-center justify-center gap-2"><BookOpen size={18} /> 単語帳に戻る</button>
                    <button onClick={handleGenerateQuiz} className="px-8 py-4 bg-[#d4af37] hover:bg-[#b8962d] text-neutral-950 font-bold rounded-md flex items-center justify-center gap-2"><RefreshCw size={18} /> もう一度挑戦</button>
                </div>
            </div>
        );
    }
    return null;
}

export default function App() {
    const [apiKey, setApiKey] = useState(() => {
        return localStorage.getItem('lexicon_gemini_api_key') || "";
    });

    const saveApiKey = (key) => {
        setApiKey(key);
        localStorage.setItem('lexicon_gemini_api_key', key);
    };

    const [tabs, setTabs] = useState([
        { id: crypto.randomUUID(), tabName: 'ホーム', view: 'menu', wordInput: '', exampleType: 'auto', manualExample: '', wordData: null, audioUrl: null, audioBlob: null, isGeneratingAudio: false, errorMsg: null, showConfirmModal: false, showSettingsModal: false, copySuccess: false, quizData: null, currentQuizIndex: 0, quizScore: 0, quizResults: [], isGeneratingQuiz: false, showQuizFeedback: false, selectedOptionIndex: null, batchItems: initialBatchItems }
    ]);
    const [activeTabId, setActiveTabId] = useState(tabs[0].id);

    // コールバック関数も受け取れるようにアップデート関数を拡張（既存のロジックを崩さず適応）
    const updateTab = (tabId, newData) => {
        setTabs(prev => prev.map(tab => {
            if (tab.id === tabId) {
                const updates = typeof newData === 'function' ? newData(tab) : newData;
                return { ...tab, ...updates };
            }
            return tab;
        }));
    };

    const addTab = () => {
        if (tabs.length >= 3) return;
        const newTab = { id: crypto.randomUUID(), tabName: 'ホーム', view: 'menu', wordInput: '', exampleType: 'auto', manualExample: '', wordData: null, audioUrl: null, audioBlob: null, isGeneratingAudio: false, errorMsg: null, showConfirmModal: false, showSettingsModal: false, copySuccess: false, quizData: null, currentQuizIndex: 0, quizScore: 0, quizResults: [], isGeneratingQuiz: false, showQuizFeedback: false, selectedOptionIndex: null, batchItems: initialBatchItems };
        setTabs([...tabs, newTab]); setActiveTabId(newTab.id);
    };

    const closeTab = (e, tabId) => { e.stopPropagation(); if (tabs.length === 1) return; const remainingTabs = tabs.filter(t => t.id !== tabId); setTabs(remainingTabs); if (activeTabId === tabId) setActiveTabId(remainingTabs[remainingTabs.length - 1].id); };

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-[#d4af37]/30 selection:text-[#d4af37]">
            <div className="no-print bg-neutral-900/50 border-b border-neutral-900 px-4 pt-3 flex items-end gap-1 overflow-x-auto scrollbar-hide">
                {tabs.map(tab => (
                    <div key={tab.id} onClick={() => setActiveTabId(tab.id)} className={`group relative flex items-center gap-2 px-4 py-2 min-w-[100px] max-w-[160px] cursor-pointer rounded-t-md transition-all text-sm border-x border-t ${activeTabId === tab.id ? 'bg-neutral-950 border-neutral-800 text-[#d4af37]' : 'bg-neutral-900/30 border-transparent text-neutral-500 hover:bg-neutral-800/50'}`}>
                        <span className="truncate flex-1 font-medium">{tab.tabName}</span>
                        {tabs.length > 1 && <X size={14} className="shrink-0 hover:bg-neutral-700 rounded-full p-0.5 transition-colors" onClick={(e) => closeTab(e, tab.id)} />}
                    </div>
                ))}
                {tabs.length < 3 && <button onClick={addTab} className="mb-1.5 p-1.5 hover:bg-neutral-800 rounded-full text-neutral-500 transition-colors ml-1"><Plus size={16} /></button>}
            </div>
            <main>{tabs.map(tab => <div key={tab.id} className={activeTabId === tab.id ? "block" : "hidden"}><TabContent tabData={{ ...tab, saveApiKey }} updateTab={(data) => updateTab(tab.id, data)} apiKey={apiKey} /></div>)}</main>
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                @media print { .no-print { display: none !important; } }
            `}} />
        </div>
    );
}