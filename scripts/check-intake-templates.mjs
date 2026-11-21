#!/usr/bin/env node
/**
 * Kiểm tra JSON 11 mẫu nghiệp vụ cho Gap Check "Kiểm tra thiếu" (GC-01, đặc tả v1.1).
 * Chạy riêng: `node scripts/check-intake-templates.mjs`.
 * Quy tắc theo docs/gap-check-spec-v1.1.md:
 * - Đúng 11 mẫu, id mẫu duy nhất.
 * - Mỗi mẫu: role_name, requires_consent (boolean), tone_guideline, summary_structure
 *   khác rỗng, đúng 4 ô dữ liệu (gap_slots), key ô duy nhất trong mẫu.
 * - Mỗi ô: key, label, extraction_hint, fallback_question khác rỗng; sensitive (nếu có) là boolean.
 * - Ba mẫu nhạy cảm bắt buộc requires_consent: doctor_clinical, psychologist_counselor,
 *   lawyer_consultation. Mẫu mặc định general_meeting phải có.
 * - student_lecture dùng question_mode "takeaway" (câu hỏi mang về).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "config", "intake-templates.json");
const problems = [];
let catalog;

try {
  catalog = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(`Không đọc được ${file}: ${error.message}`);
  process.exit(1);
}

const EXPECTED_COUNT = 11;
const CONSENT_REQUIRED = new Set([
  "doctor_clinical",
  "psychologist_counselor",
  "lawyer_consultation",
]);
const templates = Array.isArray(catalog.templates) ? catalog.templates : [];

if (catalog.version !== "1.1") {
  problems.push(`version phải là "1.1" (thấy "${catalog.version}")`);
}
if (templates.length !== EXPECTED_COUNT) {
  problems.push(`số mẫu phải là ${EXPECTED_COUNT} (thấy ${templates.length})`);
}

const seenIds = new Set();
for (const template of templates) {
  const where = template.id ?? "(thiếu id)";
  if (seenIds.has(template.id)) {
    problems.push(`id mẫu bị trùng "${template.id}"`);
  }
  seenIds.add(template.id);
  if (typeof template.id !== "string" || template.id.length === 0) {
    problems.push(`${where}: thiếu id mẫu`);
  }
  if (typeof template.role_name !== "string" || template.role_name.length === 0) {
    problems.push(`${where}: thiếu role_name`);
  }
  if (typeof template.requires_consent !== "boolean") {
    problems.push(`${where}: requires_consent phải là boolean`);
  }
  if (CONSENT_REQUIRED.has(template.id) && template.requires_consent !== true) {
    problems.push(`${where}: mẫu nhạy cảm phải requires_consent = true`);
  }
  if (typeof template.tone_guideline !== "string" || template.tone_guideline.length === 0) {
    problems.push(`${where}: thiếu tone_guideline`);
  }
  if (!Array.isArray(template.summary_structure) || template.summary_structure.length === 0) {
    problems.push(`${where}: summary_structure rỗng`);
  }
  const slots = Array.isArray(template.gap_slots) ? template.gap_slots : [];
  if (slots.length !== 4) {
    problems.push(`${where}: phải đúng 4 ô dữ liệu (thấy ${slots.length})`);
  }
  const seenKeys = new Set();
  for (const slot of slots) {
    const slotWhere = `${where} / ô "${slot.key ?? "(thiếu key)"}"`;
    if (seenKeys.has(slot.key)) {
      problems.push(`${where}: key ô dữ liệu bị trùng "${slot.key}"`);
    }
    seenKeys.add(slot.key);
    for (const field of ["key", "label", "extraction_hint", "fallback_question"]) {
      if (typeof slot[field] !== "string" || slot[field].length === 0) {
        problems.push(`${slotWhere}: thiếu ${field}`);
      }
    }
    if (slot.sensitive !== undefined && typeof slot.sensitive !== "boolean") {
      problems.push(`${slotWhere}: sensitive phải là boolean`);
    }
  }
}

if (!seenIds.has("general_meeting")) {
  problems.push('thiếu mẫu mặc định "general_meeting"');
}
const student = templates.find((template) => template.id === "student_lecture");
if (student && student.question_mode !== "takeaway") {
  problems.push('student_lecture phải dùng question_mode "takeaway"');
}

if (problems.length) {
  console.error(
    `intake-templates.json sai đặc tả v1.1 (${problems.length}):\n` +
      problems.map((problem) => `  - ${problem}`).join("\n"),
  );
  process.exit(1);
}

const sensitiveSlots = templates.reduce(
  (total, template) =>
    total + template.gap_slots.filter((slot) => slot.sensitive === true).length,
  0,
);
console.log(
  `intake-templates.json đạt: ${templates.length} mẫu v1.1, ` +
    `mỗi mẫu đúng 4 ô, ${CONSENT_REQUIRED.size} mẫu cần đồng ý ghi âm, ` +
    `${sensitiveSlots} ô sensitive, id và key ô đều duy nhất.`,
);
