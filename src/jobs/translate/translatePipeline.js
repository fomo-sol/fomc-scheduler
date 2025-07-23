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

  const baseDir = "src/jobs/translate/data";

  // Paths
  const preprocessedPath = `${baseDir}/preprocessed/${baseName}_clean.html`;
  const joinedPath = `${baseDir}/segments/${baseName}_joined.txt`;
  const parserJsonPath = `${baseDir}/segments/${baseName}_parser.json`;
  const translatedTextPath = `${baseDir}/translations/${baseName}_translated.txt`;
  const outputHtmlPath = `${baseDir}/translated/${baseName}_translated.html`;

  console.log(`step [1/3] 전처리 및 세그먼트 추출: ${inputHtmlPath}`);

  const html = fs.readFileSync(resolvedPath, "utf8");
  let preprocessed = removeDisplayNone(html);
  preprocessed = removeUselessTags(preprocessed);
  fs.mkdirSync(path.dirname(preprocessedPath), { recursive: true });
  fs.writeFileSync(preprocessedPath, preprocessed, "utf-8");

  const parser = new PositionBasedTranslationParser(preprocessed);
  const result = parser.extractTextsWithPositions();
  fs.mkdirSync(path.dirname(joinedPath), { recursive: true });
  fs.writeFileSync(
    joinedPath,
    result.segments.map((s) => s.text).join("\n\n␟\n\n"),
    "utf-8"
  );
  fs.writeFileSync(parserJsonPath, JSON.stringify(parser), "utf-8");

  console.log(`step [2/3] DeepL 번역 요청 중...`);

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
    fs.mkdirSync(path.dirname(translatedTextPath), { recursive: true });
    fs.writeFileSync(translatedTextPath, translatedText, "utf-8");
    console.log(`번역 완료 및 저장: ${translatedTextPath}`);
  } catch (err) {
    console.error("번역 실패:", err.response?.data || err.message);
    return;
  }

  console.log(`step [3/3] 번역된 HTML 생성`);

  const translatedSegments = translatedText.split("\n\n␟\n\n");
  const parserObj = JSON.parse(fs.readFileSync(parserJsonPath, "utf-8"));
  const originalHtml = fs.readFileSync(preprocessedPath, "utf-8");
  const restoreParser = new PositionBasedTranslationParser(originalHtml);
  restoreParser.textSegments = parserObj.textSegments;

  const translationMap = {};
  restoreParser.textSegments.forEach((seg, idx) => {
    translationMap[seg.id] = translatedSegments[idx] || seg.text;
  });

  const resultHtml = restoreParser.reconstructHtml(translationMap);
  fs.mkdirSync(path.dirname(outputHtmlPath), { recursive: true });
  fs.writeFileSync(outputHtmlPath, resultHtml, "utf-8");

  console.log(`🎉 최종 번역 HTML 저장 완료: ${outputHtmlPath}`);
}
