/**
 * @file SingleNotice.ts
 * @overview Reuses one Obsidian notice for progress updates instead of stacking notices.
 */

/** Owns a single long-lived Obsidian notice and updates it in place. */
export class SingleNotice {
  private notice: InstanceType<typeof Notice> | null = null;
  private noticeElement: HTMLElement | null = null;

  /** Shows a new notice or replaces the current notice's message. */
  public setMessage(message: string): void {
    if (this.notice && this.noticeElement?.parentElement) {
      this.notice.setMessage(message);
      return;
    }

    this.notice = new Notice(message, 0);
    this.noticeElement = this.notice.containerEl ?? this.notice.noticeEl;
  }

  /** Hides the notice if it is currently attached. */
  public hide(): void {
    if (this.noticeElement?.parentElement) {
      this.notice?.hide();
    }
  }
}
