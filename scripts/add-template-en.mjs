// scripts/add-template-en.mjs — thêm trường tiếng Anh vào fixtures/templates.json (issue #37)
import { readFileSync, writeFileSync } from "node:fs";

const EN = {
  "tpl-business": {
    name_en: "Leadership meeting",
    sections: { "tpl-business-s1": "Decisions", "tpl-business-s2": "Figures mentioned", "tpl-business-s3": "Risks and blockers", "tpl-business-s4": "Tasks by owner" },
    questions_en: ["Who is overloaded?", "What has no owner yet?", "Draft a company-wide announcement"],
  },
  "tpl-doctor": {
    name_en: "Clinic visit",
    sections: { "tpl-doctor-s1": "Reason for visit", "tpl-doctor-s2": "Patient's account", "tpl-doctor-s3": "Tests and prescriptions", "tpl-doctor-s4": "Care instructions", "tpl-doctor-s5": "Follow-up appointment" },
    questions_en: ["When did the symptoms start?", "Draft care instructions for the patient", "What foods did I tell the patient to avoid?"],
    footer_note_en: "Noteim only records what was said. It is not a diagnosis or medical advice.",
  },
  "tpl-lawyer": {
    name_en: "Legal consultation",
    sections: { "tpl-lawyer-s1": "Events in order", "tpl-lawyer-s2": "Client's requests", "tpl-lawyer-s3": "Legal issues to review", "tpl-lawyer-s4": "Documents to provide", "tpl-lawyer-s5": "Deadlines" },
    questions_en: ["List the dates the client mentioned", "Which documents are still missing?", "Draft a letter confirming the advice"],
  },
  "tpl-realestate": {
    name_en: "Client meeting",
    sections: { "tpl-realestate-s1": "Needs", "tpl-realestate-s2": "Budget and loan options", "tpl-realestate-s3": "Client's concerns", "tpl-realestate-s4": "Property of interest", "tpl-realestate-s5": "Commitments on both sides", "tpl-realestate-s6": "Next steps" },
    questions_en: ["What concerns does the client still have?", "Draft a thank-you message", "What should I prepare for the next meeting?"],
  },
  "tpl-architect": {
    name_en: "Design and site meeting",
    sections: { "tpl-architect-s1": "Change requests", "tpl-architect-s2": "Measurements and materials", "tpl-architect-s3": "Open items", "tpl-architect-s4": "Tasks by party" },
    questions_en: ["What did the owner change since the last meeting?", "List the measurements", "Draft site minutes"],
  },
  "tpl-notary": {
    name_en: "Notarization session",
    sections: { "tpl-notary-s1": "Parties present", "tpl-notary-s2": "Transaction type", "tpl-notary-s3": "Documents presented", "tpl-notary-s4": "Documents missing", "tpl-notary-s5": "Explanation given to the parties", "tpl-notary-s6": "Appointments" },
    questions_en: ["Which documents are still missing?", "Which rights and obligations did I explain?", "Draft an appointment reminder"],
  },
};

const path = new URL("../fixtures/templates.json", import.meta.url);
const templates = JSON.parse(readFileSync(path, "utf8"));
const missing = [];
for (const tpl of templates) {
  const en = EN[tpl.id];
  if (!en) { missing.push(tpl.id); continue; }
  tpl.name_en = en.name_en;
  for (const s of tpl.sections) {
    if (!en.sections[s.id]) missing.push(s.id);
    else s.title_en = en.sections[s.id];
  }
  tpl.suggested_questions_en = en.questions_en;
  if (en.footer_note_en) tpl.footer_note_en = en.footer_note_en;
}
if (missing.length) { console.error("THIẾU BẢN DỊCH:", missing); process.exit(1); }
writeFileSync(path, JSON.stringify(templates, null, 2) + "\n");
console.log("Đã thêm trường tiếng Anh cho", templates.length, "mẫu.");
