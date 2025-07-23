import * as cheerio from "cheerio";

export function removeDisplayNone(htmlString) {
  const $ = cheerio.load(htmlString, {
    xmlMode: true,
    decodeEntities: false,
  });
  // style 속성이 display: none인 요소를 찾아서 제거
  $("[style]").each(function () {
    const style = $(this).attr("style");
    if (style && /display\s*:\s*none/i.test(style)) {
      $(this).remove();
    }
  });

  return $.html();
}

export function removeUselessTags(htmlString) {
  const uselessTags = ["ix:fraction", "ix:nonfraction", "ix:nonnumeric"];

  // XML 모드로 로드하되, 네임스페이스 속성 처리
  const $ = cheerio.load(htmlString, {
    xmlMode: true,
    decodeEntities: false,
  });

  // 모든 요소를 순회하면서 태그명 확인
  function processElements() {
    let found = false;

    // 모든 요소 순회
    $("*").each(function (i, element) {
      const tagName = element.name || element.tagName;

      // 디버깅용 출력
      // if (tagName && tagName.includes("ix:")) {
      //   console.log("발견된 ix 태그:", tagName);
      // }

      if (uselessTags.includes(tagName)) {
        const $element = $(this);
        const content = $element.html() || $element.text() || "";
        console.log(`${tagName} 태그 제거 중, 내용:`, content);
        $element.replaceWith(content);
        found = true;
      }
    });

    return found;
  }

  // 반복적으로 처리 (중첩된 태그 처리)
  let maxIterations = 10;
  while (maxIterations-- > 0 && processElements()) {
    // 태그가 발견되어 제거된 경우 다시 처리
  }

  return $.html();
}
