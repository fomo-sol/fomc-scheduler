import * as cheerio from "cheerio";

export function extractDivTextFromHtmlBuffer(buffer) {
  const html = buffer.toString("utf-8");
  const $ = cheerio.load(html);
  const target = $("div.col-xs-12.col-sm-8.col-md-8");

  // div 내부의 모든 텍스트를 추출하고 공백을 정리
  return target.text().replace(/\s+/g, " ").trim();
}
