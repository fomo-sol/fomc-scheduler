import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import axios from "axios";
import { removeUselessTags, removeDisplayNone } from "./libs/preprocessor.js";
import { PositionBasedTranslationParser } from "./libs/parser.js";

const API_KEY = process.env.DEEPL_API_KEY;
const ENDPOINT = "https://api-free.deepl.com/v2/translate";
const sourceLang = "EN";
const targetLang = "KO";

export async function runTranslatePipeline(inputHtmlPath) {
  const resolvedPath = path.resolve(process.cwd(), inputHtmlPath);
  const baseName = path.basename(inputHtmlPath, ".html");

  const baseDir = "data";

  // === Step 1: 원본 HTML 읽기 ===
  const raw = fs.readFileSync(resolvedPath, "utf8");

  // === Step 2: <TEXT> 태그 내부 추출 ===
  const match = raw.match(/<TEXT>([\s\S]*?)<\/TEXT>/i);
  if (!match) {
    console.error("❌ <TEXT> 블록을 찾을 수 없습니다.");
    return;
  }
  const htmlBody = match[1];
  // console.log(htmlBody);

  // === Step 3: 전처리 및 저장 ===
  let preprocessed = removeDisplayNone(htmlBody);
  preprocessed = removeUselessTags(preprocessed);

  const preprocessedPath = `${baseDir}/preprocessed/${baseName}_clean.html`;
  fs.mkdirSync(path.dirname(preprocessedPath), { recursive: true });
  fs.writeFileSync(preprocessedPath, preprocessed, "utf-8");

  // === Step 4: 파서로 세그먼트 추출 ===
  const parser = new PositionBasedTranslationParser(htmlBody);
  const result = parser.extractTextsWithPositions();

  const joinedPath = `${baseDir}/segments/${baseName}_joined.txt`;
  const parserJsonPath = `${baseDir}/segments/${baseName}_parser.json`;

  fs.mkdirSync(path.dirname(joinedPath), { recursive: true });
  fs.writeFileSync(
    joinedPath,
    result.segments.map((s) => s.text).join("\n\n␟\n\n"),
    "utf-8"
  );
  fs.writeFileSync(parserJsonPath, JSON.stringify(parser), "utf-8");

  console.log(`✅ 세그먼트 추출 완료: ${result.segments.length}개`);

  // === Step 5: 번역 요청 ===
  console.log(`🌐 DeepL 번역 요청 중...`);

  const textToTranslate = fs.readFileSync(joinedPath, "utf-8");
  let translatedText = "";

  try {
    const response = await axios.post(
      ENDPOINT,
      new URLSearchParams({
        auth_key: API_KEY,
        text: textToTranslate,
        source_lang: sourceLang,
        target_lang: targetLang,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    translatedText = response.data.translations[0].text;
  } catch (err) {
    console.error("❌ 번역 실패:", err.response?.data || err.message);
    return;
  }

  const translatedTextPath = `${baseDir}/translations/${baseName}_translated.txt`;
  fs.mkdirSync(path.dirname(translatedTextPath), { recursive: true });
  fs.writeFileSync(translatedTextPath, translatedText, "utf-8");

  console.log(`✅ 번역 저장 완료: ${translatedTextPath}`);

  // === Step 6: HTML 재구성 ===
  console.log(`🔧 번역 HTML 재구성 중...`);

  const translatedSegments = translatedText
    .replaceAll("\r\n", "\n")
    .split("\n\n␟\n\n");

  const parserObj = JSON.parse(fs.readFileSync(parserJsonPath, "utf-8"));
  const originalHtml = fs.readFileSync(preprocessedPath, "utf-8");

  const restoreParser = new PositionBasedTranslationParser(originalHtml);
  restoreParser.textSegments = parserObj.textSegments;

  const translationMap = {};
  restoreParser.textSegments.forEach((seg, idx) => {
    translationMap[seg.id] = translatedSegments[idx] || seg.text;
  });

  const resultHtml = restoreParser.reconstructHtml(translationMap);
  const outputHtmlPath = `${baseDir}/translated/${baseName}_translated.html`;
  fs.mkdirSync(path.dirname(outputHtmlPath), { recursive: true });
  fs.writeFileSync(outputHtmlPath, resultHtml, "utf-8");

  console.log(`🎉 최종 번역 HTML 저장 완료: ${outputHtmlPath}`);
}
