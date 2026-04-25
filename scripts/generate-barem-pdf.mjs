import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const ROOT = process.cwd();
const outPath = path.join(ROOT, "docs", "barem-dovezi.pdf");

const content = `
UniFlow — Dovada cerinte barem (fișier + funcție/tabel)

LOGIN (15p)
• Formular login (3p): app/login/page.tsx, components/auth/LoginClient.tsx
• Formular înregistrare (3p): app/register/page.tsx
• Resetare parolă (2p): app/forgot-password/page.tsx (trimite link), app/reset-password/page.tsx (setează parolă nouă)
• Roluri admin (6p: atribuire/modificare/revocare):
  - UI: app/admin/roles/page.tsx
  - DB: sql/auth_schema.sql (tabele roles, user_roles; funcții is_admin/is_profesor/is_audit; politici RLS pe user_roles)
• Hash parole (1p): autentificare prin Supabase Auth (supabase.auth.* în LoginClient/Register/Reset). Parolele sunt în auth.users (hashing gestionat de Supabase), nu în public.*.

PAGINĂ PRINCIPALĂ / STUDENT (10p)
• Afișare cursuri pentru studenți (4p): components/student/StudentHome.tsx (select din courses)
• Afișare cursuri unde studentul e înrolat (4p): StudentHome.tsx (select din course_enrollments + filtrare)
• Înrolare student la curs (2p):
  - UI: StudentHome.tsx → rpc("enroll_in_course")
  - DB: sql/auth_schema.sql → funcția enroll_in_course(_course_id)

PAGINĂ CURS / STUDENT (20p)
• Vizualizare materiale profesor (3p):
  - UI: components/student/StudentCoursePage.tsx (select course_materials)
  - Pagini: app/cursuri/[id]/materiale/page.tsx, app/cursuri/[id]/materiale/[materialId]/page.tsx
• Resurse digitale rămase (3p): StudentCoursePage.tsx (select course_student_resources; remainingTokens/remainingVps)
• Solicitare resurse suplimentare (2p):
  - UI: StudentCoursePage.tsx → rpc("request_course_resources")
  - DB: sql/auth_schema.sql → request_course_resources(...)
• Încărcare teme student (2p):
  - UI: StudentCoursePage.tsx → rpc("submit_homework")
  - DB: sql/auth_schema.sql → submit_homework(...)
• Consum manual token-uri (5p):
  - UI: StudentCoursePage.tsx → rpc("consume_tokens_for_activity")
  - DB: sql/auth_schema.sql → consume_tokens_for_activity(...), tabele course_activities + course_token_activities
• Validarea utilizării abonamentelor (5p):
  - API: app/api/vps/validate/route.ts → rpc("consume_vps_validation_from_token")
  - DB: sql/auth_schema.sql → consume_vps_validation_from_token(...), tabele vps_email_validation_tokens, course_vps_validations, course_student_resources

PAGINĂ ADMINISTRATOR (25p)
• 2 tipuri resurse (1p): sql/auth_schema.sql → enum digital_resource_type('tokens','vps_subscription') + resource_inventory
• Adăugare activitate (minim 10) (10p):
  - DB seed: sql/auth_schema.sql → admin_activities (10 intrări), funcții seed_admin_activities_min_10, seed_course_activities_defaults
  - UI per curs: app/admin/resurse/page.tsx → rpc("create_course_activity"), rpc("seed_course_activities_defaults")
• Distribuire credențiale abonamente via mail (2p):
  - DB: sql/auth_schema.sql → assign_vps_credentials_and_queue_emails(...), tabele vps_credentials/email_outbox/vps_email_validation_tokens
  - UI: app/admin/resurse/page.tsx (apelează funcția + trimite)
  - Outbox: app/admin/outbox/page.tsx
  - Trimitere email (SMTP/MailerSend): app/api/admin/email-outbox/send/route.ts
• Total tokens + distribuire (2p):
  - UI inventar global: app/admin/inventar/page.tsx → rpc("set_resource_inventory")
  - UI alocare/distribuire per curs: app/admin/resurse/page.tsx → rpc("allocate_course_resources_from_inventory")
  - DB: sql/auth_schema.sql → set_resource_inventory, allocate_course_resources_from_inventory, allocate_course_resources, distribute_course_resources_to_students
• Total abonamente + distribuire (2p): același flux ca mai sus, cu resource_type='vps_subscription'
• Bonus profesor 10% după solicitare (3p): sql/auth_schema.sql → course_resource_allocations (professor_bonus_*), folosit în approve_course_resource_request(...)
• Aprobare admin dacă cererea depășește suplimentul profesorului (5p):
  - DB: sql/auth_schema.sql → escalate_course_resource_request, admin_approve_escalated_course_resource_request
  - UI: app/admin/resurse/page.tsx (approve escalated)

PROFESOR (10p)
• Creare cursuri + resurse/student (4p): app/profesor/cursuri/page.tsx (insert courses + course_resource_requirements)
• Afișare cursuri profesor (2p): app/profesor/cursuri/page.tsx (select courses)
• Încărcare materiale (2p): components/profesor/ProfesorCourseManageClient.tsx (upload storage bucket course-materials + insert course_materials)
• Aprobarea resurselor suplimentare (2p):
  - UI: ProfesorCourseManageClient.tsx → rpc("approve_course_resource_request") / rpc("reject_course_resource_request") / rpc("escalate_course_resource_request")
  - DB: sql/auth_schema.sql → funcțiile respective

JURNALIZARE (5p)
• Meniu doar audit (1p): components/AppTopNav.tsx (link /audit doar când isAudit)
• Jurnalizare (4p):
  - DB: sql/auth_schema.sql → audit_logs + funcția audit_log(...) + triggere trg_audit_* / trg_audit_generic
  - UI: app/audit/page.tsx
  - API page view: app/api/audit/view/route.ts

STATISTICI (15p)
• Pe student (2p): app/admin/statistici/page.tsx (view "student")
• Pe curs (5p): app/admin/statistici/page.tsx (view "course")
• La nivel universitate (8p): app/admin/statistici/page.tsx (view "university")
`.trim();

function ensureOutDir() {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
}

function renderPdf(text) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 54, bottom: 54, left: 54, right: 54 },
    bufferPages: true,
    info: {
      Title: "UniFlow - Dovada barem",
      Author: "UniFlow",
    },
  });

  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  doc.font("Helvetica");
  doc.fontSize(14).text("UniFlow — Dovada cerinte barem", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor("#555").text(`Generat: ${new Date().toLocaleString("ro-RO")}`);
  doc.moveDown(1);

  doc.fillColor("#000");
  doc.fontSize(10);
  doc.text(text.replace(/^UniFlow — Dovada cerinte barem \(fișier \+ funcție\/tabel\)\n\n?/m, ""), {
    align: "left",
    lineGap: 2,
  });

  // Footer with page numbers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const pageNumber = range.start + i + 1;
    doc.fontSize(9).fillColor("#777");
    doc.text(`Pagina ${pageNumber} / ${range.count}`, 54, doc.page.height - 40, {
      width: doc.page.width - 108,
      align: "right",
    });
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

await (async () => {
  ensureOutDir();
  await renderPdf(content);
  process.stdout.write(`OK: ${outPath}\n`);
})();

