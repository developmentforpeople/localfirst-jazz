import { getMdxWithToc } from "@/lib/docMdxContent";
import {
  OpenGraphImage,
  imageContentType,
  imageSize,
} from "@garden-co/design-system/src/components/organisms/OpenGraphImage";
export const title = "Quickstart";
export const size = imageSize;
export const contentType = imageContentType;
export const alt = "Quickstart";

export default async function Image({
  params,
}: {
  params: Promise<{ framework: string; topic: string; subtopic: string }>;
}) {
  const { framework, topic, subtopic } = await params;
  const { tocItems } = await getMdxWithToc(framework, [topic, subtopic]);

  const title = tocItems[0]?.value;

  if (!title) {
    throw new Error(
      `No title from tocItems in opengraph-image.tsx ${framework} ${topic} ${subtopic}`,
    );
  }

  return OpenGraphImage({
    title: title,
    framework,
    contents: tocItems[0]?.children?.map((child) => child.value) ?? [],
    topic,
    subtopic,
  });
}
