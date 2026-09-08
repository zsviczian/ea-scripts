import { beforeEach, describe, expect, it } from "vitest";

import { openConfirmationModal } from "../confirmationModal";

class FakeElement {
  public text = "";
  public readonly children: FakeElement[] = [];
  public readonly style: Record<string, string> = {};

  public setText(text: string): void {
    this.text = text;
  }

  public createEl(_tag: string, options?: { text?: string }): FakeElement {
    const child = new FakeElement();
    child.text = options?.text ?? "";
    this.children.push(child);
    return child;
  }

  public createDiv(): FakeElement {
    const child = new FakeElement();
    this.children.push(child);
    return child;
  }

  public empty(): void {
    this.children.length = 0;
  }
}

class FakeModal {
  public static instances: FakeModal[] = [];
  public readonly titleEl = new FakeElement();
  public readonly contentEl = new FakeElement();
  public onClose: () => void = () => undefined;

  public constructor() {
    FakeModal.instances.push(this);
  }

  public open(): void {}

  public close(): void {
    this.onClose();
  }
}

class FakeButtonComponent {
  public static instances: FakeButtonComponent[] = [];
  public readonly buttonEl = { focus: () => undefined };
  public text = "";
  private clickHandler: () => void = () => undefined;

  public constructor() {
    FakeButtonComponent.instances.push(this);
  }

  public setButtonText(text: string): this {
    this.text = text;
    return this;
  }

  public setCta(): this {
    return this;
  }

  public onClick(handler: () => void): this {
    this.clickHandler = handler;
    return this;
  }

  public click(): void {
    this.clickHandler();
  }
}

function createEa(): ExcalidrawAutomate {
  return {
    obsidian: {
      Modal: FakeModal,
      ButtonComponent: FakeButtonComponent,
    },
  } as unknown as ExcalidrawAutomate;
}

describe("openConfirmationModal", () => {
  beforeEach(() => {
    FakeModal.instances = [];
    FakeButtonComponent.instances = [];
  });

  it("resolves true when the confirm button is clicked", async () => {
    const result = openConfirmationModal(createEa(), {} as never, {
      title: "Remove presentation",
      message: "Remove slideshow metadata?",
      confirmText: "Remove presentation",
      cancelText: "Cancel",
    });

    expect(FakeModal.instances[0]?.titleEl.text).toBe("Remove presentation");
    expect(FakeButtonComponent.instances.map((button) => button.text)).toEqual([
      "Cancel",
      "Remove presentation",
    ]);
    FakeButtonComponent.instances[1]?.click();
    await expect(result).resolves.toBe(true);
  });

  it("resolves false when cancelled or closed", async () => {
    const cancelled = openConfirmationModal(createEa(), {} as never, {
      message: "Continue?",
      confirmText: "Yes",
      cancelText: "No",
    });
    FakeButtonComponent.instances[0]?.click();
    await expect(cancelled).resolves.toBe(false);

    const closed = openConfirmationModal(createEa(), {} as never, {
      message: "Continue?",
      confirmText: "Yes",
      cancelText: "No",
    });
    FakeModal.instances.at(-1)?.close();
    await expect(closed).resolves.toBe(false);
  });
});
