import { expect, it } from "vitest";
import { undoPastedBranch } from "../branchHistory";

it("stops after native insertion is undone, preserving every preceding element", async () => {
  let index = 0;
  const snapshots = [
    [{ id: "original" }, { id: "pasted" }, { id: "connector" }],
    [{ id: "original" }, { id: "pasted" }, { id: "connector" }],
    [{ id: "original" }, { id: "pasted" }],
    [{ id: "original" }],
    [],
  ];
  const api = {
    getSceneElements: () => snapshots[index]!,
    history: {
      undo: () => {
        index++;
      },
    },
  };
  expect(await undoPastedBranch(api, ["pasted"], () => Promise.resolve())).toBe(3);
  expect(api.getSceneElements()).toEqual([{ id: "original" }]);
});

it("waits for each native commit and handles multiple pasted roots", async () => {
  let scene = [{ id: "a" }, { id: "b" }];
  let scheduled = false;
  const api = {
    getSceneElements: () => scene,
    history: {
      undo: () => {
        scheduled = true;
      },
    },
  };
  const count = await undoPastedBranch(api, ["a", "b"], () => {
    if (scheduled) scene = scene.slice(1);
    scheduled = false;
    return Promise.resolve();
  });
  expect(count).toBe(2);
});

it("bounds retries when native history cannot remove the branch", async () => {
  const api = { getSceneElements: () => [{ id: "pasted" }], history: { undo: () => {} } };
  expect(await undoPastedBranch(api, ["pasted"], () => Promise.resolve())).toBe(64);
});
