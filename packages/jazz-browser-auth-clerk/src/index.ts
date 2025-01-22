import { AgentSecret } from "cojson";
import { AuthSecretStorage } from "jazz-browser";
import {
  Account,
  AuthCredentials,
  AuthenticateAccountFunction,
  ID,
} from "jazz-tools";

export type MinimalClerkClient = {
  user:
    | {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unsafeMetadata: Record<string, any>;
        fullName: string | null;
        username: string | null;
        id: string;
        update: (args: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          unsafeMetadata: Record<string, any>;
        }) => Promise<unknown>;
      }
    | null
    | undefined;
  signOut: () => Promise<void>;
};

type ClerkCredentials = {
  jazzAccountID: ID<Account>;
  jazzAccountSecret: AgentSecret;
  jazzAccountSeed?: number[];
};

export class BrowserClerkAuth {
  constructor(private authenticate: AuthenticateAccountFunction) {}

  onClerkUserChange = async (clerkClient: MinimalClerkClient) => {
    if (!clerkClient.user) return;

    const isAnonymous = AuthSecretStorage.isAnonymous();

    if (!isAnonymous) return;

    const clerkCredentials = clerkClient.user
      .unsafeMetadata as ClerkCredentials;

    if (!clerkCredentials.jazzAccountID) {
      await this.signIn(clerkClient);
    } else {
      await this.logIn(clerkClient);
    }

    await clerkClient.signOut();
  };

  logIn = async (clerkClient: MinimalClerkClient) => {
    if (!clerkClient.user) {
      throw new Error("Not signed in on Clerk");
    }

    const clerkCredentials = clerkClient.user
      .unsafeMetadata as ClerkCredentials;

    if (
      !clerkCredentials.jazzAccountID ||
      !clerkCredentials.jazzAccountSecret
    ) {
      throw new Error("No credentials found on Clerk");
    }

    const credentials = {
      accountID: clerkCredentials.jazzAccountID,
      accountSecret: clerkCredentials.jazzAccountSecret,
      secretSeed: clerkCredentials.jazzAccountSeed
        ? Uint8Array.from(clerkCredentials.jazzAccountSeed)
        : undefined,
      provider: "clerk",
    } satisfies AuthCredentials;

    await this.authenticate(credentials);

    AuthSecretStorage.set(credentials);
  };

  signIn = async (clerkClient: MinimalClerkClient) => {
    const credentials = AuthSecretStorage.get();

    if (!credentials) {
      throw new Error("No credentials found");
    }

    await clerkClient.user?.update({
      unsafeMetadata: {
        jazzAccountID: credentials.accountID,
        jazzAccountSecret: credentials.accountSecret,
        jazzAccountSeed: credentials.secretSeed
          ? Array.from(credentials.secretSeed)
          : undefined,
      } satisfies ClerkCredentials,
    });

    AuthSecretStorage.set({
      accountID: credentials.accountID,
      accountSecret: credentials.accountSecret,
      secretSeed: credentials.secretSeed,
      provider: "clerk",
    });
  };
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace BrowserClerkAuth {
  export interface Driver {
    onError: (error: string | Error) => void;
  }
}
