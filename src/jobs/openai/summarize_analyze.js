import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../../../config/s3Config.js"; // export default S3Client
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  translateHtmlWithDeepL,
  wrapTranslatedHtmlWithStyle,
  uploadTranslatedHtmlToS3,
} from "../fomc-translate/fomc-function.js";

import * as cheerio from "cheerio";

import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

// S3 다운로드ㄱㄱㄱ
async function downloadFromS3(s3Key) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
  });

  const response = await s3.send(command);
  const buffer = await streamToBuffer(response.Body);
  return { buffer, contentType: response.ContentType };
}

async function extractTextFromPdf(buffer) {
  const uint8Array = new Uint8Array(buffer); // ✅ 변환 필요
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;
  let textContent = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    textContent += content.items.map((item) => item.str).join(" ");
  }

  return textContent.trim();
}
// 이거 pdf 도 하게 만들기
async function extractTextFromFile(buffer, contentType) {
  if (contentType.includes("pdf")) {
    const pdft = await extractTextFromPdf(buffer);
    return pdft;
  } else if (contentType.includes("html")) {
    const $ = cheerio.load(buffer.toString("utf-8"));
    const target = $("div.col-xs-12.col-sm-8.col-md-8");
    return target.text().replace(/\s+/g, " ").trim();
  } else {
    throw new Error("지원하지 않는 파일 형식입니다.");
  }
}

// html 요약 생성하깅
async function generateHtmlSummary(title, fullText, type, date) {
  const prompt = `
You are an expert analyst in the field of economics.

Below is the full text of an FOMC meeting transcript. Based on this document, generate a structured summary in **pure HTML format** with a focus on key decisions and economic indicators.

**Instructions:**
- Output only valid HTML. Do not include explanations, greetings, or commentary.
- Use only the following HTML tags to structure the output: <h1>, <h2>, and <p>.
- The <h1> tag should contain the overall meeting summary title (e.g., "Summary of the ${date} FOMC ${type}").
- Please ensure the date of the $fullText is ${date}, and the meeting type is ${type}.
- The <h2> tags should represent 3 to 5 key topics, such as "Interest Rate Decision", "Inflation Outlook", "Labor Market", etc.
- Each <h2> should be followed by a <p> tag containing **concise summary points using clear and short phrases or bullet-like wording** (avoid long paragraphs).
- Focus on decisions, forecasts, and changes in economic stance.
- Do not output anything other than valid HTML.

Write all content in **Korean**.

Meeting content:



${fullText}  
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-nano",
    messages: [
      {
        role: "system",
        content:
          "You are an assistant that generates summarized FOMC meeting minutes in HTML format",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
  });

  return response.choices[0].message.content;
}

// HTML 요약 결과를 다시 S3에 저장
async function uploadHtmlToS3(htmlContent, s3Key) {
  const htmlWithMeta = `<meta charset="UTF-8">\n` + htmlContent;
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
    Body: Buffer.from(htmlWithMeta, "utf-8"),
    ContentType: "text/html, charset=utf-8",
  });

  await s3.send(command);

  const url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
  return url;
}

async function generateIndustryAnalysis(fullText, date) {
  const prompt = `You are a macroeconomic and industry analyst.


Below is a summary of the latest FOMC meeting. Based on this content, generate a prediction for each of the following sectors. For each sector, return:

1. "sector": The sector name
2. "prediction": A concise message written in natural, user-friendly language. This should explain how the FOMC outcome may affect the sector.
3. "risk": A number from 0 (very low risk) to 4 (very high risk), representing how sensitive this sector is to the FOMC outcome in the short term.

Instructions:
- Your response must be in **pure JSON format** only. No explanations or text outside the JSON. For example:
'
[
  {
    "sector": "Financial Services",
    "prediction": "금융 서비스 부문은 금리 인상으로 인해 대출이 줄어들 것으로 예상됩니다.",
    "risk": 3
  },
]
'
- Use the following list of sectors exactly as given.
- Return an array of JSON objects (one per sector).

Sector list:
[
  "Financial Services",
  "Consumer Cyclical",
  "Industrials",
  "Technology",
  "Healthcare",
  "Consumer Defensive",
  "Utilities",
  "Basic Materials",
  "Real Estate",
  "Communication Services",
  "Energy"
]
  
Write all content in **Korean**.

FOMC summary:
${fullText}`;
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-nano",
    messages: [
      {
        role: "system",
        content:
          "You are an assistant that generates summarized FOMC meeting minutes in HTML format",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
  });

  return response.choices[0].message.content;
}

async function uploadJsonToS3(data, s3Key) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
    Body: JSON.stringify(data, null, 2),
    ContentType: "application/json",
  });
  await s3.send(command);
  const url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
  return url;
}

// 전체 파이프라인
export async function summarizeAndUploadFomcFile(
  fomcId,
  originalS3Key,
  type,
  date
) {
  try {
    const { buffer, contentType } = await downloadFromS3(originalS3Key);
    const text = await extractTextFromFile(buffer, contentType);
    const title = `${fomcId} FOMC 회의 요약`;
    const html = await generateHtmlSummary(title, text, type, date);
    console.log(html);
    console.log(fomcId);
    const htmlKey = `summaries/${type}/${date}.html`;
    const url = await uploadHtmlToS3(html, htmlKey);

    const industryAnalysis = await generateIndustryAnalysis(text, date);
    const industryKey = `industry_analysis/${type}/${date}.json`;
    const jsonurl = await uploadJsonToS3(industryAnalysis, industryKey);

    console.log("✅ 요약 HTML 저장 완료:", url);
    console.log("✅ 산업 분석 JSON 저장 완료:", jsonurl);
    return { url, jsonurl };
  } catch (err) {
    console.error("❌ 전체 처리 중 오류:", err.message);
    throw err;
  }
}
