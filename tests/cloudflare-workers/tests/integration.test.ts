import { execa } from "execa";
import { expect, test } from "vitest";

test("server responds with hello world", async () => {
  // Start the dev server
  const server = execa("pnpm", ["dev"], {
    cwd: process.cwd(),
    stderr: "inherit",
  });

  try {
    // Wait for server to be ready
    const url = await new Promise<URL>((resolve, reject) => {
      server.stdout?.on("data", (data) => {
        console.log(data.toString());
        if (data.toString().includes("Ready on http://localhost:")) {
          resolve(new URL(data.toString().split("Ready on ")[1].trim()));
        }
      });

      // Reject if server fails to start within 10 seconds
      setTimeout(() => {
        reject(new Error("Server failed to start within timeout"));
      }, 10000);
    });

    // Make request to server
    const response = await fetch(url);
    const data = await response.json();

    // Verify response
    expect(data).toEqual({ text: "Hello world!" });
  } finally {
    // Ensure server is killed even if test fails
    server.kill();
  }
});
