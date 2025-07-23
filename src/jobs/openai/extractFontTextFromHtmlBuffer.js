import * as cheerio from "cheerio";

export function extractFontTextFromHtmlBuffer(buffer) {
  const html = buffer.toString("utf-8");
  const $ = cheerio.load(html);
  const texts = [];

  $("font").each((_, el) => {
    const text = $(el).text().trim();
    if (text) texts.push(text);
  });

  return texts.join("\n");
}
