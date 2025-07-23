import { extractFontTextFromHtmlBuffer } from "./extractFontTextFromHtmlBuffer";

async function extractTextFromFile(buffer, contentType) {
  if (contentType.includes("pdf")) {
    return await extractTextFromPdf(buffer);
  } else if (contentType.includes("html")) {
    return extractFontTextFromHtmlBuffer(buffer);
  } else {
    throw new Error("지원하지 않는 파일 형식입니다.");
  }
}
