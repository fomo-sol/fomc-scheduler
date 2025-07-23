const fs = require("fs");
const path = require("path");
const { removeUselessTags, removeDisplayNone } = require("./libs/preprocessor");
const { PositionBasedTranslationParser } = require("./libs/parser");

// === 설정 ===
const filename = "./DHR_20250722.html";
const inputPath = path.join(__dirname, filename);
const baseName = path.basename(inputPath, ".html");
const outputDir = "data";

// HTML 로드
const raw = fs.readFileSync(inputPath, "utf8");

// 1️⃣ <TEXT> 태그 내부만 추출
const textMatch = raw.match(/<TEXT>([\s\S]*?)<\/TEXT>/i);
if (!textMatch) {
  console.error("❌ <TEXT> 블록을 찾을 수 없습니다.");
  process.exit(1);
}
const htmlBody = textMatch[1]; // <- 여기서부터만 분석 대상

// 3️⃣ 전처리 HTML 저장
fs.mkdirSync(`${outputDir}/preprocessed`, { recursive: true });
fs.writeFileSync(`${outputDir}/${baseName}_clean.html`, htmlBody, "utf-8");

// 4️⃣ 파서 적용
const parser = new PositionBasedTranslationParser(htmlBody);
const result = parser.extractTextsWithPositions();

// 5️⃣ 분리된 텍스트 저장
const textJoined = result.segments.map((s) => s.text).join("\n\n␟\n\n");
fs.writeFileSync(`${outputDir}/${baseName}_joined.txt`, textJoined, "utf-8");

// 6️⃣ 파서 객체 JSON 저장
fs.mkdirSync(`${outputDir}/segments`, { recursive: true });
fs.writeFileSync(
  `${outputDir}/${baseName}_parser.json`,
  JSON.stringify(parser),
  "utf-8"
);

console.log(`✅ ${result.segments.length}개 세그먼트 저장 완료`);
