const fs = require("fs");
const path = require("path");
const { PositionBasedTranslationParser } = require("./libs/parser");

// === 파일 이름 설정 ===
const baseName = "DHR_20250722";

// === 경로 설정 ===
const segmentsPath = `./data/${baseName}_parser.json`;
const translationsPath = `./data/${baseName}_translated.txt`; // 위치 확인!
const outputPath = `./data/${baseName}_translated.html`;
const cleanedHtmlPath = `./data/${baseName}_clean.html`;

// 1️⃣ 파서 복원용 HTML 로드
const originalHtml = fs.readFileSync(cleanedHtmlPath, "utf8");

// 2️⃣ PositionBasedTranslationParser 새 인스턴스 생성
const parser = new PositionBasedTranslationParser(originalHtml);

// 3️⃣ 이전 세그먼트 정보 덮어쓰기
const parserJson = fs.readFileSync(segmentsPath, "utf8");
const savedParser = JSON.parse(parserJson);
parser.textSegments = savedParser.textSegments;

// 4️⃣ 번역 텍스트 불러오기
const translatedRaw = fs.readFileSync(translationsPath, "utf8");
// const translatedSegments = translatedRaw.split("\n\n␟\n\n");
const translatedSegments = translatedRaw
  .replaceAll("\r\n", "\n")
  .split("\n\n␟\n\n");

// 🔍 세그먼트 개수 비교
console.log(`📊 원본 세그먼트 수: ${parser.textSegments.length}`);
console.log(`📥 번역된 세그먼트 수: ${translatedSegments.length}`);

// 5️⃣ 세그먼트 매핑 생성
const translationMap = {};

parser.textSegments.forEach((segment, idx) => {
  if (translatedSegments[idx] === undefined) {
    console.warn(
      `⚠️ 누락된 번역: index ${idx} (${segment.text.slice(0, 30)}...)`
    );
  }
  translationMap[segment.id] = translatedSegments[idx] || segment.text;
});

// 6️⃣ HTML 재구성
const reconstructedHtml = parser.reconstructHtml(translationMap);

// 7️⃣ 저장
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, reconstructedHtml, "utf8");

console.log(`✅ 번역 HTML 저장 완료: ${outputPath}`);
