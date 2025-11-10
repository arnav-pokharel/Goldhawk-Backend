const swaggerJSDoc = require("swagger-jsdoc");
const { APP_NAME, BACKEND_URL } = require("../utils/appConfig");

const backendBase = (BACKEND_URL || "http://localhost:" + (process.env.PORT || 10000)).replace(/\/$/, "");

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: `${APP_NAME} Founder API`,
            version: "1.0.0",
            description: `API documentation for ${APP_NAME} Founder endpoints`,
        },
        servers: [
            {
                url: `${backendBase}/api`,
                description: 'Backend server',
            },
        ],
    },
    apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
