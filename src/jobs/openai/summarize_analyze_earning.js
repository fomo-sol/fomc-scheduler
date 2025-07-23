import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../../../config/s3Config.js"; // export default S3Client
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import * as cheerio from "cheerio";
import { extractFontTextFromHtmlBuffer } from "./extractFontTextFromHtmlBuffer.js";
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

// 이거 pdf 도 하게 만들기
async function extractTextFromFile(buffer, contentType) {
  if (contentType.includes("pdf")) {
    const pdft = await extractTextFromPdf(buffer);
    return pdft;
  } else if (contentType.includes("html")) {
    // const $ = cheerio.load(buffer.toString("utf-8"));
    // const target = $("div.col-xs-12.col-sm-8.col-md-8");
    // return target.text().replace(/\s+/g, " ").trim();
    return extractFontTextFromHtmlBuffer(buffer);
  } else {
    throw new Error("지원하지 않는 파일 형식입니다.");
  }
}

// html 요약 생성하깅
async function generateHtmlSummary(title, fullText, symbol, date) {
  const prompt = `
You are a financial analyst assistant that specializes in summarizing SEC filings.
The following text is extracted from a company's quarterly or annual financial report. Based on the content, generate a clear, structured summary in **pure HTML format** that is suitable for displaying on a financial web platform.

:압정: Instructions:
1. Return a complete HTML document using the following structure:
   - Must include ' <html>'
   - Must include ' <head>'
   - Must include ' <body>'
   - Use '<h1>' for the title, use symbol, date and purpose in the title
   - Use ' <h2> ' or ' <h3> ' tags to separate major sections
   - Use ' <table> ', ' <ul> ', and ' <li> ' for clean formatting of key numbers
   - Use ' <strong> ' tags to highlight important metrics (e.g., revenue, net income)
   - Ensure clean formatting and **readability** for web display
2. Include the following 6 sections (in this exact order):
---
**1. Earnings Summary**
- Include key financials: Revenue, Operating Income, Net Income, EPS (GAAP and Non-GAAP if available)
- Show YoY or QoQ % change if mentioned
- Present in a table or bullet list
---
**2. Segment Performance**
- Summarize performance of each business segment (e.g., Medical Devices, Diagnostics, Nutritional, Established Pharmaceuticals)
- Include revenue or growth data if mentioned
- Use bullet points or a table for segment breakdown
---
**3. Cash Flow and Financial Condition**
- Summarize key metrics: Operating Cash Flow, Free Cash Flow, Cash Balance, Debt levels, Liquidity position
- Mention any changes in working capital or leverage
---
**4. Investments and Accounting**
- Mention M&A activity, goodwill, intangible assets, depreciation/amortization, or any unusual accounting items
- If no such items are present, note that briefly
---
**5. Shareholder Returns**
- Include information on dividends, share buybacks, or other capital return programs
---
**6. Outlook and Risk Factors**
- Summarize forward-looking statements by management
- Mention any macroeconomic risks, geopolitical risks, supply chain challenges, etc.
- If available, include executive quotes in summarized form
---
:압정: Language: Korean
:압정: Output: HTML only (do not include any commentary or markdown)
:압정: Format must be **web-ready** and concise but informative.
:아래를_가리키는_손_모양: Here is the raw text content from the SEC report (truncate to first 12,000 characters for input):
[Begin SEC Report Text Below]
${fullText.slice(0, 12000)}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-nano",
    messages: [
      {
        role: "system",
        content:
          "You are an assistant that generates summarized earning report in HTML format",
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
Below is a structured summary of a company's latest earnings report. Based on this content, evaluate the **potential short-term impact on the overall industry or sector** this company belongs to (e.g., semiconductor, biotech, banking, etc.).
Return your response strictly in **JSON** format with the following two fields:
1. "prediction": A concise Korean-language alert message that explains how this earnings report may affect the sector's outlook, investor sentiment, or economic indicators.
2. "risk": An integer from 0 (very low risk) to 4 (very high risk), indicating how volatile or sensitive this industry may react to the earnings report in the short term.
:압정: Instructions:
- The tone should be friendly but analytical (like a smart stock assistant).
- Use only Korean.
- No commentary, no explanations outside of the JSON format.
- Do not include backticks or code block formatting.
Example response format:
{
  "prediction": "이 회사의 실적이 기대치를 상회하여 반도체 업종 전반에 긍정적인 투자심리를 불러일으킬 가능성이 있습니다.",
  "risk": 2
}
Earnings report summary:
${fullText}
`;
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-nano",
    messages: [
      {
        role: "system",
        content:
          "You are an assistant that generates summarized Earning Reports in HTML format",
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
export async function summarizeAndUploadEarningFile(
  id,
  originalS3Key,
  symbol,
  date
) {
  try {
    const { buffer, contentType } = await downloadFromS3(originalS3Key);
    const text = await extractTextFromFile(buffer, contentType);
    const title = `${id} FOMC 회의 요약`;
    const html = await generateHtmlSummary(title, text, symbol, date);
    console.log(html);
    console.log(id);
    const htmlKey = `summaries/${symbol}/${date}.html`;
    const url = await uploadHtmlToS3(html, htmlKey);

    const industryAnalysis = await generateIndustryAnalysis(text, date);
    const industryKey = `industry_analysis/${symbol}/${date}.json`;
    const jsonurl = await uploadJsonToS3(industryAnalysis, industryKey);

    console.log("✅ 요약 HTML 저장 완료:", url);
    console.log("✅ 산업 분석 JSON 저장 완료:", jsonurl);
    return { url, jsonurl };
  } catch (err) {
    console.error("❌ 전체 처리 중 오류:", err.message);
    throw err;
  }
}
