import fs from "fs";
import path from "path";
import { TableOfContents } from "@/components/docs/TableOfContents";
import { Framework, frameworks, isValidFramework } from "@/lib/framework";
import type { Toc } from "@stefanprobst/rehype-extract-toc";
import { Prose } from "gcmp-design-system/src/app/components/molecules/Prose";

function Error({ slugPath }: { slugPath: string }) {
  return (
    <Prose className="overflow-x-hidden lg:flex-1">
      <h3>Error loading page: {slugPath}</h3>
    </Prose>
  );
}

export default async function Page({
  params: { slug, framework },
}: { params: { slug: string[]; framework: string } }) {
  const slugPath = slug.join("/");

  // if the route ends in a framework name, return 404
  // because we want the framework name to be in /docs/[framework]/[...slug]
  if (isValidFramework(slug[slug.length - 1]))
    return <Error slugPath={slugPath} />;

  try {
    let mdxSource;
    try {
      mdxSource = await import(`./${slugPath}.mdx`);
    } catch (error) {
      console.log("Error loading MDX file:" + slugPath, error);
      mdxSource = await import(`./${slugPath}/${framework}.mdx`);
    }

    const { default: Content, tableOfContents } = mdxSource;

    return (
      <>
        <Prose className="overflow-x-hidden lg:flex-1  py-8">
          <Content />
        </Prose>
        {tableOfContents && <TableOfContents items={tableOfContents as Toc} />}
      </>
    );
  } catch (error) {
    console.error("Error loading MDX file:" + slugPath, error);
    return <Error slugPath={slugPath} />;
  }
}

// https://nextjs.org/docs/app/api-reference/functions/generate-static-params
export const dynamicParams = false;
export const dynamic = "force-static";

export async function generateStaticParams() {
  const docsDir = path.join(process.cwd(), "app/docs/[framework]/[...slug]");
  const getAllMdxPaths = (dir: string, basePath = ""): string[] => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const paths: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(basePath, entry.name);

      if (entry.isDirectory()) {
        paths.push(...getAllMdxPaths(fullPath, relativePath));
      } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
        paths.push(relativePath.replace(/\.mdx$/, ""));
      }
    }

    return paths;
  };

  const paths = getAllMdxPaths(docsDir).map((slug) => ({
    slug: slug.split("/"),
  }));

  return paths;
}
