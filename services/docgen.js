import fs from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import libre from "libreoffice-convert";

export function generateDocx(templateName, values) {
  const content = fs.readFileSync(`./templates/${templateName}`, "binary");
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  doc.setData(values);
  doc.render();

  const outPath = `./generated/${templateName.replace(".docx", "_filled.docx")}`;
  const buf = doc.getZip().generate({ type: "nodebuffer" });
  fs.writeFileSync(outPath, buf);

  return outPath;
}

export async function convertToPdf(inputPath) {
  const file = fs.readFileSync(inputPath);
  return new Promise((resolve, reject) => {
    libre.convert(file, ".pdf", undefined, (err, done) => {
      if (err) return reject(err);
      const outPath = inputPath.replace(".docx", ".pdf");
      fs.writeFileSync(outPath, done);
      resolve(outPath);
    });
  });
}
