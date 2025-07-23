import * as cheerio from "cheerio";

export class PositionBasedTranslationParser {
  constructor(htmlContent) {
    this.originalHtml = htmlContent;
    this.$ = cheerio.load(htmlContent, {
      decodeEntities: false,
      lowerCaseAttributeNames: false,
    });
    this.textSegments = [];
    this.positionMap = new Map();
  }

  extractTextsWithPositions() {
    this.findTextPositions();
    return {
      segments: this.textSegments,
      originalHtml: this.originalHtml,
    };
  }

  findTextPositions() {
    let segmentId = 0;
    let searchOffset = 0;

    this.walkDomForText(this.$.root(), (textNode, text) => {
      if (this.isTranslatable(text.trim())) {
        const position = this.findExactPosition(textNode.data, searchOffset);

        if (position !== -1) {
          const segment = {
            id: segmentId++,
            text: text.trim(),
            originalText: textNode.data,
            startPos: position,
            endPos: position + textNode.data.length,
            parentInfo: this.getParentInfo(textNode),
            verification: this.createVerification(textNode.data, position),
          };

          this.textSegments.push(segment);
          this.positionMap.set(position, segment);
          searchOffset = position + textNode.data.length;
        }
      }
    });

    this.textSegments.sort((a, b) => a.startPos - b.startPos);
    this.textSegments.forEach((segment, index) => {
      segment.id = index;
    });
  }

  walkDomForText(element, callback) {
    element.contents().each((index, node) => {
      if (node.type === "text") {
        callback(node, node.data);
      } else if (node.type === "tag" && !this.isExcludedTag(node.name)) {
        this.walkDomForText(this.$(node), callback);
      }
    });
  }

  isExcludedTag(tagName) {
    return ["script", "style", "noscript", "template"].includes(
      tagName.toLowerCase()
    );
  }

  findExactPosition(textContent, startOffset = 0) {
    let position = this.originalHtml.indexOf(textContent, startOffset);

    if (position === -1) {
      const escapedText = this.escapeHtml(textContent);
      position = this.originalHtml.indexOf(escapedText, startOffset);
    }

    return position;
  }

  escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  getParentInfo(textNode) {
    if (!textNode.parent) return null;

    const $parent = this.$(textNode.parent);
    return {
      tagName: textNode.parent.name,
      attributes: { ...textNode.parent.attribs },
      outerHtml: $parent.toString(),
      textContent: $parent.text(),
    };
  }

  createVerification(originalText, position) {
    const before = this.originalHtml.substring(
      Math.max(0, position - 10),
      position
    );
    const after = this.originalHtml.substring(
      position + originalText.length,
      position + originalText.length + 10
    );

    return {
      before,
      after,
      length: originalText.length,
      checksum: this.simpleChecksum(originalText),
    };
  }

  simpleChecksum(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }

  isTranslatable(text) {
    if (!text || text.length < 2) return false;
    if (/^\s*$/.test(text)) return false;
    if (/^[\d\s\.,;:!?\-()]*$/.test(text)) return false;
    return true;
  }

  reconstructHtml(translations) {
    let resultHtml = this.originalHtml;
    let offsetAdjustment = 0;

    for (const segment of this.textSegments) {
      if (translations.hasOwnProperty(segment.id)) {
        const translatedText = translations[segment.id];
        const adjustedStartPos = segment.startPos + offsetAdjustment;
        const adjustedEndPos = segment.endPos + offsetAdjustment;
        const currentText = resultHtml.substring(
          adjustedStartPos,
          adjustedEndPos
        );

        if (this.verifyPosition(currentText, segment)) {
          const before = resultHtml.substring(0, adjustedStartPos);
          const after = resultHtml.substring(adjustedEndPos);
          resultHtml = before + translatedText + after;
          const lengthDiff =
            translatedText.length - segment.originalText.length;
          offsetAdjustment += lengthDiff;
        } else {
          console.warn(
            `Position verification failed for segment ${segment.id}: "${segment.text}"`
          );
          resultHtml = this.fallbackReplace(
            resultHtml,
            segment,
            translatedText
          );
        }
      }
    }

    const metaTag =
      '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">';
    if (/<head[^>]*>/i.test(resultHtml)) {
      resultHtml = resultHtml.replace(/(<head[^>]*>)/i, `$1\n    ${metaTag}`);
    }

    return resultHtml;
  }

  verifyPosition(currentText, segment) {
    if (currentText === segment.originalText) return true;
    if (this.simpleChecksum(currentText) === segment.verification.checksum)
      return true;
    if (currentText.trim() === segment.originalText.trim()) return true;
    return false;
  }

  fallbackReplace(html, segment, translatedText) {
    const originalText = segment.originalText;
    const index = html.indexOf(originalText);
    if (index !== -1) {
      return (
        html.substring(0, index) +
        translatedText +
        html.substring(index + originalText.length)
      );
    }

    console.warn(`Fallback replace failed for: "${segment.text}"`);
    return html;
  }

  getTranslationMap() {
    return this.textSegments.reduce((map, segment) => {
      map[segment.id] = segment.text;
      return map;
    }, {});
  }

  validateRecovery() {
    const issues = [];

    for (const segment of this.textSegments) {
      const extractedText = this.originalHtml.substring(
        segment.startPos,
        segment.endPos
      );
      if (extractedText !== segment.originalText) {
        issues.push({
          segmentId: segment.id,
          expected: segment.originalText,
          found: extractedText,
          position: segment.startPos,
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  debugInfo() {
    console.log("=== 위치 기반 텍스트 세그먼트 ===");
    this.textSegments.forEach((segment) => {
      console.log(`[${segment.id}] "${segment.text}"`);
      console.log(
        `  위치: ${segment.startPos}-${segment.endPos} (길이: ${
          segment.endPos - segment.startPos
        })`
      );
      console.log(`  부모: <${segment.parentInfo?.tagName || "unknown"}>`);
      console.log(
        `  검증: ${segment.verification.before}|${segment.originalText}|${segment.verification.after}`
      );
      console.log("---");
    });

    const validation = this.validateRecovery();
    console.log(`\n복구 검증: ${validation.valid ? "PASS" : "FAIL"}`);
    if (!validation.valid) {
      console.log("Issues:", validation.issues);
    }
  }
}
