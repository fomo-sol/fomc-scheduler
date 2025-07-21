import fs from "fs-extra";
import path from "path";
import pdfParse from "pdf-parse";

export async function pdfToTxt(buffer, id) {
  try {
    const data = await pdfParse(buffer);
    const outputDir = "./fomc_files";
    const txtPath = path.join(outputDir, `${id}.txt`);

    await fs.ensureDir(outputDir); // 디렉토리 없으면 생성
    await fs.writeFile(txtPath, data.text, "utf-8");

    console.log(`📄 PDF 텍스트 저장 완료: ${txtPath}`);
    return txtPath;
  } catch (err) {
    console.error(`❌ PDF → TXT 변환 실패: ${err.message}`);
    throw err;
  }
}
