import { Group } from "../../../coValues/group.js";
import {
  ID,
  SubscribeListenerOptions,
  SubscribeRestArgs,
} from "../../../coValues/interfaces.js";
import {
  Account,
  RefsToResolve,
  RefsToResolveStrict,
  Resolved,
  ResolveQuery,
} from "../../../internal.js";
import { CoreCoValueSchema } from "./CoValueSchema.js";
import { coOptionalDefiner } from "../zodCo.js";
import { CoOptionalSchema } from "./CoOptionalSchema.js";

export interface CoreGroupSchema extends CoreCoValueSchema {
  builtin: "Group";
}

export function createCoreGroupSchema(): CoreGroupSchema {
  return {
    collaborative: true as const,
    builtin: "Group" as const,
  };
}

export class GroupSchema implements CoreGroupSchema {
  readonly collaborative = true as const;
  readonly builtin = "Group" as const;

  constructor(private coValueClass: typeof Group) {}

  getCoValueClass(): typeof Group {
    return this.coValueClass;
  }

  optional(): CoOptionalSchema<this> {
    return coOptionalDefiner(this);
  }

  create(options?: { owner: Account } | Account) {
    return this.coValueClass.create(options);
  }

  load<G extends Group, R extends ResolveQuery<GroupSchema>>(
    id: ID<G>,
    options?: {
      loadAs?: Account;
      resolve?: RefsToResolveStrict<Group, R>;
    },
  ): Promise<Group | null> {
    return this.coValueClass.load(id, options);
  }

  subscribe<G extends Group, const R extends RefsToResolve<G>>(
    id: ID<G>,
    listener: (value: Resolved<G, R>, unsubscribe: () => void) => void,
  ): () => void;
  subscribe<G extends Group, const R extends RefsToResolve<G>>(
    id: ID<G>,
    options: SubscribeListenerOptions<G, R>,
    listener: (value: Resolved<G, R>, unsubscribe: () => void) => void,
  ): () => void;
  subscribe<G extends Group, const R extends RefsToResolve<G>>(
    id: ID<G>,
    ...args: SubscribeRestArgs<G, R>
  ): () => void {
    // @ts-expect-error
    return this.coValueClass.subscribe<G, R>(id, ...args);
  }
}
