import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import axios from "axios";
import { removeUselessTags, removeDisplayNone } from "./libs/preprocessor.js";
import { PositionBasedTranslationParser } from "./libs/parser.js";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../../../config/s3Config.js";

const API_KEY = process.env.DEEPL_API_KEY;
const ENDPOINT = "https://api-free.deepl.com/v2/translate";
const sourceLang = "EN";
const targetLang = "KO";
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function downloadOriginalHtmlFromS3(symbol, date) {
  const s3Key = `earnings/${symbol}/${date}.htm`;
  const localPath = path.resolve(`data/raw/${symbol}-${date}.html`);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });

  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
  });

  const res = await s3.send(command);

  const bodyBuffer = await streamToBuffer(res.Body);
  fs.writeFileSync(localPath, bodyBuffer.toString("utf-8"));

  console.log(`✅ 원본 HTML 다운로드 완료: ${localPath}`);
  return localPath;
}
export async function uploadTranslatedFileToS3(filePath, s3Key) {
  const html = fs.readFileSync(filePath, "utf-8");

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET, // 🔥 반드시 .env에 정의되어 있어야 함
    Key: s3Key,
    Body: Buffer.from(html, "utf-8"),
    ContentType: "text/html; charset=utf-8",
  });

  await s3.send(command);

  const url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
  return url;
}

export async function runTranslatePipeline(symbol, date) {
  // const resolvedPath = path.resolve(process.cwd(), inputHtmlPath);
  //  const baseName = path.basename(inputHtmlPath, ".html");

  const baseDir = "data";
  const baseName = `${symbol}-${date}`;

  // === Step 1: 원본 HTML 읽기 ===
  const inputPath = await downloadOriginalHtmlFromS3(symbol, date);
  const raw = fs.readFileSync(inputPath, "utf8");
  // const raw = fs.readFileSync(resolvedPath, "utf8");

  // === Step 2: <TEXT> 태그 내부 추출 ===
  const match = raw.match(/<TEXT>([\s\S]*?)<\/TEXT>/i);
  if (!match) {
    console.error("❌ <TEXT> 블록을 찾을 수 없습니다.");
    return;
  }
  const htmlBody = match[1];
  // console.log(htmlBody);

  const preprocessedPath = `${baseDir}/preprocessed/${baseName}_clean.html`;
  fs.mkdirSync(path.dirname(preprocessedPath), { recursive: true });
  fs.writeFileSync(preprocessedPath, htmlBody, "utf-8");

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
  fs.writeFileSync(
    parserJsonPath,
    JSON.stringify({ textSegments: parser.textSegments }),
    "utf-8"
  );

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

  console.log(`🎉 최종 번역 완료: ${outputHtmlPath}`);

  // 8️⃣ S3 업로드
  const s3Key = `earnings/translate/${symbol}/${date}.html`;
  await uploadTranslatedFileToS3(outputHtmlPath, s3Key);
  console.log(`✅ S3 업로드 완료: ${s3Key}`);
}
