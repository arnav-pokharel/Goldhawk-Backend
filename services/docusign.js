import docusign from "docusign-esign";
import fs from "fs";

export async function sendForSignature(pdfPath, email, name) {
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath("https://demo.docusign.net/restapi"); // sandbox
  apiClient.addDefaultHeader("Authorization", "Bearer " + process.env.DOCUSIGN_ACCESS_TOKEN);

  const envelopesApi = new docusign.EnvelopesApi(apiClient);
  const docBase64 = fs.readFileSync(pdfPath).toString("base64");

  const envDef = new docusign.EnvelopeDefinition();
  envDef.emailSubject = "Please sign the SAFE Agreement";
  envDef.documents = [
    { documentBase64: docBase64, name: "SAFE Agreement", fileExtension: "pdf", documentId: "1" }
  ];
  envDef.recipients = {
    signers: [
      {
        email,
        name,
        recipientId: "1",
        tabs: { signHereTabs: [{ anchorString: "SIGNATURE", anchorUnits: "pixels" }] }
      }
    ]
  };
  envDef.status = "sent";

  const results = await envelopesApi.createEnvelope(process.env.DOCUSIGN_ACCOUNT_ID, { envelopeDefinition: envDef });
  return results.envelopeId;
}
