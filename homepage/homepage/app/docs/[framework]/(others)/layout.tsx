import { Prose } from "gcmp-design-system/src/app/components/molecules/Prose";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Prose className="max-w-3xl mx-auto overflow-x-hidden lg:flex-1 py-8">
      {children}
    </Prose>
  );
}
