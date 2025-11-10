// swagger.js
const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const { APP_NAME, BACKEND_URL } = require("./utils/appConfig");

const backendBase = (BACKEND_URL || "").replace(/\/$/, "");

const options = {
  definition: {
    openapi: "3.0.0", // OpenAPI version
    info: {
      title: `${APP_NAME} API Docs`, // Title for docs
      version: "1.0.0",
      description: `API documentation for ${APP_NAME} backend`,
    },
    servers: [
      {
        url: `${backendBase || ""}/api`, // backend base URL
      },
    ],
  },
  apis: ["./routes/**/*.js"], // path to your route files, now includes subdirectories
};

const swaggerSpec = swaggerJSDoc(options);

function swaggerDocs(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  const docsUrl = backendBase ? `${backendBase}/api-docs` : "/api-docs";
  console.log(`📄 Swagger Docs available at: ${docsUrl}`);
}

module.exports = swaggerDocs;
