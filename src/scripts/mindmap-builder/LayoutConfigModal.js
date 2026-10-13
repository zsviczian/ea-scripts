/**
 * @file LayoutConfigModal.js
 * @overview Layout Config Modal implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createLayoutConfigModal(runtimeContext) {
  // ---------------------------------------------------------------------------
  // 9. Layout Configuration Manager
  // ---------------------------------------------------------------------------
  class LayoutConfigModal extends runtimeContext.ea.FloatingModal {
    constructor(app, currentSettings, onUpdate) {
      super(app);
      this.settings = this.normalizeSettings(currentSettings);
      this.onUpdate = onUpdate;
      this.updateTimer = null;
      this.focusRefreshHandler = (evt) => this.handleFocusRefresh(evt);
      this.focusDoc = null;
    }
    normalizeSettings(settingsLike) {
      const normalized = {};
      Object.keys(runtimeContext.LAYOUT_METADATA).forEach((key) => {
        const meta = runtimeContext.LAYOUT_METADATA[key];
        const candidate = settingsLike?.[key];
        normalized[key] =
          typeof candidate === "number" && Number.isFinite(candidate) ? candidate : meta.def;
      });
      return normalized;
    }
    onOpen() {
      this.display({
        preserveSectionState: false,
      });
      this.focusDoc = this.contentEl?.ownerDocument ?? document;
      this.focusDoc.addEventListener("focusin", this.focusRefreshHandler, true);
    }
    onClose() {
      if (this.focusDoc) {
        this.focusDoc.removeEventListener("focusin", this.focusRefreshHandler, true);
        this.focusDoc = null;
      }
      if (this.updateTimer) clearTimeout(this.updateTimer);
      this.settings = this.normalizeSettings(this.settings);
      this.onUpdate(this.settings);
    }
    handleFocusRefresh(evt) {
      if (!runtimeContext.isViewSet()) {
        this.close();
        return;
      }
      if (
        !this.contentEl ||
        !(this.contentEl.contains(evt.target) || this.modalEl.contains(evt.target))
      )
        return;
      const sel = runtimeContext.getMindmapNodeFromSelection();
      if (!sel) return;
      const allElements = runtimeContext.ea.getViewElements();
      const settingsRoot = runtimeContext.getSettingsRootNode(sel, allElements) ?? sel;
      const rootCfg = runtimeContext.getRootConfigForNode(settingsRoot);
      const nextSettings = this.normalizeSettings(rootCfg?.layoutSettings);
      if (!nextSettings) return;
      const currentSig = JSON.stringify(this.settings);
      const nextSig = JSON.stringify(nextSettings);
      if (currentSig === nextSig) return;
      this.settings = nextSettings;
      this.display({
        preserveSectionState: true,
      });
    }
    triggerUpdate() {
      if (this.updateTimer) clearTimeout(this.updateTimer);
      this.updateTimer = setTimeout(() => {
        this.settings = this.normalizeSettings(this.settings);
        this.onUpdate(this.settings);
        this.updateTimer = null;
      }, 500);
    }
    display({ preserveSectionState = true } = {}) {
      const { contentEl } = this;
      let lastScrollPosition = 0;
      const previousSectionState = {};
      const existingContainer = contentEl.querySelector(".layout-settings-container");
      if (existingContainer) {
        lastScrollPosition = existingContainer.scrollTop;
        if (preserveSectionState) {
          existingContainer
            .querySelectorAll("details[data-layout-section]")
            .forEach((detailsEl) => {
              const sectionKey = detailsEl.getAttribute("data-layout-section");
              if (sectionKey) previousSectionState[sectionKey] = detailsEl.open;
            });
        }
      }
      contentEl.empty();
      contentEl.createEl("h2", {
        text: runtimeContext.t("MODAL_LAYOUT_TITLE"),
      });
      const container = contentEl.createDiv();
      container.addClass("layout-settings-container");
      container.style.maxHeight = "70vh";
      container.style.overflowY = "auto";
      container.style.paddingRight = "10px";
      const groupedKeys = {};
      Object.keys(runtimeContext.LAYOUT_METADATA).forEach((key) => {
        const section = runtimeContext.LAYOUT_METADATA[key].section;
        if (!groupedKeys[section]) groupedKeys[section] = [];
        groupedKeys[section].push(key);
      });
      const renderSection = (sectionKey, title) => {
        if (!groupedKeys[sectionKey]) return;
        const details = container.createEl("details", {
          attr: {
            "data-layout-section": sectionKey,
          },
        });
        details.open = preserveSectionState ? (previousSectionState[sectionKey] ?? false) : false;
        details.style.marginBottom = "10px";
        details.style.border = "1px solid var(--background-modifier-border)";
        details.style.borderRadius = "5px";
        const summary = details.createEl("summary");
        summary.style.padding = "10px";
        summary.style.fontWeight = "bold";
        summary.style.cursor = "pointer";
        summary.style.backgroundColor = "var(--background-secondary)";
        summary.innerText = title;
        const content = details.createDiv();
        content.style.padding = "10px";
        groupedKeys[sectionKey].forEach((key) => {
          const meta = runtimeContext.LAYOUT_METADATA[key];
          const setting = new runtimeContext.ea.obsidian.Setting(content)
            .setName(meta.name)
            .setDesc(meta.desc);
          let valLabel;
          let resetButtonComp;
          const updateResetButton = (val) => {
            if (!resetButtonComp) return;
            const isModified = Math.abs(val - meta.def) > 0.0001;
            const el = resetButtonComp.extraSettingsEl;
            el.style.opacity = isModified ? "1" : "0";
            el.style.pointerEvents = isModified ? "auto" : "none";
            el.style.cursor = isModified ? "pointer" : "default";
            if (isModified) el.setAttribute("tabindex", "0");
            else el.setAttribute("tabindex", "-1");
          };
          setting.addSlider((slider) =>
            slider
              .setLimits(meta.min, meta.max, meta.step)
              .setValue(this.settings[key] ?? meta.def)
              .onChange((value) => {
                this.settings[key] = value;
                valLabel.setText(String(value.toFixed(meta.step < 1 ? 1 : 0)));
                updateResetButton(value);
                this.triggerUpdate();
              }),
          );
          setting.settingEl.createDiv("", (el) => {
            valLabel = el;
            el.style.minWidth = "3em";
            el.style.textAlign = "right";
            el.innerText = String(this.settings[key].toFixed(meta.step < 1 ? 1 : 0));
          });
          setting.addExtraButton((btn) => {
            resetButtonComp = btn;
            btn
              .setIcon("rotate-ccw")
              .setTooltip(runtimeContext.t("TOOLTIP_RESET_TO_DEFAULT"))
              .onClick(() => {
                this.settings[key] = meta.def;
                this.triggerUpdate();
                this.display();
              });
            updateResetButton(this.settings[key]);
          });
        });
      };
      // Render Sections in Order
      renderSection("SECTION_GENERAL", runtimeContext.t("SECTION_GENERAL"));
      renderSection("SECTION_RADIAL", runtimeContext.t("SECTION_RADIAL"));
      renderSection("SECTION_DIRECTIONAL", runtimeContext.t("SECTION_DIRECTIONAL"));
      renderSection("SECTION_VERTICAL", runtimeContext.t("SECTION_VERTICAL"));
      renderSection("SECTION_VISUALS", runtimeContext.t("SECTION_VISUALS"));
      renderSection("SECTION_MANUAL", runtimeContext.t("SECTION_MANUAL"));
      const footer = contentEl.createDiv();
      footer.style.marginTop = "20px";
      footer.style.display = "flex";
      footer.style.justifyContent = "space-between";
      new runtimeContext.ea.obsidian.Setting(footer)
        .addButton((btn) =>
          btn
            .setButtonText(runtimeContext.t("LAYOUT_RESET"))
            .setWarning()
            .onClick(() => {
              Object.keys(runtimeContext.LAYOUT_METADATA).forEach((k) => {
                this.settings[k] = runtimeContext.LAYOUT_METADATA[k].def;
              });
              this.triggerUpdate();
              this.display();
            }),
        )
        .addButton((btn) =>
          btn
            .setButtonText(runtimeContext.t("LAYOUT_SAVE"))
            .setCta()
            .onClick(() => {
              if (this.updateTimer) clearTimeout(this.updateTimer);
              this.onUpdate(this.settings);
              this.close();
            }),
        );
      container.scrollTop = lastScrollPosition;
    }
  }
  return { LayoutConfigModal };
}
