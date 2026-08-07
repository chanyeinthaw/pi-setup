import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { renderSystemdUserService } from "../src/service/systemd.ts";

describe("systemd user service", () => {
  it.effect("runs the compiled binary in daemon mode and restarts on failure", () =>
    Effect.sync(() => {
      const unit = renderSystemdUserService({
        executable: "/home/chan/.local/bin/subagents",
        path: "/home/chan/.local/share/mise/installs/bun/1.3.14/bin:/usr/bin",
      });
      assert.match(unit, /^\[Unit\]/);
      assert.match(unit, /ExecStart=\/home\/chan\/\.local\/bin\/subagents daemon run/);
      assert.notMatch(unit, /WorkingDirectory=/);
      assert.match(unit, /Restart=on-failure/);
      assert.match(
        unit,
        /Environment="PATH=\/home\/chan\/\.local\/share\/mise\/installs\/bun\/1\.3\.14\/bin:\/usr\/bin"/,
      );
      assert.match(unit, /WantedBy=default\.target/);
    }),
  );
});
