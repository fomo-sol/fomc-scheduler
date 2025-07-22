import { runTranslatePipeline } from "./translate/translatePipeline.js";

const inputFile = process.argv[2]; // 예: data/raw/CSCO_2025_Q2.html

if (!inputFile) {
  console.error(
    "HTML 파일 경로를 인자로 제공하세요. 예: node run_translate.js data/raw/CSCO_2025_Q2.html"
  );
  process.exit(1);
}

await runTranslatePipeline(inputFile);
