import {
  Account,
  CoRichText,
  Group,
  coOptionalDefiner,
} from "../../../internal.js";
import { AnonymousJazzAgent } from "../../anonymousJazzAgent.js";
import { CoOptionalSchema } from "./CoOptionalSchema.js";
import { CoreCoValueSchema } from "./CoValueSchema.js";

export interface CoreRichTextSchema extends CoreCoValueSchema {
  builtin: "CoRichText";
}

export function createCoreCoRichTextSchema(): CoreRichTextSchema {
  return {
    collaborative: true as const,
    builtin: "CoRichText" as const,
  };
}

export class RichTextSchema implements CoreRichTextSchema {
  readonly collaborative = true as const;
  readonly builtin = "CoRichText" as const;

  constructor(private coValueClass: typeof CoRichText) {}

  create(
    text: string,
    options?: { owner: Account | Group } | Account | Group,
  ): CoRichText {
    return this.coValueClass.create(text, options);
  }

  load(
    id: string,
    options: { loadAs: Account | AnonymousJazzAgent },
  ): Promise<CoRichText | null> {
    return this.coValueClass.load(id, options);
  }

  subscribe(
    id: string,
    options: { loadAs: Account | AnonymousJazzAgent },
    listener: (value: CoRichText, unsubscribe: () => void) => void,
  ): () => void;
  subscribe(
    id: string,
    listener: (value: CoRichText, unsubscribe: () => void) => void,
  ): () => void;
  subscribe(...args: [any, ...any[]]) {
    // @ts-expect-error
    return this.coValueClass.subscribe(...args);
  }

  getCoValueClass(): typeof CoRichText {
    return this.coValueClass;
  }

  optional(): CoOptionalSchema<this> {
    return coOptionalDefiner(this);
  }
}
