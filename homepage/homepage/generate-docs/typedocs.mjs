import { Application } from "typedoc";
import { PACKAGES } from "./utils/config.mjs";

for (const { packageName, entryPoint, tsconfig, typedocOptions } of PACKAGES) {
  const app = await Application.bootstrapWithPlugins({
    entryPoints: [
      `../../packages/${packageName}/src/${entryPoint || "index.ts"}`,
    ],
    tsconfig: `../../packages/${packageName}/${tsconfig || "tsconfig.json"}`,
    sort: ["required-first"],
    groupOrder: ["Functions", "Classes", "TypeAliases", "Namespaces"],
    categoryOrder: [
      "CoValues",
      "Context & Hooks",
      "Context Creation",
      "Identity & Permissions",
      "Schema definition",
      "Abstract interfaces",
      "Media",
      "Auth Providers",
      "Invite Links",
      "Declaration",
      "Content",
      "Creation",
      "Subscription & Loading",
      "Collaboration",
      "Stringifying & Inspection",
      "Internals",
      "Type Helpers",
      "Other",
    ],
    defaultCategory: "Other",
    excludeInternal: true,
    categorizeByGroup: false,
    pretty: false,
    preserveWatchOutput: true,
    ...typedocOptions,
  });
  if (process.argv.includes("--build")) {
    const project = await app.convert();
    await app.generateJson(project, "typedoc/" + packageName + ".json");
    console.log(packageName + " done.");
  } else {
    app.convertAndWatch(async (project) => {
      await app.generateJson(project, "typedoc/" + packageName + ".json");
      console.log(packageName + " done.");
    });
  }
}
