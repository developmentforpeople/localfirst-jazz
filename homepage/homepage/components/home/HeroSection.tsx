import CreateJazzApp from "@/components/home/CreateJazzApp.mdx";
import { H1 } from "gcmp-design-system/src/app/components/atoms/Headings";
import { Icon } from "gcmp-design-system/src/app/components/atoms/Icon";
import { CopyButton } from "gcmp-design-system/src/app/components/molecules/CodeGroup";
import { Prose } from "gcmp-design-system/src/app/components/molecules/Prose";
import { SectionHeader } from "gcmp-design-system/src/app/components/molecules/SectionHeader";
import Link from "next/link";

const features = [
  {
    title: "Instant updates",
    icon: "instant",
  },
  {
    title: "Real-time sync",
    icon: "devices",
  },
  {
    title: "Multiplayer",
    icon: "spatialPresence",
  },
  {
    title: "File uploads",
    icon: "upload",
  },
  {
    title: "Social features",
    icon: "social",
  },
  {
    title: "Permissions",
    icon: "permissions",
  },
  {
    title: "E2E encryption",
    icon: "encryption",
  },
  {
    title: "Authentication",
    icon: "auth",
  },
];

export function HeroSection() {
  return (
    <div className="container grid items-center gap-x-8 gap-y-10 py-12 md:py-16 lg:py-24 lg:gap-x-10 lg:grid-cols-3">
      <div className="flex flex-col justify-center gap-5 lg:col-span-2 lg:gap-8">
        <p className="uppercase text-blue tracking-widest text-sm font-medium dark:text-stone-400">
          Toolkit for cloud-synced local state
        </p>
        <H1>
          <span className="inline-block">Whip up an app.</span>
        </H1>

        <Prose size="lg" className="text-pretty max-w-2xl dark:text-stone-200">
          <p>
            Jazz lets you build with cloud-synced local state, completely
            replacing backends and databases. You'll ship better apps, much faster.
          </p>
          <p>
            Open source. Self-host or use{" "}
            <Link className="text-reset" href="/cloud">
              Jazz Cloud
            </Link>{" "}
            for an &ldquo;it just works&rdquo; DX.
          </p>
        </Prose>

        <div className="grid grid-cols-2 gap-2 max-w-3xl sm:grid-cols-4 sm:gap-4">
          {features.map(({ title, icon }) => (
            <div
              key={title}
              className="flex text-xs sm:text-sm gap-2 items-center"
            >
              <span className="text-blue p-1.5 rounded-lg bg-blue-50 dark:text-blue-500 dark:bg-stone-900">
                <Icon size="xs" name={icon} />
              </span>
              <p>{title}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="h-full pt-12 group grid md:grid-cols-2 items-center lg:grid-cols-1">
        <SectionHeader
          className="md:col-span-2 lg:sr-only"
          title="Get a Jazz app running in minutes."
        />
        <div className="  overflow-hidden sm:rounded-xl sm:border  h-full sm:px-8 sm:pt-6 bg-stone-50 dark:bg-stone-950">
          <div className="rounded-lg bg-white dark:bg-stone-925 sm:ring-4 ring-stone-400/20 sm:shadow-xl sm:shadow-blue/20 border relative sm:top-2 h-full w-full">
            <div className="py-4 flex items-center gap-2.5 px-6 border-b">
              <span className="rounded-full size-3 bg-stone-200 dark:bg-stone-900" />
              <span className="rounded-full size-3 bg-stone-200 dark:bg-stone-900" />
              <span className="rounded-full size-3 bg-stone-200 dark:bg-stone-900" />
              <CopyButton
                code="npx create-jazz-app@latest"
                size="md"
                className="mt-0.5 mr-0.5"
              />
            </div>
            <div className="p-3">
              <CreateJazzApp />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
