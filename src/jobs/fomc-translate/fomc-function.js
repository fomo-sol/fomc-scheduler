import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../../../config/s3Config.js";

const API_KEY = process.env.DEEPL_API_KEY;
const ENDPOINT = "https://api-free.deepl.com/v2/translate";

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

// ✅ 이 함수 꼭 포함시켜야 함!
export async function downloadFromS3(s3Key) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
  });

  const response = await s3.send(command);
  const buffer = await streamToBuffer(response.Body);
  return { buffer, contentType: response.ContentType };
}
// DeepL 번역 요청
export async function translateHtmlWithDeepL(htmlText) {
  try {
    const response = await axios.post(
      ENDPOINT,
      new URLSearchParams({
        auth_key: API_KEY,
        text: htmlText,
        source_lang: "EN",
        target_lang: "KO",
        tag_handling: "html",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return response.data.translations[0].text;
  } catch (err) {
    console.error("DeepL 번역 실패:", err.response?.data || err.message);
    return null;
  }
}

// 문서 종류에 따라 제목 반환
function getDocumentTitleByType(type) {
  switch (type) {
    case "statement":
      return "통화 정책 성명서";
    case "minutes":
      return "의사록 요약";
    case "implementation_note":
      return "통화정책 시행 문서";
    case "transcript":
      return "회의록 전체 (Transcript)";
    default:
      return "FOMC 문서";
  }
}

// 번역된 HTML을 스타일이 포함된 HTML 템플릿으로 감싸기
export function wrapTranslatedHtmlWithStyle(translatedBody, dateStr, type) {
  const year = dateStr.slice(0, 4);
  const month = parseInt(dateStr.slice(4, 6), 10);
  const day = parseInt(dateStr.slice(6, 8), 10);
  const title = getDocumentTitleByType(type);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${year}년 ${month}월 ${day}일 ${title}</title>
  <style>
    body {
      font-family: 'Pretendard', sans-serif;
      background-color: #fefefe;
      color: #111;
      line-height: 1.7;
      padding: 40px;
      max-width: 800px;
      margin: auto;
    }
    h1 {
      font-size: 26px;
      font-weight: bold;
      border-bottom: 2px solid #ccc;
      padding-bottom: 8px;
      margin-bottom: 24px;
    }
    p {
      margin-bottom: 18px;
    }
  </style>
</head>
<body>
  <h1>${year}년 ${month}월 ${day}일 ${title}</h1>
  ${translatedBody}
</body>
</html>`;
}

// 번역된 HTML을 S3에 업로드
export async function uploadTranslatedHtmlToS3(translatedHtml, s3Key) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
    Body: Buffer.from(translatedHtml, "utf-8"),
    ContentType: "text/html; charset=utf-8",
  });

  await s3.send(command);

  const url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
  return url;
}
export async function translateAndUploadOriginalFomcHtml(
  originalS3Key,
  type,
  date
) {
  try {
    // Step 0. PDF 파일은 DeepL 번역 생략 (아직 PDF는 처리 못함)
    if (originalS3Key.endsWith(".pdf")) {
      console.log("⚠️ PDF 파일은 DeepL 번역 생략:", originalS3Key);
      return null;
    }

    // Step 1. S3에서 HTML 다운로드 (html → htm fallback 지원)
    let buffer, contentType;
    try {
      const res = await downloadFromS3(originalS3Key);
      buffer = res.buffer;
      contentType = res.contentType;
      console.log("✅ S3에서 HTML 다운로드 성공:", originalS3Key);
    } catch (err) {
      const fallbackKey = originalS3Key.replace(".html", ".htm");
      console.warn("⚠️ 기본 키 실패, 대체 키 시도:", fallbackKey);
      const res = await downloadFromS3(fallbackKey);
      buffer = res.buffer;
      contentType = res.contentType;
    }

    if (!contentType || !contentType.includes("html")) {
      throw new Error(`HTML 파일이 아님 (${contentType})`);
    }

    // Step 2. HTML을 문자열로 변환
    const originalHtml = buffer.toString("utf-8");

    // Step 3. DeepL 번역
    const translatedHtml = await translateHtmlWithDeepL(originalHtml);
    if (!translatedHtml) throw new Error("DeepL 번역 실패");

    // Step 4. 스타일 템플릿 감싸기
    const styledHtml = wrapTranslatedHtmlWithStyle(translatedHtml, date, type);

    // Step 5. 업로드용 S3 Key 설정
    const translatedKey = `fomc_files/ko/${type}/${date}.htm`;
    const url = await uploadTranslatedHtmlToS3(styledHtml, translatedKey);

    console.log("✅✅ 번역된 HTML 저장 완료:", url);
    return url;
  } catch (err) {
    console.error("❌❌ 번역 파이프라인 실패:", err.message);
    return null;
  }
}
