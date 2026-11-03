import { defineRailway, github, preserve, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "Thekapita";
export default defineRailway(() => {
  const Thekapita = service("Thekapita", {
    source: github("Amao-J/Thekapita", { branch: "main", checkSuites: false, rootDirectory: "/Backend" }),
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile", watchPatterns: ["requirements.txt", "src/**", "railway.toml", "Dockerfile"] },
    healthcheck: "/api/docs",
    healthcheckTimeout: 120,
    replicas: { "europe-west4-drams3a": 1 },
    domains: ["api.thekapita.com"],
    networking: { privateNetworkEndpoint: "thekapita" },
    env: { AWS_ACCESS_KEY_ID: preserve(), AWS_DEFAULT_REGION: preserve(), AWS_ENDPOINT_URL: preserve(), AWS_S3_BUCKET_NAME: preserve(), AWS_S3_ENDPOINT_URL: preserve(), AWS_S3_REGION_NAME: preserve(), AWS_SECRET_ACCESS_KEY: preserve(), AWS_STORAGE_BUCKET_NAME: preserve(), DATABASE_URL: preserve(), DJANGO_SECRET_KEY: preserve(), JWT_SIGNING_KEY: preserve(), PGDATA: preserve(), PGHOST: preserve() },
  });

  return project("profound-embrace", {
    variables: { managed: true },
    resources: [Thekapita],
  });
});
